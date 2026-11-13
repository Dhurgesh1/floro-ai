import { getSupabaseSetupMessage, supabaseConfigured } from '../supabase.js';

const ENDPOINT_KEY = 'floro:ollama-endpoint';
const DEFAULT_ENDPOINT = 'http://localhost:11434';

function button(text, className = 'action-chip') {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = className;
  element.textContent = text;
  return element;
}

export function createSettingsPage({ onNavigate = () => {} } = {}) {
  const page = document.createElement('section');
  page.className = 'manager-page settings-page';
  page.innerHTML = '<div class="page-heading"><div><p class="eyebrow">PREFERENCES</p><h2>Settings</h2><p>Manage model connectivity, privacy, and account sync.</p></div></div>';

  const modelSection = document.createElement('article');
  modelSection.className = 'settings-card';
  modelSection.innerHTML = '<h3>Ollama connection</h3><p>Downloads and local model requests are sent to this server. On mobile, use a reachable remote Ollama server. Model files are stored in Ollama’s configured model directory; Floro cannot safely change that path through Ollama’s API.</p>';
  const endpointForm = document.createElement('form');
  endpointForm.className = 'endpoint-bar';
  endpointForm.innerHTML = '<label>Ollama server URL<input name="endpoint" type="url" autocomplete="url" spellcheck="false"></label>';
  const endpointInput = endpointForm.querySelector('input');
  endpointInput.value = localStorage.getItem(ENDPOINT_KEY) || DEFAULT_ENDPOINT;
  const saveEndpoint = button('Save server', 'primary-button');
  saveEndpoint.type = 'submit';
  endpointForm.appendChild(saveEndpoint);
  const endpointMessage = document.createElement('div');
  endpointMessage.className = 'settings-hint';
  endpointForm.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const url = new URL(endpointInput.value);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Use an HTTP or HTTPS URL without embedded credentials, query strings, or fragments.');
      localStorage.setItem(ENDPOINT_KEY, url.toString().replace(/\/$/, ''));
      localStorage.setItem('floro:preferences-updated-at', new Date().toISOString());
      window.dispatchEvent(new CustomEvent('floro-data-changed'));
      endpointMessage.textContent = 'Ollama URL saved on this device.';
      endpointMessage.className = 'settings-hint success';
      window.dispatchEvent(new CustomEvent('floro-models-changed'));
    } catch (error) {
      endpointMessage.textContent = error.message || 'Invalid server URL.';
      endpointMessage.className = 'settings-hint error';
    }
  });
  modelSection.append(endpointForm, endpointMessage);

  const accountSection = document.createElement('article');
  accountSection.className = 'settings-card';
  accountSection.innerHTML = `<h3>Supabase account and sync</h3><p>${supabaseConfigured ? 'Supabase is configured. Sign in to manage your profile and sync.' : getSupabaseSetupMessage()}</p>`;
  const accountButton = button('Open account settings', 'primary-button');
  accountButton.addEventListener('click', () => onNavigate('account'));
  accountSection.appendChild(accountButton);

  const privacySection = document.createElement('article');
  privacySection.className = 'settings-card';
  privacySection.innerHTML = '<h3>Data and privacy</h3><p>Chat history is stored locally in IndexedDB. Cloud sync is opt-in and requires a Supabase account. AI requests go to the selected provider. When live search is configured, current-information questions send only the latest user message to Brave Search; search excerpts and source links are then shared with the selected AI provider as context.</p>';

  const instructionsSection = document.createElement('article');
  instructionsSection.className = 'settings-card';
  instructionsSection.innerHTML = '<h3>Custom instructions</h3><p>These instructions are sent with chat requests and are included in cloud preference sync after you opt in.</p>';
  const instructions = document.createElement('textarea');
  instructions.className = 'settings-instructions';
  instructions.rows = 4;
  instructions.maxLength = 20000;
  instructions.placeholder = 'Describe how Floro AI should respond…';
  instructions.value = localStorage.getItem('floro:custom-instructions') || '';
  const saveInstructions = button('Save instructions', 'primary-button');
  const instructionsMessage = document.createElement('div');
  instructionsMessage.className = 'settings-hint';
  saveInstructions.addEventListener('click', () => {
    localStorage.setItem('floro:custom-instructions', instructions.value.trim());
    localStorage.setItem('floro:preferences-updated-at', new Date().toISOString());
    window.dispatchEvent(new CustomEvent('floro-data-changed'));
    instructionsMessage.textContent = 'Custom instructions saved on this device.';
    instructionsMessage.className = 'settings-hint success';
  });
  instructionsSection.append(instructions, saveInstructions, instructionsMessage);

  page.append(modelSection, accountSection, instructionsSection, privacySection);
  return page;
}
