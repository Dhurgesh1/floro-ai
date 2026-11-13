import { Icon } from '../components/icons.js';
import { MODEL_CATALOG } from './catalog.js';
import { getProfileStorageKey } from '../profile.js';

const ENDPOINT_KEY = 'floro:ollama-endpoint';
const DEFAULT_ENDPOINT = 'http://localhost:11434';
const CATEGORIES = ['All models', 'General AI', 'Coding', 'Reasoning', 'Mathematics', 'Vision', 'Lightweight models', 'Advanced models'];

function getEndpoint() {
  return localStorage.getItem(ENDPOINT_KEY) || DEFAULT_ENDPOINT;
}

function isDefaultModel(name) {
  try { return JSON.parse(localStorage.getItem(getProfileStorageKey('default-model')) || 'null')?.model === name; } catch { return false; }
}

function setEndpoint(value) {
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('Use an HTTP or HTTPS Ollama address without credentials.');
  }
  const normalized = parsed.toString().replace(/\/$/, '');
  localStorage.setItem(ENDPOINT_KEY, normalized);
  return normalized;
}

async function getInstalled() {
  const response = await fetch(`/api/models/installed?endpoint=${encodeURIComponent(getEndpoint())}`);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Could not list installed models.');
  return body;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'Size unavailable';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function escapeText(value) {
  const span = document.createElement('span');
  span.textContent = value || '';
  return span.innerHTML;
}

function localModelRuntimeSupported() {
  return !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function isLoopbackEndpoint(endpoint) {
  try {
    const hostname = new URL(endpoint).hostname.toLowerCase();
    return hostname === 'localhost' || hostname.endsWith('.localhost')
      || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch {
    return true;
  }
}

export function createModelManagerPage(view = 'store') {
  const page = document.createElement('section');
  page.className = 'manager-page';
  const downloads = new Map();
  let installed = [];
  let category = 'All models';
  let catalog = MODEL_CATALOG;
  let ollamaAvailable = false;

  const heading = document.createElement('div');
  heading.className = 'page-heading';
  const headingCopy = document.createElement('div');
  headingCopy.innerHTML = `<p class="eyebrow">OLLAMA MODEL LIBRARY</p><h2>${view === 'store' ? 'Model Store' : 'My Models'}</h2><p>${view === 'store' ? 'Discover models from the Ollama library and install them on an Ollama server you control.' : 'Installed models reported by your configured Ollama server.'}</p>`;
  const refresh = document.createElement('button');
  refresh.className = 'action-chip';
  refresh.type = 'button';
  refresh.textContent = 'Refresh models';
  heading.append(headingCopy, refresh);
  page.appendChild(heading);

  const endpointBar = document.createElement('form');
  endpointBar.className = 'endpoint-bar';
  endpointBar.innerHTML = '<label>Ollama server URL<input name="endpoint" type="url" autocomplete="url" spellcheck="false"></label>';
  const endpointInput = endpointBar.querySelector('input');
  endpointInput.value = getEndpoint();
  const endpointSave = document.createElement('button');
  endpointSave.type = 'submit';
  endpointSave.className = 'action-chip';
  endpointSave.textContent = 'Connect';
  endpointBar.appendChild(endpointSave);
  page.appendChild(endpointBar);

  const connection = document.createElement('div');
  connection.className = 'model-connection';
  page.appendChild(connection);

  const categories = document.createElement('div');
  categories.className = 'model-categories';
  const grid = document.createElement('div');
  grid.className = 'catalog-grid';
  page.append(categories, grid);

  function installedModel(name) {
    return installed.find((model) => model.name === name);
  }

  function labelMap() {
    try { return JSON.parse(localStorage.getItem(getProfileStorageKey('model-labels')) || '{}'); } catch { return {}; }
  }

  function progressMarkup(name) {
    const download = downloads.get(name);
    if (!download) return '';
    const percent = download.total > 0 ? Math.min(100, Math.round(download.completed / download.total * 100)) : 0;
    const progressText = download.total > 0
      ? `${percent}% · ${formatBytes(download.completed)} of ${formatBytes(download.total)}`
      : `${formatBytes(download.completed)} downloaded`;
    return `<div class="download-progress"><div class="progress-label">${escapeText(download.status || 'Downloading…')}</div><div class="progress-track"><div class="progress-value" style="width:${percent}%"></div></div><div class="progress-label">${progressText}</div></div>`;
  }

  function renderCategories() {
    categories.replaceChildren();
    CATEGORIES.forEach((value) => {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = `category-tab${category === value ? ' active' : ''}`;
      tab.textContent = value;
      tab.addEventListener('click', () => {
        category = value;
        renderCards();
      });
      categories.appendChild(tab);
    });
  }

  function renderCards() {
    grid.replaceChildren();
    let models = view === 'store' ? catalog : installed.map((entry) => {
      const known = catalog.find((model) => model.name === entry.name);
      return {
        ...(known || {
          name: entry.name,
          title: entry.name,
          developer: entry.details?.family || 'Ollama library',
          description: 'Installed model. See Ollama model information for this tag.',
          category: 'Installed',
          capabilities: entry.details?.families || [],
          size: formatBytes(entry.size),
          ram: 'Estimate unavailable',
          tags: ['Installed'],
          source: `https://ollama.com/library/${encodeURIComponent(entry.name.split(':')[0])}`,
        }),
        installedEntry: entry,
      };
    });
    if (category !== 'All models' && view === 'store') {
      models = models.filter((model) => model.tags.includes(category) || model.category === category);
    }

    if (view === 'my-models' && !models.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-panel';
      empty.innerHTML = '<h3>No models installed yet</h3><p>Connect an Ollama server, then browse the Model Store to install a model.</p>';
      grid.appendChild(empty);
      return;
    }

    models.forEach((model) => {
      const installedEntry = installedModel(model.name);
      const download = downloads.get(model.name);
      const card = document.createElement('article');
      card.className = 'catalog-card';

      const top = document.createElement('div');
      top.className = 'catalog-card-top';
      const modelIcon = document.createElement('div');
      modelIcon.className = 'model-icon';
      modelIcon.appendChild(Icon({ name: model.category === 'Coding' ? 'folder' : 'spark', size: 20 }));
      const modelTitle = document.createElement('div');
      const labels = labelMap();
      const displayName = labels[model.name] || model.title || model.name;
      modelTitle.innerHTML = `<h3>${escapeText(displayName)}</h3><p>${escapeText(model.developer)}</p>`;
      top.append(modelIcon, modelTitle);
      card.appendChild(top);

      const description = document.createElement('p');
      description.className = 'model-description';
      description.textContent = model.description || 'Model metadata is available from the official Ollama library page.';
      card.appendChild(description);

      const details = document.createElement('div');
      details.className = 'model-facts';
      const actualSize = installedEntry ? formatBytes(installedEntry.size) : model.size || 'See model library';
      [
        ['Model', model.name],
        ['Download / disk', actualSize],
        ['Estimated RAM', model.ram || 'Not published'],
      ].forEach(([label, value]) => {
        const fact = document.createElement('div');
        fact.innerHTML = `<span>${escapeText(label)}</span><strong>${escapeText(value)}</strong>`;
        details.appendChild(fact);
      });
      card.appendChild(details);

      const capabilityList = document.createElement('div');
      capabilityList.className = 'capability-list';
      (model.capabilities || model.tags || []).forEach((capability) => {
        const tag = document.createElement('span');
        tag.className = 'capability';
        tag.textContent = capability;
        capabilityList.appendChild(tag);
      });
      card.appendChild(capabilityList);

      const source = document.createElement('a');
      source.href = model.source;
      source.target = '_blank';
      source.rel = 'noopener noreferrer';
      source.className = 'source-link';
      source.textContent = 'Official Ollama library details';
      card.appendChild(source);

      const compatibility = document.createElement('p');
      compatibility.className = 'compatibility-note';
      const deviceRam = Number(navigator.deviceMemory || 0);
      compatibility.textContent = !localModelRuntimeSupported() && isLoopbackEndpoint(getEndpoint())
        ? 'Local model runtime is not available in this mobile browser. Set a reachable remote Ollama server to manage its models.'
        : deviceRam && deviceRam < 8
          ? `This browser reports approximately ${deviceRam} GB device memory. RAM estimates are approximate; check your device before downloading.`
          : 'RAM requirements are estimates, not a performance guarantee. Exact download size depends on the Ollama model tag.';
      card.appendChild(compatibility);

      const actions = document.createElement('div');
      actions.className = 'catalog-actions';
      if (view === 'store') {
        const install = document.createElement('button');
        install.type = 'button';
        install.className = 'primary-button';
        const mobileWithoutRemoteRuntime = !localModelRuntimeSupported() && isLoopbackEndpoint(getEndpoint());
        install.disabled = Boolean(download?.controller) || !ollamaAvailable || mobileWithoutRemoteRuntime;
        install.textContent = installedEntry
          ? 'Installed'
          : mobileWithoutRemoteRuntime
            ? 'Configure remote server'
            : download?.status === 'failed'
              ? 'Retry download'
              : download?.controller
                ? 'Downloading…'
                : 'Download model';
        if (!installedEntry) install.addEventListener('click', () => pullModel(model.name));
        actions.appendChild(install);
        if (download?.controller) {
          const cancel = document.createElement('button');
          cancel.type = 'button';
          cancel.className = 'action-chip';
          cancel.textContent = 'Cancel';
          cancel.addEventListener('click', () => download.controller.abort());
          actions.appendChild(cancel);
        }
      } else {
        const rename = document.createElement('button');
        rename.type = 'button';
        rename.className = 'action-chip';
        rename.textContent = 'Rename';
        rename.addEventListener('click', () => {
          const next = prompt('Display label', displayName);
          if (next === null || !next.trim()) return;
          const labels = labelMap();
          labels[model.name] = next.trim();
          localStorage.setItem(getProfileStorageKey('model-labels'), JSON.stringify(labels));
          renderCards();
          window.dispatchEvent(new CustomEvent('floro-models-changed'));
        });
        const makeDefault = document.createElement('button');
        makeDefault.type = 'button';
        makeDefault.className = 'action-chip';
        makeDefault.textContent = isDefaultModel(model.name) ? 'Default model' : 'Set default';
        makeDefault.addEventListener('click', () => {
          localStorage.setItem(getProfileStorageKey('default-model'), JSON.stringify({ provider: 'ollama', model: model.name }));
          window.dispatchEvent(new CustomEvent('floro-models-changed'));
          renderCards();
        });
        const detailsButton = document.createElement('button');
        detailsButton.type = 'button';
        detailsButton.className = 'action-chip';
        detailsButton.textContent = 'Details';
        detailsButton.addEventListener('click', () => showDetails(model.name));
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'danger-button';
        remove.textContent = 'Remove';
        remove.addEventListener('click', () => deleteModel(model.name));
        actions.append(rename, makeDefault, detailsButton, remove);
      }
      card.appendChild(actions);

      if (download) {
        const progress = document.createElement('div');
        progress.innerHTML = progressMarkup(model.name);
        card.appendChild(progress);
        if (download.status === 'failed') {
          const error = document.createElement('p');
          error.className = 'error-text';
          error.textContent = download.error;
          card.appendChild(error);
        }
      }
      grid.appendChild(card);
    });
  }

  async function load() {
    connection.textContent = 'Checking Ollama connection…';
    try {
      const [installedData, catalogResponse] = await Promise.all([
        getInstalled(),
        fetch('/api/models/catalog'),
      ]);
      installed = installedData.models || [];
      ollamaAvailable = installedData.available;
      const catalogData = await catalogResponse.json();
      const metadataByName = new Map(MODEL_CATALOG.map((model) => [model.name, model]));
      catalog = (catalogData.models || []).map((model) => ({ ...metadataByName.get(model.name), ...model, ...metadataByName.get(model.name) }));
      const memoryGb = Number(navigator.deviceMemory || 0);
      connection.className = `model-connection ${ollamaAvailable ? 'connected' : 'disconnected'}`;
      connection.textContent = ollamaAvailable
        ? `Connected to ${installedData.endpoint}. ${installed.length} installed model${installed.length === 1 ? '' : 's'}.${memoryGb ? ` Browser-reported device memory: about ${memoryGb} GB (not free memory).` : ''}`
        : `Could not connect to Ollama at ${installedData.endpoint}. ${installedData.error || 'Check that Ollama is running and accessible.'}`;
      renderCategories();
      renderCards();
    } catch (error) {
      ollamaAvailable = false;
      connection.className = 'model-connection disconnected';
      connection.textContent = error.message || 'Could not load Ollama information.';
      renderCategories();
      renderCards();
    }
  }

  async function pullModel(name) {
    if (downloads.get(name)?.controller) return;
    if (!ollamaAvailable) {
      connection.textContent = 'Connect to a running Ollama server before downloading.';
      return;
    }
    if (!localModelRuntimeSupported() && isLoopbackEndpoint(getEndpoint())) {
      connection.textContent = 'This mobile browser cannot install local models. Configure a remote Ollama server instead.';
      return;
    }

    const controller = new AbortController();
    downloads.set(name, { controller, status: 'Starting download', total: 0, completed: 0 });
    renderCards();
    try {
      const response = await fetch('/api/models/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, endpoint: getEndpoint() }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || `Download request failed (${response.status}).`);
      }
      if (!response.body) throw new Error('Ollama download stream is not available.');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let completed = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() || '';
        for (const block of blocks) {
          const type = block.match(/^event:\s*(.+)$/m)?.[1]?.trim();
          const dataLine = block.match(/^data:\s*(.+)$/m)?.[1];
          if (!dataLine) continue;
          const data = JSON.parse(dataLine);
          if (type === 'error') throw new Error(data.message || data.error || 'Ollama download failed.');
          if (type === 'done') {
            completed = true;
            continue;
          }
          const current = downloads.get(name);
          if (!current) continue;
          current.status = data.status || 'Downloading';
          current.total = Number(data.total || current.total || 0);
          current.completed = Number(data.completed || current.completed || 0);
          downloads.set(name, current);
          renderCards();
        }
      }
      if (!completed) throw new Error('The Ollama download ended before it reported completion.');
      downloads.delete(name);
      await load();
      window.dispatchEvent(new CustomEvent('floro-models-changed'));
    } catch (error) {
      const current = downloads.get(name);
      if (error.name === 'AbortError' || controller.signal.aborted) {
        downloads.delete(name);
        connection.textContent = 'Download canceled. Ollama stopped the active pull request.';
      } else {
        downloads.set(name, { ...current, controller: null, status: 'failed', error: error.message || 'Download failed.' });
      }
      renderCards();
    }
  }

  async function showDetails(name) {
    try {
      const response = await fetch('/api/models/show', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, endpoint: getEndpoint() }),
      });
      const details = await response.json();
      if (!response.ok) throw new Error(details.error || 'Could not load model details.');
      let dialog = page.querySelector('.model-details-dialog');
      if (!dialog) {
        dialog = document.createElement('dialog');
        dialog.className = 'model-details-dialog';
        page.appendChild(dialog);
      }
      const title = document.createElement('h3');
      title.textContent = name;
      const summary = document.createElement('p');
      summary.textContent = [
        details.details?.parameter_size,
        details.details?.quantization_level,
        details.details?.family,
        ...(details.details?.families || []),
      ].filter(Boolean).join(' · ') || 'Details retrieved from the configured Ollama server.';
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'action-chip';
      close.textContent = 'Close';
      close.addEventListener('click', () => dialog.close());
      dialog.replaceChildren(title, summary, close);
      dialog.showModal();
    } catch (error) {
      connection.textContent = error.message || 'Could not load model details.';
    }
  }

  async function deleteModel(name) {
    if (!confirm(`Remove ${name} from the configured Ollama server? This deletes the local model files on that server.`)) return;
    try {
      const response = await fetch('/api/models/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, endpoint: getEndpoint() }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Could not remove model (${response.status}).`);
      if (localStorage.getItem(getProfileStorageKey('default-model'))) {
        const savedDefault = JSON.parse(localStorage.getItem(getProfileStorageKey('default-model')));
        if (savedDefault.model === name) localStorage.removeItem(getProfileStorageKey('default-model'));
      }
      await load();
      window.dispatchEvent(new CustomEvent('floro-models-changed'));
    } catch (error) {
      connection.textContent = error.message || 'Could not remove model.';
    }
  }

  endpointBar.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      endpointInput.value = setEndpoint(endpointInput.value);
      window.dispatchEvent(new CustomEvent('floro-models-changed'));
      load();
    } catch (error) {
      connection.className = 'model-connection disconnected';
      connection.textContent = error.message;
    }
  });
  refresh.addEventListener('click', load);
  window.addEventListener('floro-models-changed', () => {
    endpointInput.value = getEndpoint();
    load();
  });

  load();
  return page;
}
