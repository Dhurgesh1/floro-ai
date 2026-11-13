import { storage } from '../storage/index.js';
import { Icon } from './icons.js';

export function createSidebar() {
  const root = document.createElement('aside');
  root.className = 'sidebar';

  const state = { open: true, conversations: [], selectedId: null };

  const renderBrand = () => {
    const brandWrap = document.createElement('div');
    brandWrap.className = 'sidebar-header';

    const brand = document.createElement('div');
    brand.className = 'brand';
    const logo = document.createElement('img');
    logo.src = '/Floro.png';
    logo.alt = 'Floro AI';
    logo.className = 'brand-mark';
    const title = document.createElement('div');
    title.className = 'brand-name';
    title.textContent = 'Floro AI';
    brand.appendChild(logo);
    brand.appendChild(title);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'icon-button';
    toggle.appendChild(Icon({ name: 'menu', size: 16 }));
    toggle.addEventListener('click', () => {
      state.open = !state.open;
      root.classList.toggle('collapsed', !state.open);
    });

    brandWrap.appendChild(brand);
    brandWrap.appendChild(toggle);
    return brandWrap;
  };

  const navItems = [
    { id: 'new-chat', label: 'New Chat', icon: 'plus' },
    { id: 'search', label: 'Search Conversations', icon: 'search' },
    { id: 'library', label: 'Library', icon: 'library' },
    { id: 'model-store', label: 'Model Store', icon: 'spark' },
    { id: 'my-models', label: 'My Models', icon: 'folder' },
    { id: 'projects', label: 'Projects', icon: 'folder' },
    { id: 'settings', label: 'Settings', icon: 'settings' },
    { id: 'account', label: 'Account', icon: 'settings' },
  ];

  const nav = document.createElement('nav');
  nav.className = 'nav';
  navItems.forEach((item) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nav-button';
    btn.innerHTML = `<span>${item.label}</span>`;
    btn.prepend(Icon({ name: item.icon, size: 18 }));
    btn.addEventListener('click', async () => {
      if (item.id === 'new-chat') {
        storage.createConversation('New conversation').then((conversation) => {
          state.conversations = [conversation, ...state.conversations];
          renderList();
          root.dispatchEvent(new CustomEvent('conversation-selected', { detail: { conversationId: conversation.id } }));
        });
      } else {
        root.dispatchEvent(new CustomEvent('navigation-requested', { detail: { page: item.id } }));
      }
    });
    nav.appendChild(btn);
  });

  const section = document.createElement('div');
  section.className = 'sidebar-section';
  const heading = document.createElement('div');
  heading.className = 'section-heading';
  heading.textContent = 'Recent Conversations';
  section.appendChild(heading);

  const list = document.createElement('ul');
  list.className = 'conversation-list';
  section.appendChild(list);

  root.appendChild(renderBrand());
  root.appendChild(nav);
  root.appendChild(section);

  function renderList() {
    list.innerHTML = '';
    if (!state.conversations.length) {
      const item = document.createElement('li');
      item.className = 'empty-state';
      item.textContent = 'No saved chats';
      list.appendChild(item);
      return;
    }
    state.conversations.forEach((conversation) => {
      const item = document.createElement('li');
      item.className = 'conversation-item';
      if (state.selectedId === conversation.id) item.classList.add('active');
      const main = document.createElement('div');
      main.className = 'conversation-main';
      const title = document.createElement('div');
      title.className = 'conversation-title';
      title.textContent = conversation.title || 'Untitled conversation';
      const actions = document.createElement('div');
      actions.className = 'item-actions';
      const star = document.createElement('button');
      star.type = 'button';
      star.className = 'icon-button';
      star.style.width = '28px';
      star.style.height = '28px';
      star.appendChild(Icon({ name: 'pin', size: 12 }));
      star.addEventListener('click', () => {
        storage.updateConversation(conversation.id, { pinned: !conversation.pinned }).then(() => render());
      });
      const trash = document.createElement('button');
      trash.type = 'button';
      trash.className = 'icon-button';
      trash.style.width = '28px';
      trash.style.height = '28px';
      trash.appendChild(Icon({ name: 'trash', size: 12 }));
      item.addEventListener('click', () => {
        state.selectedId = conversation.id;
        renderList();
        root.dispatchEvent(new CustomEvent('conversation-selected', { detail: { conversationId: conversation.id } }));
      });
      trash.addEventListener('click', (event) => {
        event.stopPropagation();
        if (confirm('Delete this conversation?')) {
          storage.deleteConversation(conversation.id).then(() => {
            state.conversations = state.conversations.filter((item) => item.id !== conversation.id);
            if (state.selectedId === conversation.id) state.selectedId = null;
            renderList();
            root.dispatchEvent(new CustomEvent('conversation-deleted', { detail: { conversationId: conversation.id } }));
          });
        }
      });
      actions.appendChild(star);
      actions.appendChild(trash);
      main.appendChild(title);
      item.appendChild(main);
      item.appendChild(actions);
      list.appendChild(item);
    });
  }

  async function render() {
    state.conversations = await storage.getConversations();
    renderList();
  }

  root.render = render;
  render();
  return root;
}
