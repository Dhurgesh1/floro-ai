import { storage } from '../storage/index.js';

const PROJECTS_KEY = 'floro:projects';

function readProjects() {
  try {
    const projects = JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]');
    return Array.isArray(projects) ? projects : [];
  } catch {
    return [];
  }
}

export function createProjectsPage() {
  const page = document.createElement('section');
  page.className = 'manager-page';
  page.innerHTML = '<div class="page-heading"><div><p class="eyebrow">WORKSPACES</p><h2>Projects</h2><p>Group conversations into projects. Project metadata syncs when cloud sync is enabled.</p></div></div>';
  const form = document.createElement('form');
  form.className = 'project-create-form';
  form.innerHTML = '<label>Project name<input name="name" maxlength="80" required placeholder="For example, Product research"></label>';
  const add = document.createElement('button');
  add.type = 'submit';
  add.className = 'primary-button';
  add.textContent = 'Create project';
  form.appendChild(add);
  const list = document.createElement('div');
  list.className = 'project-list';
  page.append(form, list);

  function render() {
    list.replaceChildren();
    const projects = readProjects();
    if (!projects.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-panel';
      empty.innerHTML = '<h3>No projects yet</h3><p>Create a project and add conversations to keep related work together.</p>';
      list.appendChild(empty);
      return;
    }
    storage.getConversations().then((conversations) => {
      projects.forEach((project) => {
        const card = document.createElement('article');
        card.className = 'project-card';
        const heading = document.createElement('div');
        const title = document.createElement('h3');
        title.textContent = project.name;
        const description = document.createElement('p');
        const projectConversations = conversations.filter((conversation) => conversation.folderId === project.id);
        description.textContent = `${projectConversations.length} conversation${projectConversations.length === 1 ? '' : 's'}`;
        heading.append(title, description);
        const controls = document.createElement('div');
        controls.className = 'project-controls';
        const selector = document.createElement('select');
        selector.className = 'action-chip';
        selector.setAttribute('aria-label', `Choose conversation for ${project.name}`);
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Select conversation';
        selector.appendChild(placeholder);
        conversations.filter((conversation) => conversation.folderId !== project.id).forEach((conversation) => {
          const option = document.createElement('option');
          option.value = conversation.id;
          option.textContent = conversation.title || 'Untitled conversation';
          selector.appendChild(option);
        });
        const assign = document.createElement('button');
        assign.type = 'button';
        assign.className = 'action-chip';
        assign.textContent = 'Add conversation';
        assign.disabled = selector.options.length < 2;
        assign.addEventListener('click', async () => {
          if (!selector.value) return;
          await storage.updateConversation(selector.value, { folderId: project.id });
          render();
        });
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'danger-button';
        remove.textContent = 'Delete project';
        remove.addEventListener('click', async () => {
          if (!confirm(`Delete the project “${project.name}”? Its conversations will remain in your history.`)) return;
          const nextProjects = readProjects().filter((entry) => entry.id !== project.id);
          localStorage.setItem(PROJECTS_KEY, JSON.stringify(nextProjects));
          let deletedProjects = [];
          try { deletedProjects = JSON.parse(localStorage.getItem('floro:deleted-projects') || '[]'); } catch {}
          if (!deletedProjects.includes(project.id)) deletedProjects.push(project.id);
          localStorage.setItem('floro:deleted-projects', JSON.stringify(deletedProjects));
          for (const conversation of projectConversations) {
            await storage.updateConversation(conversation.id, { folderId: null });
          }
          window.dispatchEvent(new CustomEvent('floro-data-changed'));
          render();
        });
        controls.append(selector, assign, remove);
        card.append(heading, controls);
        list.appendChild(card);
      });
    }).catch((error) => {
      const errorMessage = document.createElement('p');
      errorMessage.className = 'error-text';
      errorMessage.textContent = error.message || 'Could not load conversations.';
      list.appendChild(errorMessage);
    });
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = new FormData(form).get('name')?.toString().trim();
    if (!name) return;
    const now = new Date().toISOString();
    const projects = readProjects();
    projects.unshift({ id: crypto.randomUUID(), name, createdAt: now, updatedAt: now });
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
    window.dispatchEvent(new CustomEvent('floro-data-changed'));
    form.reset();
    render();
  });

  render();
  return page;
}
