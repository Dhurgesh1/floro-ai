import { storage } from '../storage/index.js';
import { Icon } from './icons.js';
import DOMPurify from 'dompurify';
import { marked } from 'marked';

export function createChatArea() {
  const root = document.createElement('main');
  root.className = 'chat-shell';

  let currentConversation = null;
  const state = {
    provider: 'automatic',
    model: 'gpt-4o-mini',
    ollamaEndpoint: localStorage.getItem('floro:ollama-endpoint') || 'http://localhost:11434',
    attachments: [],
    isStreaming: false,
    streamingMessageId: null,
  };

  function setCurrentConversation(conversation) {
    currentConversation = conversation;
    if (conversation) {
      state.provider = conversation.provider || 'automatic';
      state.model = conversation.model || 'gpt-4o-mini';
    }
    render();
  }

  const header = document.createElement('header');
  header.className = 'chat-header';
  const title = document.createElement('h1');
  title.textContent = 'Floro AI';
  const actions = document.createElement('div');
  actions.className = 'header-actions';
  const mode = document.createElement('div');
  mode.className = 'chip';
  mode.textContent = 'Automatic';
  const status = document.createElement('div');
  status.className = 'chip';
  status.textContent = 'Ready';
  actions.appendChild(mode);
  actions.appendChild(status);
  header.appendChild(title);
  header.appendChild(actions);

  const chatBody = document.createElement('div');
  chatBody.className = 'chat-body';

  const pageHost = document.createElement('div');
  pageHost.className = 'page-host';
  pageHost.hidden = true;

  const centerStage = document.createElement('div');
  centerStage.className = 'center-stage';

  const messagesWrap = document.createElement('div');
  messagesWrap.className = 'messages';

  const welcome = document.createElement('div');
  welcome.className = 'welcome';
  welcome.innerHTML = `
    <div class="welcome-card">
      <h2 class="greeting">Hello, Dhurgesh</h2>
      <p>What would you like to work on today? I can help with writing, coding, research, analysis, and multimodal tasks.</p>
      <div class="model-grid">
        <div class="model-card"><strong>Local AI</strong><div>Ollama</div></div>
        <div class="model-card"><strong>Cloud AI</strong><div>OpenAI compatible</div></div>
        <div class="model-card"><strong>Web Search</strong><div>Ready when configured</div></div>
      </div>
    </div>
  `;
  centerStage.appendChild(welcome);

  const composer = document.createElement('div');
  composer.className = 'composer';

  const composeBox = document.createElement('div');
  composeBox.className = 'composer-box';

  const attachments = document.createElement('div');
  attachments.className = 'attachments';

  const inputRow = document.createElement('div');
  inputRow.className = 'input-row';

  const textarea = document.createElement('textarea');
  textarea.className = 'idea-textarea';
  textarea.placeholder = 'Message Floro AI...';
  textarea.rows = 1;
  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  });

  const sendButton = document.createElement('button');
  sendButton.type = 'button';
  sendButton.className = 'send-button';
  sendButton.title = 'Send message';
  sendButton.appendChild(Icon({ name: 'send', size: 18 }));

  const options = document.createElement('div');
  options.className = 'toolbar';
  const left = document.createElement('div');
  left.className = 'toolbar-left';
  const attach = document.createElement('button');
  attach.type = 'button';
  attach.className = 'action-chip';
  attach.textContent = 'Attach';
  attach.onclick = () => { /* noop: attachment stack is available in a real app */ };
  const voice = document.createElement('button');
  voice.type = 'button';
  voice.className = 'action-chip';
  voice.textContent = 'Voice';
  const modelSelector = document.createElement('select');
  modelSelector.className = 'action-chip';
  modelSelector.setAttribute('aria-label', 'Select a model for this conversation');
  modelSelector.innerHTML = '<option value="automatic::gpt-4o-mini">Automatic · GPT-4o Mini</option><option value="openai::gpt-4o-mini">OpenAI · GPT-4o Mini</option><option value="openai::gpt-4o">OpenAI · GPT-4o</option>';
  modelSelector.addEventListener('change', (event) => {
    const [provider, ...modelParts] = event.target.value.split('::');
    state.provider = provider;
    state.model = modelParts.join('::');
    if (currentConversation) {
      storage.updateConversation(currentConversation.id, { provider: state.provider, model: state.model }).then((updated) => {
        currentConversation = updated || currentConversation;
        updateActiveModel();
      });
    } else updateActiveModel();
  });

  left.appendChild(attach);
  left.appendChild(voice);
  left.appendChild(modelSelector);

  const right = document.createElement('div');
  right.className = 'toolbar-right';
  const web = document.createElement('button');
  web.type = 'button';
  web.className = 'action-chip';
  web.textContent = 'Web: Checking';
  web.title = 'Checking live web search configuration';
  async function refreshWebSearchStatus() {
    if (!navigator.onLine) {
      web.textContent = 'Web: Offline';
      web.title = 'Live web search is unavailable while this device is offline.';
      return;
    }
    try {
      const response = await fetch('/api/web-search/status');
      const result = await response.json();
      web.textContent = result.available ? 'Web: Auto' : 'Web: Setup needed';
      web.title = result.message || 'Automatic search is used for current-information questions.';
    } catch {
      web.textContent = 'Web: Unavailable';
      web.title = 'Could not check live web search status.';
    }
  }
  web.addEventListener('click', refreshWebSearchStatus);
  window.addEventListener('online', refreshWebSearchStatus);
  window.addEventListener('offline', refreshWebSearchStatus);
  right.appendChild(web);
  refreshWebSearchStatus();

  options.appendChild(left);
  options.appendChild(right);

  inputRow.appendChild(textarea);
  inputRow.appendChild(sendButton);
  composeBox.appendChild(attachments);
  composeBox.appendChild(inputRow);
  composeBox.appendChild(options);
  composer.appendChild(composeBox);

  centerStage.appendChild(messagesWrap);
  centerStage.appendChild(composer);
  chatBody.appendChild(centerStage);
  root.appendChild(header);
  root.appendChild(chatBody);
  root.appendChild(pageHost);

  function getDisplayName(model) {
    try {
      const labels = JSON.parse(localStorage.getItem('floro:model-labels') || '{}');
      return labels[model] || model;
    } catch {
      return model;
    }
  }

  function updateActiveModel() {
    const label = getDisplayName(state.model);
    mode.textContent = state.provider === 'ollama'
      ? `Ollama · ${label}`
      : state.provider === 'openai'
        ? `OpenAI · ${label}`
        : `Automatic · ${label}`;
    status.textContent = currentConversation ? currentConversation.title || 'Current conversation' : 'Ready';
  }

  async function refreshModelOptions() {
    const selected = `${state.provider}::${state.model}`;
    const options = [
      ['automatic::gpt-4o-mini', 'Automatic · GPT-4o Mini'],
      ['openai::gpt-4o-mini', 'OpenAI · GPT-4o Mini'],
      ['openai::gpt-4o', 'OpenAI · GPT-4o'],
    ];
    try {
      const endpoint = localStorage.getItem('floro:ollama-endpoint') || 'http://localhost:11434';
      const response = await fetch(`/api/models/installed?endpoint=${encodeURIComponent(endpoint)}`);
      const result = await response.json();
      (result.models || []).forEach((model) => {
        let label = model.name;
        try {
          const labels = JSON.parse(localStorage.getItem('floro:model-labels') || '{}');
          label = labels[model.name] || model.name;
        } catch {}
        options.push([`ollama::${model.name}`, `Ollama · ${label}`]);
      });
    } catch {}

    modelSelector.replaceChildren();
    options.forEach(([value, label]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      modelSelector.appendChild(option);
    });

    const isInstalled = options.some(([value]) => value === selected);
    let activeValue = isInstalled ? selected : 'automatic::gpt-4o-mini';
    if (!isInstalled && state.provider === 'ollama') {
      const localDefault = options.find(([value]) => value.startsWith('ollama::'));
      if (localDefault) activeValue = localDefault[0];
    }
    modelSelector.value = activeValue;
    if (modelSelector.value !== selected) {
      const [provider, ...modelParts] = activeValue.split('::');
      state.provider = provider;
      state.model = modelParts.join('::');
      if (currentConversation) {
        currentConversation = await storage.updateConversation(currentConversation.id, { provider, model: state.model }) || currentConversation;
      }
    }
    updateActiveModel();
  }

  async function render() {
    const conversations = await storage.getConversations();
    if (currentConversation) {
      currentConversation = conversations.find((conversation) => conversation.id === currentConversation.id) || currentConversation;
    }
    if (!currentConversation && conversations.length) {
      currentConversation = conversations[0];
    }
    if (!currentConversation) {
      currentConversation = await storage.createConversation('New conversation');
    }
    updateActiveModel();

    if (currentConversation.messages?.length) {
      welcome.remove();
      messagesWrap.innerHTML = '';
      currentConversation.messages.forEach((message) => {
        const wrap = document.createElement('div');
        wrap.className = `message-wrap ${message.role}`;
        wrap.dataset.messageId = message.id;
        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';
        const meta = document.createElement('div');
        meta.className = 'message-meta';
        meta.innerHTML = `<span>${message.role === 'user' ? 'You' : 'Floro AI'}</span><span>${new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>`;
        bubble.appendChild(meta);
        const content = document.createElement('div');
        content.className = 'message-content';
        if (message.role === 'assistant' && message.streaming) {
          const typingIndicator = document.createElement('div');
          typingIndicator.className = 'response-typing-indicator';
          typingIndicator.setAttribute('role', 'status');
          typingIndicator.setAttribute('aria-label', 'Floro AI is responding');
          for (let dot = 0; dot < 3; dot += 1) {
            const typingDot = document.createElement('span');
            typingDot.setAttribute('aria-hidden', 'true');
            typingIndicator.appendChild(typingDot);
          }
          bubble.appendChild(typingIndicator);
        }
        content.innerHTML = DOMPurify.sanitize(marked.parse(message.content || ''));
        bubble.appendChild(content);
        const actionsRow = document.createElement('div');
        actionsRow.className = 'message-actions';
        ['Copy', 'Retry', 'Like'].forEach((label) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'inline-action';
          button.textContent = label;
          actionsRow.appendChild(button);
        });
        bubble.appendChild(actionsRow);
        wrap.appendChild(bubble);
        messagesWrap.appendChild(wrap);
      });
      messagesWrap.scrollTop = messagesWrap.scrollHeight;
    } else {
      messagesWrap.innerHTML = '';
      centerStage.prepend(welcome);
    }
  }

  function parseSseChunks(textChunk) {
    const eventBlocks = textChunk.split(/\r?\n\r?\n+/);
    return eventBlocks
      .map((block) => block.trim())
      .filter(Boolean)
      .map((block) => {
        const lines = block.split(/\r?\n/);
        const event = { type: '', data: '' };
        for (const line of lines) {
          if (line.startsWith('event:')) event.type = line.replace(/^event:\s*/, '');
          if (line.startsWith('data:')) event.data += `${line.replace(/^data:\s*/, '')}\n`;
        }
        return event;
      })
      .filter((event) => event.type || event.data)
      .map((event) => ({
        type: event.type || 'message',
        payload: event.data ? JSON.parse(event.data.trim()) : null,
      }));
  }

  async function sendMessage() {
    const text = textarea.value.trim();
    if (!text || state.isStreaming) return;
    const msg = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };
    if (!currentConversation) {
      currentConversation = await storage.createConversation('New conversation');
    }
    await storage.addMessage(currentConversation.id, msg);
    currentConversation = await storage.updateConversation(currentConversation.id, { title: text.slice(0, 40) || 'New conversation' });
    textarea.value = '';
    const assistantId = crypto.randomUUID();
    const assistantMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
      streaming: true,
    };
    currentConversation = await storage.addMessage(currentConversation.id, assistantMessage) || currentConversation;
    const conversationId = currentConversation.id;
    state.isStreaming = true;
    state.streamingMessageId = assistantId;
    await render();

    let allText = '';
    let persistTimer;
    let persistQueue = Promise.resolve();
    const persistAssistantMessage = (streaming) => {
      const content = allText;
      persistQueue = persistQueue.catch(() => {}).then(async () => {
        const latest = (await storage.getConversations()).find((conversation) => conversation.id === conversationId);
        if (!latest) throw new Error('The active conversation could not be saved.');
        const index = (latest.messages || []).findIndex((message) => message.id === assistantId);
        if (index < 0) throw new Error('The active response could not be saved.');
        latest.messages[index].content = content;
        latest.messages[index].streaming = streaming;
        const updated = await storage.updateConversation(conversationId, {
          messages: latest.messages,
          ...(streaming ? {} : { provider: state.provider, model: state.model }),
        });
        if (updated && currentConversation?.id === conversationId) currentConversation = updated;
      });
      return persistQueue;
    };
    const scheduleAssistantSave = () => {
      window.clearTimeout(persistTimer);
      persistTimer = window.setTimeout(() => {
        persistTimer = undefined;
        persistAssistantMessage(true).catch((error) => {
          window.dispatchEvent(new CustomEvent('floro-notice', {
            detail: { message: error.message || 'Could not save the streaming response.', type: 'error' },
          }));
        });
      }, 500);
    };

    const fullConversation = await storage.getConversations();
    const activeConversation = fullConversation.find((item) => item.id === conversationId) || currentConversation;
    const messages = (activeConversation.messages || []).filter((message) => message.id !== assistantId);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messages.slice(-10),
          provider: state.provider,
          model: state.model,
          ollamaEndpoint: localStorage.getItem('floro:ollama-endpoint') || 'http://localhost:11434',
          systemInstruction: localStorage.getItem('floro:custom-instructions') || '',
          useWebSearch: true,
          deviceOnline: Boolean(navigator.onLine),
        })
      });

      if (!response.body) throw new Error('No response stream available');
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || `AI request failed (${response.status}).`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split(/\r?\n\r?\n/);
        buffer = chunks.pop() || '';
        const events = chunks.flatMap(parseSseChunks);
        for (const event of events) {
          if (!event.payload) continue;
          if (event.type === 'search-status') {
            if (event.payload.available) {
              web.textContent = `Web: ${event.payload.sources} sources`;
              web.title = 'Live sources were added to this response.';
            } else if (event.payload.message) {
              web.textContent = navigator.onLine ? 'Web: Limited' : 'Web: Offline';
              web.title = event.payload.message;
              window.dispatchEvent(new CustomEvent('floro-notice', {
                detail: { message: event.payload.message, type: 'info' },
              }));
            }
          }
          if (event.payload.delta) {
            allText += event.payload.delta;
            contentForMessage(assistantId, allText);
            scheduleAssistantSave();
          }
          if (event.type === 'done') {
            if (typeof event.payload.text === 'string') {
              allText = event.payload.text;
              contentForMessage(assistantId, allText);
            }
            state.provider = event.payload.provider || state.provider;
            state.model = event.payload.model || state.model;
          }
          if (event.type === 'error') {
            throw new Error(event.payload.message || 'AI request failed.');
          }
        }
      }
    } catch (error) {
      allText = error.message || 'AI request failed';
      contentForMessage(assistantId, allText);
    }

    window.clearTimeout(persistTimer);
    try {
      await persistAssistantMessage(false);
    } catch (error) {
      window.dispatchEvent(new CustomEvent('floro-notice', {
        detail: { message: error.message || 'Could not save the final response.', type: 'error' },
      }));
    }
    state.isStreaming = false;
    state.streamingMessageId = null;
    if (currentConversation?.id === conversationId) {
      currentConversation = (await storage.getConversations()).find((conversation) => conversation.id === conversationId) || currentConversation;
      await render();
    }
  }

  function contentForMessage(messageId, text) {
    const assistant = [...messagesWrap.querySelectorAll('[data-message-id]')]
      .find((element) => element.dataset.messageId === messageId)
      ?.querySelector('.message-content');
    if (assistant) {
      const shouldScroll = messagesWrap.scrollHeight - messagesWrap.scrollTop - messagesWrap.clientHeight < 80;
      assistant.innerHTML = DOMPurify.sanitize(marked.parse(text || ''));
      if (shouldScroll) messagesWrap.scrollTop = messagesWrap.scrollHeight;
    }
  }

  function showPage(page) {
    chatBody.hidden = true;
    pageHost.hidden = false;
    pageHost.replaceChildren(page);
  }

  function showChat() {
    pageHost.hidden = true;
    pageHost.replaceChildren();
    chatBody.hidden = false;
  }

  sendButton.addEventListener('click', sendMessage);
  textarea.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });

  root.render = render;
  root.setCurrentConversation = setCurrentConversation;
  root.showPage = showPage;
  root.showChat = showChat;
  window.addEventListener('floro-models-changed', refreshModelOptions);
  render();
  refreshModelOptions();
  return root;
}
