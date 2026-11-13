import { supabase } from '../supabase.js';
import { storage } from '../storage/index.js';

const SYNC_DEBOUNCE_MS = 1800;
const MAX_RETRY_MS = 60000;
const SYNC_CONFLICTS_KEY = 'floro:sync-conflicts';
const CONVERSATION_SYNC_STATE_KEY = 'floro:conversation-sync-state';
let syncTimer;
let activeUserId;
let syncing = false;
let cloudSyncEnabled = false;
let retryCount = 0;

function notify(message, type = 'info') {
  window.dispatchEvent(new CustomEvent('floro-notice', { detail: { message, type } }));
}

function getLocalPreferences() {
  let preferences = {};
  let modelLabels = {};
  let defaultModel = null;
  try { preferences = JSON.parse(localStorage.getItem('floro:preferences') || '{}'); } catch {}
  try { modelLabels = JSON.parse(localStorage.getItem('floro:model-labels') || '{}'); } catch {}
  try { defaultModel = JSON.parse(localStorage.getItem('floro:default-model') || 'null'); } catch {}
  return { ...preferences, modelLabels, defaultModel };
}

function userProfile(user) {
  const metadata = user.user_metadata || {};
  return {
    id: user.id,
    email: user.email || null,
    display_name: metadata.full_name || metadata.name || metadata.display_name || user.email?.split('@')[0] || 'Floro user',
    avatar_url: metadata.avatar_url || metadata.picture || null,
    updated_at: new Date().toISOString(),
  };
}

export async function saveUserProfile(user) {
  if (!supabase || !user) return;
  const { error } = await supabase.from('user_profiles').upsert(userProfile(user), { onConflict: 'id' });
  if (error) throw error;
}

async function duplicateConflictingConversation(conversation) {
  const id = crypto.randomUUID();
  return {
    ...conversation,
    id,
    title: `${conversation.title || 'Conversation'} (local copy)`,
    messages: (conversation.messages || []).map((message) => ({ ...message, id: crypto.randomUUID() })),
    updatedAt: new Date().toISOString(),
  };
}

