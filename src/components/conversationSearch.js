import { storage } from '../storage/index.js';
import { Icon } from './icons.js';

function messageExcerpt(conversation, terms) {
  const messages = (conversation.messages || []).filter((message) => typeof message.content === 'string');
  const match = messages.find((message) => {
    const content = message.content.toLocaleLowerCase();
    return terms.length ? terms.some((term) => content.includes(term)) : true;
  });
  if (!match) return 'No message preview available.';
  const content = match.content.replace(/\s+/g, ' ').trim();
  const termIndex = terms.reduce((earliest, term) => {
    const index = content.toLocaleLowerCase().indexOf(term);
    return index < 0 ? earliest : Math.min(earliest, index);
  }, Number.POSITIVE_INFINITY);
  const start = Number.isFinite(termIndex) ? Math.max(0, termIndex - 48) : 0;
  const excerpt = content.slice(start, start + 150);
  return `${start > 0 ? '…' : ''}${excerpt}${start + excerpt.length < content.length ? '…' : ''}`;
}

export function createConversationSearchPage({ onSelect }) {
  const page = document.createElement('section');
  page.className = 'manager-page conversation-search-page';
  page.innerHTML = '<div class="page-heading"><div><p class="eyebrow">YOUR HISTORY</p><h2>Search conversations</h2><p>Find a conversation by its title or anything said in its messages.</p></div></div>';

  const form = document.createElement('form');
  form.className = 'conversation-search-form';
  const searchLabel = document.createElement('label');
  searchLabel.className = 'conversation-search-box';
  searchLabel.setAttribute('aria-label', 'Search conversation titles and messages');
  searchLabel.appendChild(Icon({ name: 'search', size: 19 }));
  const input = document.createElement('input');
  input.type = 'search';
  input.placeholder = 'Search your conversations...';
  input.autocomplete = 'off';
  input.setAttribute('aria-label', 'Search conversation titles and messages');
  searchLabel.appendChild(input);
  form.appendChild(searchLabel);
  form.addEventListener('submit', (event) => event.preventDefault());

  const status = document.createElement('p');
  status.className = 'conversation-search-status';
  status.setAttribute('role', 'status');
  const results = document.createElement('div');
  results.className = 'conversation-search-results';
  page.append(form, status, results);

  let conversations = [];
  function renderResults() {
    const terms = input.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const matches = conversations.filter((conversation) => {
      const title = String(conversation.title || '').toLocaleLowerCase();
      const messageText = (conversation.messages || [])
        .map((message) => typeof message.content === 'string' ? message.content : '')
        .join('\n')
        .toLocaleLowerCase();
      const searchable = `${title}\n${messageText}`;
      return terms.every((term) => searchable.includes(term));
    }).slice(0, 100);
    results.replaceChildren();
    status.textContent = terms.length
      ? `${matches.length} conversation${matches.length === 1 ? '' : 's'} found`
      : `Recent conversations · ${conversations.length} total`;

    if (!matches.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-panel';
      empty.innerHTML = '<h3>No matching conversations</h3><p>Try a different title, phrase, or keyword.</p>';
      results.appendChild(empty);
      return;
    }

    matches.forEach((conversation) => {
      const result = document.createElement('button');
      result.type = 'button';
      result.className = 'conversation-search-result';
      const resultIcon = document.createElement('span');
      resultIcon.className = 'conversation-search-icon';
      resultIcon.setAttribute('aria-hidden', 'true');
      resultIcon.appendChild(Icon({ name: 'chat', size: 19 }));
      const copy = document.createElement('span');
      copy.className = 'conversation-search-copy';
      const title = document.createElement('strong');
      title.textContent = conversation.title || 'Untitled conversation';
      const excerpt = document.createElement('span');
      excerpt.textContent = messageExcerpt(conversation, terms);
      copy.append(title, excerpt);
      const date = document.createElement('time');
      const timestamp = conversation.updatedAt || conversation.createdAt;
      if (timestamp) {
        date.dateTime = timestamp;
        date.textContent = new Date(timestamp).toLocaleDateString();
      }
      result.append(resultIcon, copy, date);
      result.addEventListener('click', () => onSelect(conversation.id));
      results.appendChild(result);
    });
  }

  async function load() {
    status.textContent = 'Loading your conversations...';
    try {
      conversations = await storage.getConversations();
      renderResults();
    } catch (error) {
      status.textContent = error.message || 'Could not load conversation history.';
      results.replaceChildren();
    }
  }

  input.addEventListener('input', renderResults);
  page.refresh = load;
  load();
  return page;
}
