import { storage } from '../storage/index.js';
import { Icon } from './icons.js';

export function createSidebar({ profile } = {}) {
  const root = document.createElement('aside');
  root.className = 'sidebar';

  const state = { open: true, conversations: [], selectedId: null };
  root.classList.add('open');

  const updateLogo = () => {
    const logo = root.querySelector('.brand-mark');
    if (logo) logo.src = state.open ? '/Floro-main.png' : '/Floro.png';
  };

  const renderBrand = () => {
    const brandWrap = document.createElement('div');
    brandWrap.className = 'sidebar-header';

    const brand = document.createElement('div');
    brand.className = 'brand';
    const logo = document.createElement('img');
    logo.src = '/Floro-main.png';
    logo.alt = 'Floro AI';
    logo.className = 'brand-mark';
    brand.appendChild(logo);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'icon-button';
    toggle.appendChild(Icon({ name: 'menu', size: 16 }));
    toggle.addEventListener('click', () => {
      if (window.matchMedia('(max-width: 900px)').matches) {
        state.open = !state.open;
        root.classList.remove('collapsed');
        root.classList.toggle('open', state.open);
      } else {
        state.open = !state.open;
        root.classList.toggle('collapsed', !state.open);
      }
      updateLogo();
    });

    brandWrap.appendChild(brand);
    brandWrap.appendChild(toggle);
    return brandWrap;
  };

  const navItems = [
    { id: 'new-chat', label: 'New Chat', icon: 'plus' },
    { id: 'search', label: 'Search Conversations', icon: 'search' },
    { id: 'model-store', label: 'Model Store', icon: 'spark' },
    { id: 'my-models', label: 'My Models', icon: 'folder' },
    { id: 'settings', label: 'Settings', icon: 'settings' },
  ];

  const nav = document.createElement('nav');
  nav.className = 'nav';
  navItems.forEach((item) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nav-button';
    btn.title = item.label;
    btn.setAttribute('aria-label', item.label);
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
      if (window.matchMedia('(max-width: 900px)').matches) {
        state.open = false;
        root.classList.remove('open');
        updateLogo();
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

  const profileSwitcher = document.createElement('button');
  profileSwitcher.type = 'button';
  profileSwitcher.className = 'sidebar-profile-switcher';
  profileSwitcher.setAttribute('aria-label', `Switch user. Current profile: ${profile?.name || 'Unknown'}`);
  const avatar = document.createElement('span');
  avatar.className = 'sidebar-profile-avatar';
  avatar.setAttribute('aria-hidden', 'true');
  avatar.appendChild(Icon({ name: 'user', size: 19 }));
  const profileDetails = document.createElement('span');
  profileDetails.className = 'sidebar-profile-details';
  const profileName = document.createElement('strong');
  profileName.textContent = profile?.name || 'Local profile';
  const profileLabel = document.createElement('small');
  profileLabel.textContent = 'Switch profile';
  profileDetails.append(profileName, profileLabel);
  const profileArrow = document.createElement('span');
  profileArrow.className = 'sidebar-profile-arrow';
  profileArrow.setAttribute('aria-hidden', 'true');
  profileArrow.appendChild(Icon({ name: 'chevron', size: 16 }));
  profileSwitcher.append(avatar, profileDetails, profileArrow);
  profileSwitcher.addEventListener('click', () => {
    root.dispatchEvent(new CustomEvent('profile-switch-requested'));
  });
  const logoutButton = document.createElement('button');
  logoutButton.type = 'button';
  logoutButton.className = 'sidebar-logout-button';
  logoutButton.setAttribute('aria-label', 'Log out of the current profile');
  logoutButton.append(Icon({ name: 'logout', size: 17 }));
  const logoutLabel = document.createElement('span');
  logoutLabel.textContent = 'Log out';
  logoutButton.appendChild(logoutLabel);
  logoutButton.addEventListener('click', () => {
    root.dispatchEvent(new CustomEvent('logout-requested'));
  });

  root.appendChild(renderBrand());
  root.appendChild(nav);
  root.appendChild(section);
  root.appendChild(profileSwitcher);
  root.appendChild(logoutButton);

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
      const conversationIcon = document.createElement('span');
      conversationIcon.className = 'conversation-chat-icon';
      conversationIcon.setAttribute('aria-hidden', 'true');
      conversationIcon.appendChild(Icon({ name: 'chat', size: 17 }));
      const title = document.createElement('div');
      title.className = 'conversation-title';
      title.textContent = conversation.title || 'Untitled conversation';
      item.title = title.textContent;
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
      star.setAttribute('aria-label', `Pin ${title.textContent}`);
      star.title = `Pin ${title.textContent}`;
      const trash = document.createElement('button');
      trash.type = 'button';
      trash.className = 'icon-button';
      trash.style.width = '28px';
      trash.style.height = '28px';
      trash.appendChild(Icon({ name: 'trash', size: 12 }));
      trash.setAttribute('aria-label', `Delete ${title.textContent}`);
      trash.title = `Delete ${title.textContent}`;
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
      main.append(conversationIcon, title);
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
  root.toggleOpen = () => {
    if (window.matchMedia('(max-width: 900px)').matches) {
      state.open = !state.open;
      root.classList.remove('collapsed');
      root.classList.toggle('open', state.open);
      updateLogo();
      return;
    }
    state.open = !state.open;
    root.classList.toggle('collapsed', !state.open);
    updateLogo();
  };
  root.openConversation = (conversationId) => {
    state.selectedId = conversationId;
    renderList();
    root.dispatchEvent(new CustomEvent('conversation-selected', { detail: { conversationId } }));
  };
  root.updateProfile = (nextProfile) => {
    profileName.textContent = nextProfile?.name || 'Local profile';
    profileSwitcher.setAttribute('aria-label', `Switch user. Current profile: ${nextProfile?.name || 'Unknown'}`);
  };
  render();
  return root;
}
