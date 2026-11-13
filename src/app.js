import { createSidebar } from './components/sidebar.js';
import { createChatArea } from './components/chatArea.js';
import { createConversationSearchPage } from './components/conversationSearch.js';
import { storage } from './storage/index.js';
import { createModelManagerPage } from './models/modelManager.js';
import { createSettingsPage } from './settings/settingsPage.js';
import {
  createChangePinPage,
  createProfileDeletePage,
  createProfilePickerPage,
  createPinLockPage,
  createProfileSetupPage,
  getLocalProfile,
  getLocalProfiles,
  getProfileStorageKey,
  deleteLocalProfile,
  setActiveProfileId,
} from './profile.js';

export function App() {
  const app = document.createElement('div');
  app.className = 'app-shell';

  const toast = document.createElement('div');
  toast.className = 'app-toast';
  toast.setAttribute('role', 'status');
  let workspaceNodes;

  function showNotice(message, type = 'info') {
    toast.textContent = message;
    toast.className = `app-toast visible ${type}`;
    window.clearTimeout(showNotice.timer);
    showNotice.timer = window.setTimeout(() => toast.classList.remove('visible'), 4500);
  }

  window.addEventListener('floro-notice', (event) => {
    showNotice(event.detail?.message || '', event.detail?.type || 'info');
  });

  async function activateProfile(profile) {
    setActiveProfileId(profile.id);
    const defaultModelKey = getProfileStorageKey('default-model', profile.id);
    const defaultModelSeedKey = getProfileStorageKey('gemma-default-seeded', profile.id);
    if (localStorage.getItem(defaultModelSeedKey) !== '1') {
      localStorage.setItem(defaultModelKey, JSON.stringify({ provider: 'ollama', model: 'gemma3:1b' }));
      localStorage.setItem(defaultModelSeedKey, '1');
    }
    await storage.assignUnownedConversations(profile.id);
    workspaceNodes = null;
    mountWorkspace();
  }

  function showProfileSetup(resetPinProfile = null, canCancel = false) {
    app.replaceChildren(createProfileSetupPage({
      resetPinProfile,
      onComplete: activateProfile,
      onCancel: resetPinProfile || canCancel ? showProfilePicker : undefined,
    }));
  }

  function showProfileDeletion(profile, onCancel = showProfilePicker) {
    app.replaceChildren(createProfileDeletePage(profile, {
      onCancel,
      onDelete: async (target) => {
        await storage.deleteAllConversationsForProfile(target.id);
        const remainingProfiles = deleteLocalProfile(target.id);
        if (remainingProfiles.length) showProfilePicker();
        else showProfileSetup();
      },
    }));
  }

  function showProfilePicker() {
    setActiveProfileId(null);
    const profiles = getLocalProfiles();
    if (!profiles.length) {
      showProfileSetup();
      return;
    }
    app.replaceChildren(createProfilePickerPage(profiles, {
      onSelect: showPinLock,
      onCreate: () => showProfileSetup(null, true),
      onDelete: showProfileDeletion,
    }));
  }

  function showPinLock(profile) {
    app.replaceChildren(createPinLockPage(profile, {
      onUnlock: activateProfile,
      onResetPin: (selectedProfile) => showProfileSetup(selectedProfile),
      onSwitchUser: showProfilePicker,
    }));
  }

  function mountWorkspace() {
    const sidebar = createSidebar({ profile: getLocalProfile() });
    const chatArea = createChatArea();
    const pageCache = new Map();
    app.className = 'app-shell';
    workspaceNodes = [sidebar, chatArea, toast];
    app.replaceChildren(...workspaceNodes);

    function openPage(pageName) {
      if (pageName === 'model-store') {
        if (!pageCache.has(pageName)) pageCache.set(pageName, createModelManagerPage('store'));
        chatArea.showPage(pageCache.get(pageName));
      } else if (pageName === 'my-models') {
        if (!pageCache.has(pageName)) pageCache.set(pageName, createModelManagerPage('my-models'));
        chatArea.showPage(pageCache.get(pageName));
      } else if (pageName === 'search') {
        chatArea.showPage(createConversationSearchPage({
          onSelect: (conversationId) => sidebar.openConversation(conversationId),
        }));
      } else if (pageName === 'settings') {
        if (!pageCache.has(pageName)) {
          pageCache.set(pageName, createSettingsPage({
            onLogout: () => {
              if (chatArea.isStreaming()) {
                showNotice('Wait for the current response to finish before logging out.', 'info');
              } else showProfilePicker();
            },
            onDelete: (profile) => {
              if (chatArea.isStreaming()) {
                showNotice('Wait for the current response to finish before deleting this profile.', 'info');
              } else showProfileDeletion(profile, () => openPage('settings'));
            },
            onChangePin: (profile) => chatArea.showPage(createChangePinPage(profile, {
              onComplete: () => openPage('settings'),
              onCancel: () => openPage('settings'),
            })),
            onProfileUpdated: (updatedProfile) => {
              chatArea.updateProfile(updatedProfile);
              sidebar.updateProfile(updatedProfile);
            },
          }));
        }
        chatArea.showPage(pageCache.get(pageName));
      } else if (pageName === 'new-chat') {
        chatArea.showChat();
      } else {
        showNotice('This page is not available in this build.', 'info');
      }
    }

    sidebar.addEventListener('conversation-selected', async (event) => {
      const conversationId = event.detail?.conversationId;
      if (!conversationId) return;
      const conversations = await storage.getConversations();
      const selected = conversations.find((conversation) => conversation.id === conversationId);
      if (selected) {
        chatArea.showChat();
        chatArea.setCurrentConversation(selected);
      }
    });
    sidebar.addEventListener('navigation-requested', (event) => openPage(event.detail?.page));
    sidebar.addEventListener('profile-switch-requested', () => {
      if (chatArea.isStreaming()) {
        showNotice('Wait for the current response to finish before switching profiles.', 'info');
      } else showProfilePicker();
    });
    sidebar.addEventListener('logout-requested', () => {
      if (chatArea.isStreaming()) {
        showNotice('Wait for the current response to finish before logging out.', 'info');
      } else showProfilePicker();
    });
    chatArea.addEventListener('sidebar-toggle-requested', () => sidebar.toggleOpen());

    async function init() {
      const chats = await storage.getConversations();
      if (!chats.length) {
        const created = await storage.createConversation('Welcome conversation');
        chatArea.setCurrentConversation(created);
      } else {
        chatArea.setCurrentConversation(chats[0]);
      }
      sidebar.render();
    }

    init().catch((error) => showNotice(error.message || 'Could not load local chat history.', 'error'));
  }

  const profiles = getLocalProfiles();
  if (profiles.length) {
    storage.assignUnownedConversations(profiles[0].id)
      .then(showProfilePicker)
      .catch((error) => {
        const message = document.createElement('p');
        message.className = 'local-gate-message';
        message.textContent = error.message || 'Could not prepare local chat history.';
        app.replaceChildren(message);
      });
  } else {
    showProfileSetup();
  }

  return app;
}