export async function syncLocalConversations({ conflictPolicy = 'preserve-both' } = {}) {
  if (!supabase || !activeUserId) throw new Error('Sign in with a configured Supabase project before syncing.');
  if (syncing) return { synced: 0 };
  syncing = true;
  try {
    const deletedConversationIds = JSON.parse(localStorage.getItem('floro:deleted-conversations') || '[]');
    if (deletedConversationIds.length) {
      const { error } = await supabase.from('conversations').delete().eq('user_id', activeUserId).in('id', deletedConversationIds);
      if (error) throw error;
      localStorage.removeItem('floro:deleted-conversations');
    }

    const deletedProjectIds = JSON.parse(localStorage.getItem('floro:deleted-projects') || '[]');
    if (deletedProjectIds.length) {
      const { error } = await supabase.from('projects').delete().eq('user_id', activeUserId).in('id', deletedProjectIds);
      if (error) throw error;
      localStorage.removeItem('floro:deleted-projects');
    }

    const localProjects = JSON.parse(window.localStorage.getItem('floro:projects') || '[]');
    if (Array.isArray(localProjects) && localProjects.length) {
      const { data: remoteProjects, error: projectsError } = await supabase
        .from('projects')
        .select('id,updated_at')
        .eq('user_id', activeUserId);
      if (projectsError) throw projectsError;
      const remoteProjectsById = new Map((remoteProjects || []).map((project) => [project.id, project]));
      const missingProjects = localProjects
        .filter((project) => !remoteProjectsById.has(project.id))
        .map((project) => ({
          id: project.id,
          user_id: activeUserId,
          name: project.name || 'Untitled project',
          created_at: project.createdAt || new Date().toISOString(),
          updated_at: project.updatedAt || new Date().toISOString(),
        }));
      if (missingProjects.length) {
        const { error } = await supabase.from('projects').insert(missingProjects);
        if (error) throw error;
      }
      const localProjectIdsToMark = new Set([
        ...missingProjects.map((project) => project.id),
        ...remoteProjectsById.keys(),
      ]);
      if (localProjectIdsToMark.size) {
        localStorage.setItem('floro:projects', JSON.stringify(localProjects.map((project) => (
          localProjectIdsToMark.has(project.id) ? { ...project, cloudUserId: activeUserId } : project
        ))));
      }
      for (const project of localProjects) {
        const remote = remoteProjectsById.get(project.id);
        if (remote && project.updatedAt && new Date(project.updatedAt) > new Date(remote.updated_at)) {
          const { error } = await supabase.from('projects').update({
            name: project.name || 'Untitled project',
            updated_at: project.updatedAt,
          }).eq('id', project.id).eq('user_id', activeUserId);
          if (error) throw error;
        }
      }
    }

    const localConversations = await storage.getConversations();
    const { data: remoteRows, error: fetchError } = await supabase
      .from('conversations')
      .select('id,title,updated_at,model,provider,pinned,folder_id')
      .eq('user_id', activeUserId);
    if (fetchError) throw fetchError;

    const remoteById = new Map((remoteRows || []).map((row) => [row.id, row]));
    let conflictMarkers = {};
    let syncState = {};
    try { conflictMarkers = JSON.parse(localStorage.getItem(SYNC_CONFLICTS_KEY) || '{}'); } catch {}
    try { syncState = JSON.parse(localStorage.getItem(CONVERSATION_SYNC_STATE_KEY) || '{}'); } catch {}
    let synced = 0;
    for (const original of localConversations) {
      let conversation = original;
      const remote = remoteById.get(conversation.id);
      const lastSyncedAt = syncState[conversation.id];
      if (!remote) {
        delete conflictMarkers[conversation.id];
        delete syncState[conversation.id];
      }
      if (remote && new Date(remote.updated_at).getTime() === new Date(conversation.updatedAt).getTime()) {
        syncState[conversation.id] = remote.updated_at;
        delete conflictMarkers[conversation.id];
        continue;
      }
      if (remote) {
        if (lastSyncedAt && remote.updated_at === lastSyncedAt) {
          delete conflictMarkers[conversation.id];
        } else if (lastSyncedAt && conversation.updatedAt === lastSyncedAt) {
          const { data: remoteMessages, error: remoteMessagesError } = await supabase
            .from('messages')
            .select('id,role,content,metadata,created_at')
            .eq('conversation_id', remote.id)
            .eq('user_id', activeUserId)
            .order('created_at', { ascending: true });
          if (remoteMessagesError) throw remoteMessagesError;
          await storage.replaceConversation({
            id: remote.id,
            title: remote.title,
            provider: remote.provider,
            model: remote.model,
            pinned: remote.pinned,
            folderId: remote.folder_id,
            createdAt: original.createdAt,
            updatedAt: remote.updated_at,
            messages: (remoteMessages || []).map((message) => ({
              id: message.id,
              role: message.role,
              content: message.content,
              createdAt: message.metadata?.createdAt || message.created_at,
            })),
          });
          syncState[conversation.id] = remote.updated_at;
          delete conflictMarkers[conversation.id];
          continue;
        } else if (conflictPolicy === 'preserve-both') {
          const marker = conflictMarkers[conversation.id];
          if (marker?.localUpdatedAt === conversation.updatedAt && marker?.remoteUpdatedAt === remote.updated_at) continue;
          conversation = await duplicateConflictingConversation(conversation);
          await storage.importConversation(conversation);
          conflictMarkers[original.id] = {
            localUpdatedAt: original.updatedAt,
            remoteUpdatedAt: remote.updated_at,
          };
          localStorage.setItem(SYNC_CONFLICTS_KEY, JSON.stringify(conflictMarkers));
          notify('A conversation conflict was preserved as a separate local copy.', 'info');
        } else if (conflictPolicy === 'prefer-cloud') {
          continue;
        }
      }

      const { error: conversationError } = await supabase.from('conversations').upsert({
        id: conversation.id,
        user_id: activeUserId,
        title: conversation.title || 'New conversation',
        provider: conversation.provider || 'automatic',
        model: conversation.model || null,
        pinned: Boolean(conversation.pinned),
        folder_id: conversation.folderId || null,
        created_at: conversation.createdAt,
        updated_at: conversation.updatedAt,
      }, { onConflict: 'id' });
      if (conversationError) throw conversationError;

      const messages = (conversation.messages || []).map((message) => ({
        id: message.id,
        conversation_id: conversation.id,
        user_id: activeUserId,
        role: message.role,
        content: message.content || '',
        metadata: { createdAt: message.createdAt, model: message.model || null },
        created_at: message.createdAt,
      }));
      if (messages.length) {
        const { error: messagesError } = await supabase.from('messages').upsert(messages, { onConflict: 'id' });
        if (messagesError) throw messagesError;
      }
      syncState[conversation.id] = conversation.updatedAt;
      synced += 1;
    }
    localStorage.setItem(SYNC_CONFLICTS_KEY, JSON.stringify(conflictMarkers));
    localStorage.setItem(CONVERSATION_SYNC_STATE_KEY, JSON.stringify(syncState));

    const localPreferences = getLocalPreferences();
    const localInstructions = window.localStorage.getItem('floro:custom-instructions') || '';
    const { data: remotePreferences, error: preferencesError } = await supabase
      .from('user_preferences')
      .select('user_id,updated_at')
      .eq('user_id', activeUserId)
      .maybeSingle();
    if (preferencesError) throw preferencesError;
    if (!remotePreferences) {
      const { error } = await supabase.from('user_preferences').insert({
        user_id: activeUserId,
        preferences: localPreferences,
        custom_instructions: localInstructions,
      });
      if (error) throw error;
    } else {
      const localUpdatedAt = localStorage.getItem('floro:preferences-updated-at');
      if (localUpdatedAt && new Date(localUpdatedAt) > new Date(remotePreferences.updated_at)) {
        const { error } = await supabase.from('user_preferences').update({
          preferences: localPreferences,
          custom_instructions: localInstructions,
          updated_at: localUpdatedAt,
        }).eq('user_id', activeUserId);
        if (error) throw error;
      }
    }

    window.localStorage.setItem('floro:last-sync', new Date().toISOString());
    window.localStorage.removeItem('floro:sync-error');
    retryCount = 0;
    notify(`Synced ${synced} conversation${synced === 1 ? '' : 's'}.`, 'success');
    return { synced };
  } catch (error) {
    window.localStorage.setItem('floro:sync-error', error.message || 'Cloud sync failed');
    notify(`Sync failed: ${error.message || 'Cloud sync failed'}`, 'error');
    throw error;
  } finally {
    syncing = false;
  }
}

