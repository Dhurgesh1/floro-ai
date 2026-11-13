import { storage } from '../storage/index.js';
import { Icon } from './icons.js';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { getLocalProfile, getProfileStorageKey } from '../profile.js';

export function createChatArea() {
  const root = document.createElement('main');
  root.className = 'chat-shell';

  let currentConversation = null;
  let profile = getLocalProfile();
  const state = {
    provider: 'ollama',
    model: 'gemma3:1b',
    ollamaEndpoint: localStorage.getItem('floro:ollama-endpoint') || 'http://localhost:11434',
    attachments: [],
    isStreaming: false,
    streamingMessageId: null,
    abortController: null,
    editingMessageId: null,
  };

  function setCurrentConversation(conversation) {
    currentConversation = conversation;
    state.editingMessageId = null;
    if (conversation) {
      state.provider = conversation.provider || 'ollama';
      state.model = conversation.model || 'gemma3:1b';
    }
    render();
  }

  const chatBody = document.createElement('div');
  chatBody.className = 'chat-body';

  const mobileMenuButton = document.createElement('button');
  mobileMenuButton.type = 'button';
  mobileMenuButton.className = 'mobile-menu-button';
  mobileMenuButton.setAttribute('aria-label', 'Open navigation');
  mobileMenuButton.title = 'Open navigation';
  mobileMenuButton.appendChild(Icon({ name: 'menu', size: 19 }));
  mobileMenuButton.addEventListener('click', () => {
    root.dispatchEvent(new CustomEvent('sidebar-toggle-requested'));
  });

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
      <h2 class="greeting"></h2>
      <p>What would you like to work on today? I can help with writing, coding, research, analysis, and multimodal tasks.</p>
      <div class="model-grid">
        <div class="model-card"><strong>Local AI</strong><div>Ollama</div></div>
        <div class="model-card"><strong>Cloud AI</strong><div>OpenAI compatible</div></div>
        <div class="model-card"><strong>Web Search</strong><div>Ready when configured</div></div>
      </div>
    </div>
  `;
  const greeting = welcome.querySelector('.greeting');
  greeting.textContent = `Hello, ${profile?.name?.trim() || 'there'}`;
  centerStage.appendChild(welcome);

  const composer = document.createElement('div');
  composer.className = 'composer';

  const composeBox = document.createElement('div');
  composeBox.className = 'composer-box';

  const attachments = document.createElement('div');
  attachments.className = 'attachments';
  const photoPicker = document.createElement('input');
  photoPicker.type = 'file';
  photoPicker.accept = 'image/jpeg,image/png,image/webp,image/gif';
  photoPicker.multiple = true;
  photoPicker.hidden = true;
  photoPicker.setAttribute('aria-label', 'Choose pictures');
  const filePicker = document.createElement('input');
  filePicker.type = 'file';
  filePicker.accept = '.txt,.md,.csv,.json,.log,.xml,.yaml,.yml';
  filePicker.multiple = true;
  filePicker.hidden = true;
  filePicker.setAttribute('aria-label', 'Choose text files');
  function formatFileSize(size) {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }
  function renderComposerAttachments() {
    attachments.replaceChildren();
    state.attachments.forEach((file, index) => {
      const pill = document.createElement('span');
      pill.className = 'attachment-pill';
      const label = document.createElement('span');
      label.textContent = `${file.name} · ${formatFileSize(file.size)}`;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'attachment-remove';
      remove.setAttribute('aria-label', `Remove attachment ${file.name}`);
      remove.title = `Remove ${file.name}`;
      remove.appendChild(Icon({ name: 'close', size: 14 }));
      remove.addEventListener('click', () => {
        state.attachments.splice(index, 1);
        renderComposerAttachments();
      });
      pill.append(label, remove);
      attachments.appendChild(pill);
    });
  }
  function readFileAsData(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
      reader.readAsDataURL(file);
    });
  }
  async function addSelectedFiles(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (state.attachments.length + files.length > 5) {
      notifyActionError(new Error('You can attach up to five files per message.'), 'Could not add attachments.');
      return;
    }
    try {
      const additions = await Promise.all(files.map(async (file) => {
        if (file.type.startsWith('image/')) {
          if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
            throw new Error(`${file.name} uses an unsupported image format.`);
          }
          if (file.size > 6 * 1024 * 1024) throw new Error(`${file.name} is larger than the 6 MB image limit.`);
          return { name: file.name, type: file.type, size: file.size, data: await readFileAsData(file) };
        }
        if (file.size > 1024 * 1024) throw new Error(`${file.name} is larger than the 1 MB text-file limit.`);
        const textTypes = ['application/json', 'application/xml', 'application/yaml'];
        const textExtensions = /\.(txt|md|csv|json|log|xml|ya?ml)$/i;
        if (!file.type.startsWith('text/') && !textTypes.includes(file.type) && !textExtensions.test(file.name)) {
          throw new Error(`Unsupported file type: ${file.name}. Choose a picture or a text-based file.`);
        }
        return { name: file.name, type: file.type || 'text/plain', size: file.size, text: await file.text() };
      }));
      state.attachments.push(...additions);
      renderComposerAttachments();
    } catch (error) {
      notifyActionError(error, 'Could not add the selected file.');
    }
  }
  photoPicker.addEventListener('change', addSelectedFiles);
  filePicker.addEventListener('change', addSelectedFiles);

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
  sendButton.setAttribute('aria-label', 'Send message');
  sendButton.appendChild(Icon({ name: 'send', size: 18 }));
  const attach = document.createElement('button');
  attach.type = 'button';
  attach.className = 'composer-plus-button';
  attach.title = 'Add a picture or file';
  attach.setAttribute('aria-label', 'Add a picture or file');
  attach.appendChild(Icon({ name: 'plus', size: 20 }));
  const attachmentDialog = document.createElement('dialog');
  attachmentDialog.className = 'attachment-picker-dialog';
  attachmentDialog.setAttribute('aria-labelledby', 'attachment-picker-title');
  const dialogTitle = document.createElement('h2');
  dialogTitle.id = 'attachment-picker-title';
  dialogTitle.textContent = 'Add to your message';
  const dialogDescription = document.createElement('p');
  dialogDescription.textContent = 'Choose a picture or a text-based file.';
  const dialogActions = document.createElement('div');
  dialogActions.className = 'attachment-picker-actions';
  const choosePhoto = document.createElement('button');
  choosePhoto.type = 'button';
  choosePhoto.className = 'attachment-picker-option';
  choosePhoto.append(Icon({ name: 'image', size: 19 }), document.createTextNode('Picture'));
  choosePhoto.addEventListener('click', () => {
    attachmentDialog.close();
    photoPicker.click();
  });
  const chooseFile = document.createElement('button');
  chooseFile.type = 'button';
  chooseFile.className = 'attachment-picker-option';
  chooseFile.append(Icon({ name: 'file', size: 19 }), document.createTextNode('File'));
  chooseFile.addEventListener('click', () => {
    attachmentDialog.close();
    filePicker.click();
  });
  const cancelAttachment = document.createElement('button');
  cancelAttachment.type = 'button';
  cancelAttachment.className = 'attachment-picker-cancel';
  cancelAttachment.textContent = 'Cancel';
  cancelAttachment.addEventListener('click', () => attachmentDialog.close());
  dialogActions.append(choosePhoto, chooseFile);
  attachmentDialog.append(dialogTitle, dialogDescription, dialogActions, cancelAttachment);
  attach.addEventListener('click', () => attachmentDialog.showModal());
  function setSendButtonMode(streaming) {
    sendButton.replaceChildren(Icon({ name: streaming ? 'stop' : 'send', size: streaming ? 17 : 18 }));
    sendButton.title = streaming ? 'Stop generating response' : 'Send message';
    sendButton.setAttribute('aria-label', sendButton.title);
    sendButton.classList.toggle('stop-button', streaming);
  }

  const options = document.createElement('div');
  options.className = 'composer-context';
  const left = document.createElement('div');
  left.className = 'toolbar-left';
  const modelSelector = document.createElement('select');
  modelSelector.className = 'action-chip';
  modelSelector.setAttribute('aria-label', 'Select a model for this conversation');
  modelSelector.innerHTML = '<option value="ollama::gemma3:1b">Ollama · Gemma 3 1B</option><option value="automatic::gpt-4o-mini">Automatic · GPT-4o Mini</option><option value="openai::gpt-4o-mini">OpenAI · GPT-4o Mini</option><option value="openai::gpt-4o">OpenAI · GPT-4o</option>';
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

  const activeModel = document.createElement('span');
  activeModel.className = 'active-model-chip';
  activeModel.setAttribute('role', 'status');
  const activeModelIcon = Icon({ name: 'spark', size: 15 });
  const activeModelName = document.createElement('span');
  activeModel.append(activeModelIcon, activeModelName);

  left.appendChild(modelSelector);
  left.appendChild(activeModel);

  const right = document.createElement('div');
  right.className = 'toolbar-right';
  const web = document.createElement('span');
  web.className = 'web-search-status';
  web.setAttribute('role', 'status');
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
  window.addEventListener('online', refreshWebSearchStatus);
  window.addEventListener('offline', refreshWebSearchStatus);
  right.appendChild(web);
  refreshWebSearchStatus();

  options.appendChild(left);
  options.appendChild(right);

  inputRow.appendChild(textarea);
  inputRow.prepend(attach);
  inputRow.appendChild(sendButton);
  composeBox.appendChild(attachments);
  composeBox.appendChild(inputRow);
  composer.appendChild(options);
  composer.appendChild(photoPicker);
  composer.appendChild(filePicker);
  composer.appendChild(attachmentDialog);
  composer.appendChild(composeBox);

  centerStage.appendChild(messagesWrap);
  centerStage.appendChild(composer);
  chatBody.appendChild(centerStage);
  root.appendChild(chatBody);
  root.appendChild(pageHost);
  root.appendChild(mobileMenuButton);

  function getDisplayName(model) {
    try {
      const labels = JSON.parse(localStorage.getItem(getProfileStorageKey('model-labels')) || '{}');
      return labels[model] || model;
    } catch {
      return model;
    }
  }

  function updateActiveModel() {
    const label = getDisplayName(state.model);
    const provider = state.provider === 'ollama' ? 'Ollama' : state.provider === 'openai' ? 'OpenAI' : 'Automatic';
    activeModelName.textContent = `${provider} · ${label}`;
    activeModel.title = `Active model for this conversation: ${provider} · ${label}`;
  }

  function createMessageAction(name, label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'inline-action';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.appendChild(Icon({ name, size: 17 }));
    return button;
  }

  function notifyActionError(error, fallback) {
    window.dispatchEvent(new CustomEvent('floro-notice', {
      detail: { message: error.message || fallback, type: 'error' },
    }));
  }

  async function copyMessage(message, button) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable in this browser.');
      await navigator.clipboard.writeText(message.content || '');
      button.classList.add('copied');
      button.title = 'Copied';
      button.setAttribute('aria-label', 'Copied');
      window.setTimeout(() => {
        button.classList.remove('copied');
        button.title = 'Copy response';
        button.setAttribute('aria-label', 'Copy response');
      }, 1200);
    } catch (error) {
      notifyActionError(error, 'Could not copy the response.');
    }
  }

  async function toggleMessageLike(messageId) {
    try {
      if (!currentConversation) return;
      const messages = [...(currentConversation.messages || [])];
      const index = messages.findIndex((entry) => entry.id === messageId);
      if (index < 0) return;
      messages[index] = { ...messages[index], liked: !messages[index].liked };
      currentConversation = await storage.updateConversation(currentConversation.id, { messages }) || currentConversation;
      await render();
    } catch (error) {
      notifyActionError(error, 'Could not update response feedback.');
    }
  }

  async function saveEditedMessage(messageId, editedText) {
    if (state.isStreaming || !currentConversation) return;
    const text = editedText.trim();
    if (!text) return;
    try {
      const messages = [...(currentConversation.messages || [])];
      const index = messages.findIndex((entry) => entry.id === messageId && entry.role === 'user');
      if (index < 0) return;
      messages[index] = { ...messages[index], content: text };
      currentConversation = await storage.updateConversation(currentConversation.id, {
        messages: messages.slice(0, index + 1),
        title: text.slice(0, 40) || 'New conversation',
      }) || currentConversation;
      state.editingMessageId = null;
      textarea.value = text;
      await render();
      await sendMessage({ reuseLastUserMessage: true });
    } catch (error) {
      notifyActionError(error, 'Could not edit and resend your message.');
    }
  }

  async function retryResponse(messageId) {
    if (state.isStreaming || !currentConversation) return;
    try {
      const messages = [...(currentConversation.messages || [])];
      const assistantIndex = messages.findIndex((entry) => entry.id === messageId && entry.role === 'assistant');
      if (assistantIndex !== messages.length - 1) return;
      let userIndex = -1;
      for (let index = assistantIndex - 1; index >= 0; index -= 1) {
        if (messages[index].role === 'user') {
          userIndex = index;
          break;
        }
      }
      if (userIndex < 0) return;
      const prompt = messages[userIndex].content;
      const retainedMessages = messages.slice(0, assistantIndex);
      currentConversation = await storage.updateConversation(currentConversation.id, { messages: retainedMessages }) || currentConversation;
      await render();
      textarea.value = prompt;
      await sendMessage({ reuseLastUserMessage: true });
    } catch (error) {
      notifyActionError(error, 'Could not retry the response.');
    }
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
          const labels = JSON.parse(localStorage.getItem(getProfileStorageKey('model-labels')) || '{}');
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
      currentConversation.messages.forEach((message, messageIndex) => {
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
        if (message.role === 'user' && state.editingMessageId === message.id) {
          const editor = document.createElement('textarea');
          editor.className = 'message-edit-input';
          editor.setAttribute('aria-label', 'Edit your message');
          editor.value = message.content || '';
          const editActions = document.createElement('div');
          editActions.className = 'message-edit-actions';
          const cancelEdit = createMessageAction('close', 'Cancel editing');
          cancelEdit.classList.add('message-edit-cancel');
          cancelEdit.addEventListener('click', () => {
            state.editingMessageId = null;
            render();
          });
          const saveEdit = createMessageAction('check', 'Save and send edited message');
          saveEdit.classList.add('message-edit-save');
          saveEdit.disabled = !editor.value.trim();
          editor.addEventListener('input', () => {
            saveEdit.disabled = !editor.value.trim();
          });
          editor.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              if (!saveEdit.disabled) saveEditedMessage(message.id, editor.value);
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              state.editingMessageId = null;
              render();
            }
          });
          saveEdit.addEventListener('click', () => saveEditedMessage(message.id, editor.value));
          editActions.append(cancelEdit, saveEdit);
          bubble.append(editor, editActions);
          if (messageIndex < currentConversation.messages.length - 1) {
            const editNote = document.createElement('p');
            editNote.className = 'message-edit-note';
            editNote.textContent = 'Saving resends this message and removes later messages in the conversation.';
            bubble.appendChild(editNote);
          }
          editor.focus();
          editor.setSelectionRange(editor.value.length, editor.value.length);
        } else {
          content.innerHTML = DOMPurify.sanitize(marked.parse(message.content || ''));
          bubble.appendChild(content);
        }
        if (message.role === 'user' && message.attachments?.length) {
          const fileList = document.createElement('div');
          fileList.className = 'message-file-attachments';
          message.attachments.forEach((file) => {
            const fileItem = document.createElement('span');
            fileItem.className = 'message-file-attachment';
            if (file.type.startsWith('image/') && file.data) {
              const preview = document.createElement('img');
              preview.src = `data:${file.type};base64,${file.data}`;
              preview.alt = file.name;
              fileItem.appendChild(preview);
            } else {
              fileItem.appendChild(Icon({ name: 'file', size: 15 }));
            }
            const fileName = document.createElement('span');
            fileName.textContent = file.name;
            fileItem.appendChild(fileName);
            fileList.appendChild(fileItem);
          });
          bubble.appendChild(fileList);
        }
        if (message.role === 'user' && state.editingMessageId !== message.id) {
          const actionsRow = document.createElement('div');
          actionsRow.className = 'message-actions';
          const edit = createMessageAction('edit', 'Edit message');
          edit.disabled = state.isStreaming;
          edit.addEventListener('click', () => {
            state.editingMessageId = message.id;
            render();
          });
          actionsRow.appendChild(edit);
          bubble.appendChild(actionsRow);
        }
        if (message.role === 'assistant' && !message.streaming && state.editingMessageId !== message.id) {
          const actionsRow = document.createElement('div');
          actionsRow.className = 'message-actions';
          const copy = createMessageAction('copy', 'Copy response');
          copy.addEventListener('click', () => copyMessage(message, copy));
          const retry = createMessageAction('retry', 'Retry response');
          retry.disabled = currentConversation?.messages?.at(-1)?.id !== message.id;
          retry.addEventListener('click', () => retryResponse(message.id));
          const like = createMessageAction('like', message.liked ? 'Remove like' : 'Like response');
          like.setAttribute('aria-pressed', String(message.liked === true));
          if (message.liked) like.classList.add('liked');
          like.addEventListener('click', () => toggleMessageLike(message.id));
          actionsRow.append(copy, retry, like);
          bubble.appendChild(actionsRow);
        }
        if (message.role === 'assistant' && message.stopped) {
          const stopped = document.createElement('span');
          stopped.className = 'response-stopped';
          stopped.textContent = 'Response stopped';
          bubble.appendChild(stopped);
        }
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

  async function sendMessage({ reuseLastUserMessage = false } = {}) {
    const text = textarea.value.trim();
    if ((!text && !state.attachments.length && !reuseLastUserMessage) || state.isStreaming) return;
    const messageContent = text || 'Please review the attached file(s).';
    if (!currentConversation) {
      currentConversation = await storage.createConversation('New conversation');
    }
    if (reuseLastUserMessage) {
      const lastMessage = currentConversation.messages?.at(-1);
      if (lastMessage?.role !== 'user' || lastMessage.content !== messageContent) return;
    } else {
      const msg = {
        id: crypto.randomUUID(),
        role: 'user',
        content: messageContent,
        createdAt: new Date().toISOString(),
        attachments: [...state.attachments],
      };
      await storage.addMessage(currentConversation.id, msg);
      state.attachments = [];
      renderComposerAttachments();
    }
    currentConversation = await storage.updateConversation(currentConversation.id, { title: messageContent.slice(0, 40) || 'New conversation' });
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
    state.abortController = new AbortController();
    setSendButtonMode(true);
    await render();

    let allText = '';
    let responseStopped = false;
    let persistTimer;
    let persistQueue = Promise.resolve();
    const persistAssistantMessage = (streaming, stopped = false) => {
      const content = allText;
      persistQueue = persistQueue.catch(() => {}).then(async () => {
        const latest = (await storage.getConversations()).find((conversation) => conversation.id === conversationId);
        if (!latest) throw new Error('The active conversation could not be saved.');
        const index = (latest.messages || []).findIndex((message) => message.id === assistantId);
        if (index < 0) throw new Error('The active response could not be saved.');
        latest.messages[index].content = content;
        latest.messages[index].streaming = streaming;
        latest.messages[index].stopped = stopped;
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
    const requestMessages = messages.slice(-10).map((message) => {
      const fileContext = (message.attachments || [])
        .filter((file) => typeof file.text === 'string')
        .map((file) => `Attached file: ${file.name}\n${file.text}`);
      const images = (message.attachments || [])
        .filter((file) => file.type.startsWith('image/') && typeof file.data === 'string')
        .map(({ type, data }) => ({ type, data }));
      return {
        role: message.role,
        content: [message.content, ...fileContext].filter(Boolean).join('\n\n'),
        ...(images.length ? { images } : {}),
      };
    });

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: state.abortController.signal,
        body: JSON.stringify({
          messages: requestMessages,
          provider: state.provider,
          model: state.model,
          ollamaEndpoint: localStorage.getItem('floro:ollama-endpoint') || 'http://localhost:11434',
          systemInstruction: [
            profile?.purpose
              ? `The user's stated intended use for Floro AI is: ${profile.purpose}. Use this to tailor responses without inferring additional personal details.`
              : '',
            localStorage.getItem(getProfileStorageKey('custom-instructions')) || '',
          ].filter(Boolean).join('\n\n'),
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
      responseStopped = state.abortController.signal.aborted || error.name === 'AbortError';
      if (!responseStopped) {
        allText = error.message || 'AI request failed';
        contentForMessage(assistantId, allText);
      }
    }

    window.clearTimeout(persistTimer);
    try {
      await persistAssistantMessage(false, responseStopped);
    } catch (error) {
      window.dispatchEvent(new CustomEvent('floro-notice', {
        detail: { message: error.message || 'Could not save the final response.', type: 'error' },
      }));
    }
    state.isStreaming = false;
    state.streamingMessageId = null;
    state.abortController = null;
    setSendButtonMode(false);
    if (currentConversation?.id === conversationId) {
      currentConversation = (await storage.getConversations()).find((conversation) => conversation.id === conversationId) || currentConversation;
      await render();
    }
  }

  function stopGeneration() {
    if (!state.isStreaming) return;
    state.abortController?.abort();
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

  sendButton.addEventListener('click', () => {
    if (state.isStreaming) stopGeneration();
    else sendMessage();
  });
  textarea.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.isStreaming) {
      event.preventDefault();
      stopGeneration();
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });

  root.render = render;
  root.isStreaming = () => state.isStreaming;
  root.updateProfile = (updatedProfile) => {
    profile = updatedProfile;
    greeting.textContent = `Hello, ${profile?.name?.trim() || 'there'}`;
  };
  root.setCurrentConversation = setCurrentConversation;
  root.showPage = showPage;
  root.showChat = showChat;
  window.addEventListener('floro-models-changed', refreshModelOptions);
  refreshModelOptions();
  return root;
}
