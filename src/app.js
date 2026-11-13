import { createSidebar } from './components/sidebar.js';
import { createChatArea } from './components/chatArea.js';
import { storage } from './storage/index.js';
import { createModelManagerPage } from './models/modelManager.js';
import { createAuthPage } from './auth/authPage.js';
import { bindCloudSync, syncLocalConversations } from './auth/cloudSync.js';
import { createSettingsPage } from './settings/settingsPage.js';
import { createProjectsPage } from './projects/projectsPage.js';
import { supabase } from './supabase.js';

export function App() {
  const app = document.createElement('div');
  app.className = 'app-shell';

  const sidebar = createSidebar();
  const chatArea = createChatArea();
  let boundUserId;
  let stopCloudSync;
  let accountPage;
  const pageCache = new Map();
  const toast = document.createElement('div');
  toast.className = 'app-toast';
  toast.setAttribute('role', 'status');

  app.appendChild(sidebar);
  app.appendChild(chatArea);
  app.appendChild(toast);

  function showNotice(message, type = 'info') {
    toast.textContent = message;
    toast.className = `app-toast visible ${type}`;
    window.clearTimeout(showNotice.timer);
    showNotice.timer = window.setTimeout(() => toast.classList.remove('visible'), 4500);
  }

  window.addEventListener('floro-notice', (event) => showNotice(event.detail?.message || '', event.detail?.type || 'info'));

  async function onUserChanged(user) {
    if (user?.id === boundUserId) return;
    if (stopCloudSync) stopCloudSync();
    boundUserId = user?.id;
    if (!user) return;
    stopCloudSync = bindCloudSync(user);
    const promptKey = `floro:sync-offer:${user.id}`;
    if (!localStorage.getItem(promptKey)) {
      localStorage.setItem(promptKey, 'shown');
      const localConversations = await storage.getConversations();
      if (localConversations.some((conversation) => conversation.messages?.length)) {
        const shouldSync = confirm('Sync this device’s existing conversations to your Floro AI account? Local data is preserved; conflicting versions will remain separate.');
        if (shouldSync) {
          try {
            await syncLocalConversations({ conflictPolicy: 'preserve-both' });
            localStorage.setItem(`floro:cloud-sync:${user.id}`, 'enabled');
            stopCloudSync();
            stopCloudSync = bindCloudSync(user);
          } catch {}
        }
      }
    }
  }

  function openPage(pageName) {
    if (pageName === 'model-store') {
      if (!pageCache.has(pageName)) pageCache.set(pageName, createModelManagerPage('store'));
      chatArea.showPage(pageCache.get(pageName));
    } else if (pageName === 'my-models') {
      if (!pageCache.has(pageName)) pageCache.set(pageName, createModelManagerPage('my-models'));
      chatArea.showPage(pageCache.get(pageName));
    } else if (pageName === 'account') {
      if (!accountPage) accountPage = createAuthPage({ onUserChanged });
      chatArea.showPage(accountPage);
    } else if (pageName === 'settings') {
      if (!pageCache.has(pageName)) pageCache.set(pageName, createSettingsPage({ onNavigate: openPage }));
      chatArea.showPage(pageCache.get(pageName));
    } else if (pageName === 'projects') {
      if (!pageCache.has(pageName)) pageCache.set(pageName, createProjectsPage());
      chatArea.showPage(pageCache.get(pageName));
    } else if (pageName === 'new-chat') {
      chatArea.showChat();
    } else {
      showNotice(`${pageName === 'projects' ? 'Projects' : pageName === 'search' ? 'Conversation search' : 'Library'} is not available in this build.`, 'info');
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

  if (supabase) {
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) showNotice(error.message, 'error');
      if (data?.session?.user) onUserChanged(data.session.user);
    }).catch((error) => showNotice(error.message || 'Could not restore account session.', 'error'));
    supabase.auth.onAuthStateChange((_event, session) => {
      onUserChanged(session?.user || null).catch((error) => showNotice(error.message || 'Account sync setup failed.', 'error'));
    });
  }

  init();

  return app;
}