export async function downloadCloudConversations() {
  if (!supabase || !activeUserId) throw new Error('Sign in before downloading cloud conversations.');
  const { data: rows, error } = await supabase
    .from('conversations')
    .select('id,title,provider,model,pinned,folder_id,created_at,updated_at')
    .eq('user_id', activeUserId)
    .order('updated_at', { ascending: false });
  if (error) throw error;

  let deletedConversationIds = [];
  try { deletedConversationIds = JSON.parse(localStorage.getItem('floro:deleted-conversations') || '[]'); } catch {}
  const deletedIds = new Set(deletedConversationIds);
  const remote = [];
  for (const row of rows || []) {
    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('id,role,content,metadata,created_at')
      .eq('conversation_id', row.id)
      .eq('user_id', activeUserId)
      .order('created_at', { ascending: true });
    if (messagesError) throw messagesError;
    remote.push({
      id: row.id,
      title: row.title,
      provider: row.provider,
      model: row.model,
      pinned: row.pinned,
      folderId: row.folder_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      messages: (messages || []).map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.metadata?.createdAt || message.created_at,
      })),
    });
  }
  const mergedCount = await storage.mergeRemoteConversations(remote.filter((conversation) => !deletedIds.has(conversation.id)));
  const { data: remoteProjects, error: projectError } = await supabase
    .from('projects')
    .select('id,name,created_at,updated_at')
    .eq('user_id', activeUserId);
  if (projectError) throw projectError;
  const localProjects = JSON.parse(window.localStorage.getItem('floro:projects') || '[]');
  const localProjectIds = new Set(Array.isArray(localProjects) ? localProjects.map((project) => project.id) : []);
  const newProjects = (remoteProjects || [])
    .filter((project) => !localProjectIds.has(project.id))
    .map((project) => ({ id: project.id, name: project.name, createdAt: project.created_at, updatedAt: project.updated_at, cloudUserId: activeUserId }));
  const allLocalProjects = [...(Array.isArray(localProjects) ? localProjects : []), ...newProjects];
  const remoteProjectIds = new Set((remoteProjects || []).map((project) => project.id));
  const locallySyncedProjects = allLocalProjects.filter((project) => (
    project.cloudUserId !== activeUserId || remoteProjectIds.has(project.id)
  ));
  if (locallySyncedProjects.length !== allLocalProjects.length || newProjects.length) {
    for (const project of allLocalProjects) {
      if (project.cloudUserId === activeUserId && !remoteProjectIds.has(project.id)) {
        const conversations = await storage.getConversations();
        for (const conversation of conversations.filter((item) => item.folderId === project.id)) {
          await storage.updateConversation(conversation.id, { folderId: null });
        }
      }
    }
    window.localStorage.setItem('floro:projects', JSON.stringify(locallySyncedProjects));
  }
  const { data: cloudPreferences, error: preferenceError } = await supabase
    .from('user_preferences')
    .select('preferences,custom_instructions,updated_at')
    .eq('user_id', activeUserId)
    .maybeSingle();
  if (preferenceError) throw preferenceError;
  const localPreferencesUpdatedAt = localStorage.getItem('floro:preferences-updated-at');
  if (cloudPreferences && (!localPreferencesUpdatedAt || new Date(cloudPreferences.updated_at) > new Date(localPreferencesUpdatedAt))) {
    const preferences = cloudPreferences.preferences || {};
    const localPreferences = getLocalPreferences();
    const localInstructions = localStorage.getItem('floro:custom-instructions') || '';
    const hasLocalSettings = Object.keys(localPreferences).some((key) => key !== 'modelLabels' && key !== 'defaultModel')
      || Object.keys(localPreferences.modelLabels || {}).length > 0
      || localPreferences.defaultModel !== null
      || Boolean(localInstructions.trim());
    if (hasLocalSettings && (
      JSON.stringify(localPreferences) !== JSON.stringify(preferences)
      || localInstructions !== (cloudPreferences.custom_instructions || '')
    )) {
      localStorage.setItem(`floro:sync-preference-backup:${activeUserId}`, JSON.stringify({
        preferences: localPreferences,
        customInstructions: localInstructions,
        updatedAt: localPreferencesUpdatedAt,
        savedAt: new Date().toISOString(),
      }));
      notify('Cloud settings were newer. Your previous local settings were saved on this device and can be restored in Account.', 'info');
    }
    const { modelLabels, defaultModel, ...otherPreferences } = preferences;
    localStorage.setItem('floro:preferences', JSON.stringify(otherPreferences));
    if (modelLabels) localStorage.setItem('floro:model-labels', JSON.stringify(modelLabels));
    if (defaultModel) localStorage.setItem('floro:default-model', JSON.stringify(defaultModel));
    localStorage.setItem('floro:custom-instructions', cloudPreferences.custom_instructions || '');
    localStorage.setItem('floro:preferences-updated-at', cloudPreferences.updated_at);
    window.dispatchEvent(new CustomEvent('floro-models-changed'));
  }
  return mergedCount;
}

export function bindCloudSync(user) {
  activeUserId = user?.id;
  cloudSyncEnabled = Boolean(user && localStorage.getItem(`floro:cloud-sync:${user.id}`) === 'enabled');
  if (!user || !supabase) return () => {};
  const schedule = (delay = SYNC_DEBOUNCE_MS) => {
    if (!cloudSyncEnabled || !navigator.onLine || syncing) return;
    window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(async () => {
      try {
        await syncLocalConversations();
      } catch {
        retryCount += 1;
        schedule(Math.min(SYNC_DEBOUNCE_MS * (2 ** retryCount), MAX_RETRY_MS));
      }
    }, delay);
  };
  window.addEventListener('floro-data-changed', schedule);
  window.addEventListener('online', schedule);
  return () => {
    window.clearTimeout(syncTimer);
    window.removeEventListener('floro-data-changed', schedule);
    window.removeEventListener('online', schedule);
    activeUserId = undefined;
  };
}

export function setCloudSyncEnabled(enabled) {
  if (!activeUserId) return;
  cloudSyncEnabled = Boolean(enabled);
  localStorage.setItem(`floro:cloud-sync:${activeUserId}`, enabled ? 'enabled' : 'disabled');
}

export async function getProfile() {
  if (!supabase || !activeUserId) return null;
  const { data, error } = await supabase.from('user_profiles').select('*').eq('id', activeUserId).maybeSingle();
  if (error) throw error;
  return data;
}
