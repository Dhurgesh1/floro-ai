import { Icon } from './components/icons.js';

const PROFILES_KEY = 'floro:profiles';
const ACTIVE_PROFILE_KEY = 'floro:active-profile-id';
const LEGACY_PROFILE_KEY = 'floro:local-profile';
const PROFILE_DATA_PREFIX = 'floro:profile:';
const PIN_ITERATIONS = 250000;
export const PROFILE_PURPOSE_OPTIONS = [
  'Learning and studying',
  'Writing and communication',
  'Coding and software development',
  'Research and current information',
  'Work and productivity',
  'Creative projects',
  'Personal assistance',
];
const LEGACY_DATA_KEYS = [
  ['floro:projects', 'projects'],
  ['floro:custom-instructions', 'custom-instructions'],
  ['floro:model-labels', 'model-labels'],
  ['floro:default-model', 'default-model'],
  ['floro:preferences', 'preferences'],
];

function readProfiles() {
  try {
    const profiles = JSON.parse(localStorage.getItem(PROFILES_KEY) || '[]');
    return Array.isArray(profiles) ? profiles.filter((profile) => (
      profile && typeof profile.id === 'string'
      && typeof profile.name === 'string'
      && typeof profile.pinSalt === 'string'
      && typeof profile.pinHash === 'string'
    )) : [];
  } catch {
    return [];
  }
}

function moveLegacyLocalData(profileId) {
  for (const [legacyKey, scopedName] of LEGACY_DATA_KEYS) {
    const value = localStorage.getItem(legacyKey);
    if (value !== null) {
      localStorage.setItem(getProfileStorageKey(scopedName, profileId), value);
      localStorage.removeItem(legacyKey);
    }
  }
}

export function getLocalProfiles() {
  const profiles = readProfiles();
  if (profiles.length) return profiles;
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_PROFILE_KEY) || 'null');
    if (legacy && typeof legacy.name === 'string' && legacy.pinSalt && legacy.pinHash) {
      const migrated = {
        id: crypto.randomUUID(),
        name: legacy.name,
        dateOfBirth: '',
        purpose: '',
        pinSalt: legacy.pinSalt,
        pinHash: legacy.pinHash,
        createdAt: legacy.createdAt || new Date().toISOString(),
      };
      localStorage.setItem(PROFILES_KEY, JSON.stringify([migrated]));
      localStorage.removeItem(LEGACY_PROFILE_KEY);
      moveLegacyLocalData(migrated.id);
      return [migrated];
    }
  } catch {}
  return [];
}

export function getActiveProfileId() {
  return localStorage.getItem(ACTIVE_PROFILE_KEY);
}

export function setActiveProfileId(profileId) {
  if (profileId === null) {
    localStorage.removeItem(ACTIVE_PROFILE_KEY);
    return;
  }
  if (!getLocalProfiles().some((profile) => profile.id === profileId)) {
    throw new Error('Choose a valid local profile.');
  }
  localStorage.setItem(ACTIVE_PROFILE_KEY, profileId);
}

export function getProfileStorageKey(name, profileId = getActiveProfileId()) {
  return `${PROFILE_DATA_PREFIX}${profileId || 'unselected'}:${name}`;
}

export function getLocalProfile(profileId = getActiveProfileId()) {
  if (!profileId) return null;
  return getLocalProfiles().find((profile) => profile.id === profileId) || null;
}

function pinBytes(pin) {
  if (!/^\d{6}$/.test(pin)) throw new Error('Enter a six-digit PIN.');
  return new TextEncoder().encode(pin);
}

function toHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function fromHex(value) {
  if (!/^(?:[a-f0-9]{2})+$/i.test(value)) throw new Error('Saved PIN data is invalid.');
  return Uint8Array.from(value.match(/.{2}/g), (byte) => Number.parseInt(byte, 16));
}

async function derivePinHash(pin, salt) {
  if (!globalThis.crypto?.subtle) throw new Error('Secure PIN storage is unavailable in this browser.');
  const key = await crypto.subtle.importKey('raw', pinBytes(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PIN_ITERATIONS, hash: 'SHA-256' },
    key,
    256,
  );
  return toHex(new Uint8Array(bits));
}

async function makePinRecord(pin) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return {
    pinSalt: toHex(salt),
    pinHash: await derivePinHash(pin, salt),
  };
}

function validateDateOfBirth(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Enter a valid date of birth.');
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  const today = new Date();
  const todayValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  if (
    date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day
    || value > todayValue
  ) throw new Error('Enter a valid date of birth that is not in the future.');
}

export function createPurposeField(initialValue = '') {
  const container = document.createElement('div');
  container.className = 'profile-purpose-field';
  const label = document.createElement('label');
  label.className = 'local-gate-field';
  label.textContent = 'What will you use Floro AI for?';
  const select = document.createElement('select');
  select.name = 'purposeCategory';
  select.required = true;
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Choose a purpose';
  select.appendChild(placeholder);
  PROFILE_PURPOSE_OPTIONS.forEach((purpose) => {
    const option = document.createElement('option');
    option.value = purpose;
    option.textContent = purpose;
    select.appendChild(option);
  });
  const otherOption = document.createElement('option');
  otherOption.value = 'other';
  otherOption.textContent = 'Other';
  select.appendChild(otherOption);
  label.appendChild(select);

  const otherLabel = document.createElement('label');
  otherLabel.className = 'local-gate-field profile-purpose-other';
  otherLabel.textContent = 'Tell us a little more';
  const details = document.createElement('textarea');
  details.name = 'purposeDetails';
  details.maxLength = 240;
  details.rows = 3;
  details.placeholder = 'Describe what you would like help with';
  otherLabel.appendChild(details);

  const isPreset = PROFILE_PURPOSE_OPTIONS.includes(initialValue);
  if (isPreset) select.value = initialValue;
  else if (initialValue) {
    select.value = 'other';
    details.value = initialValue;
  }
  const updateOtherVisibility = () => {
    const showDetails = select.value === 'other';
    otherLabel.hidden = !showDetails;
    details.required = showDetails;
  };
  select.addEventListener('change', updateOtherVisibility);
  updateOtherVisibility();
  container.append(label, otherLabel);
  return {
    element: container,
    validate() {
      return select.reportValidity() && (select.value !== 'other' || details.reportValidity());
    },
    getValue() {
      return select.value === 'other' ? details.value.trim() : select.value;
    },
  };
}

export async function saveLocalProfile({ name, dateOfBirth, purpose, pin }) {
  const normalizedName = String(name || '').trim();
  const normalizedPurpose = String(purpose || '').trim();
  if (!normalizedName || normalizedName.length > 60) throw new Error('Enter a name up to 60 characters.');
  validateDateOfBirth(dateOfBirth);
  if (!normalizedPurpose || normalizedPurpose.length > 240) {
    throw new Error('Describe what you plan to use Floro AI for (up to 240 characters).');
  }
  const profiles = getLocalProfiles();
  const profile = {
    id: crypto.randomUUID(),
    name: normalizedName,
    dateOfBirth,
    purpose: normalizedPurpose,
    ...await makePinRecord(pin),
    createdAt: new Date().toISOString(),
  };
  if (!profiles.length) moveLegacyLocalData(profile.id);
  profiles.push(profile);
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
  return profile;
}

export function updateLocalProfile(profileId, { name, dateOfBirth, purpose }) {
  const normalizedName = String(name || '').trim();
  const normalizedPurpose = String(purpose || '').trim();
  if (!normalizedName || normalizedName.length > 60) throw new Error('Enter a name up to 60 characters.');
  validateDateOfBirth(dateOfBirth);
  if (!normalizedPurpose || normalizedPurpose.length > 240) {
    throw new Error('Choose a purpose or describe it in up to 240 characters.');
  }
  const profiles = getLocalProfiles();
  const index = profiles.findIndex((profile) => profile.id === profileId);
  if (index < 0) throw new Error('That local profile no longer exists.');
  profiles[index] = {
    ...profiles[index],
    name: normalizedName,
    dateOfBirth,
    purpose: normalizedPurpose,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
  return profiles[index];
}

export async function resetLocalPin(profileId, pin) {
  const profiles = getLocalProfiles();
  const index = profiles.findIndex((profile) => profile.id === profileId);
  if (index < 0) throw new Error('That local profile no longer exists.');
  profiles[index] = { ...profiles[index], ...await makePinRecord(pin) };
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
  return profiles[index];
}

export async function verifyLocalPin(pin, profileId) {
  const profile = getLocalProfile(profileId);
  if (!profile) return false;
  const actualHash = await derivePinHash(pin, fromHex(profile.pinSalt));
  if (actualHash.length !== profile.pinHash.length) return false;
  let difference = 0;
  for (let index = 0; index < actualHash.length; index += 1) {
    difference |= actualHash.charCodeAt(index) ^ profile.pinHash.charCodeAt(index);
  }
  return difference === 0;
}

export function deleteLocalProfile(profileId) {
  const profiles = getLocalProfiles().filter((profile) => profile.id !== profileId);
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
  if (getActiveProfileId() === profileId) localStorage.removeItem(ACTIVE_PROFILE_KEY);
  const profilePrefix = `${PROFILE_DATA_PREFIX}${profileId}:`;
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (key && key.startsWith(profilePrefix)) localStorage.removeItem(key);
  }
  return profiles;
}

function createGateCard() {
  const page = document.createElement('main');
  page.className = 'local-gate';
  const card = document.createElement('section');
  card.className = 'local-gate-card';
  const logo = document.createElement('img');
  logo.src = '/Floro-main.png';
  logo.alt = 'Floro AI';
  logo.className = 'local-gate-wordmark';
  card.appendChild(logo);
  const accent = document.createElement('div');
  accent.className = 'local-gate-accent';
  accent.setAttribute('aria-hidden', 'true');
  card.appendChild(accent);
  page.appendChild(card);
  return { page, card };
}

function createProfileAvatar(name, className = '') {
  const avatar = document.createElement('span');
  avatar.className = `profile-avatar${className ? ` ${className}` : ''}`;
  avatar.setAttribute('aria-hidden', 'true');
  avatar.appendChild(Icon({ name: 'user', size: 23 }));
  return avatar;
}

function createGateKicker(text) {
  const kicker = document.createElement('p');
  kicker.className = 'local-gate-kicker';
  kicker.textContent = text;
  return kicker;
}

function createPinField(labelText, autocomplete = 'off') {
  const label = document.createElement('label');
  label.className = 'local-gate-field';
  label.textContent = labelText;
  const input = document.createElement('input');
  input.type = 'password';
  input.inputMode = 'numeric';
  input.pattern = '[0-9]{6}';
  input.minLength = 6;
  input.maxLength = 6;
  input.autocomplete = autocomplete;
  input.required = true;
  input.setAttribute('aria-label', labelText);
  label.appendChild(input);
  return { label, input };
}

function createMessageArea() {
  const message = document.createElement('p');
  message.className = 'local-gate-message';
  message.setAttribute('role', 'alert');
  return message;
}

function createGateButton(text, className = 'primary-button') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = text;
  return button;
}

export function createProfileSetupPage({ resetPinProfile, onComplete, onCancel }) {
  const resetPin = Boolean(resetPinProfile);
  const { page, card } = createGateCard();
  const heading = document.createElement('h1');
  heading.textContent = resetPin ? 'Reset local PIN' : 'Create a Floro AI profile';
  heading.className = 'local-gate-title';
  const description = document.createElement('p');
  description.className = 'local-gate-description';
  description.textContent = resetPin
    ? `Choose a new six-digit PIN for ${resetPinProfile.name}. Their chats will stay on this device.`
    : 'Tell us a little about yourself before setting your local PIN.';
  card.append(createGateKicker(resetPin ? 'PROFILE SECURITY' : 'YOUR DEVICE · YOUR SPACE'), heading, description);

  const form = document.createElement('form');
  form.className = 'local-gate-form';
  const profileStep = document.createElement('div');
  profileStep.className = 'local-gate-step';
  profileStep.hidden = resetPin;
  const pinStep = document.createElement('div');
  pinStep.className = 'local-gate-step';
  pinStep.hidden = !resetPin;
  const nameInput = document.createElement('input');
  const dobInput = document.createElement('input');
  const purposeField = createPurposeField();
  if (!resetPin) {
    const nameLabel = document.createElement('label');
    nameLabel.className = 'local-gate-field';
    nameLabel.textContent = 'Name';
    nameInput.type = 'text';
    nameInput.name = 'name';
    nameInput.autocomplete = 'given-name';
    nameInput.maxLength = 60;
    nameInput.required = true;
    nameLabel.appendChild(nameInput);

    const dobLabel = document.createElement('label');
    dobLabel.className = 'local-gate-field';
    dobLabel.textContent = 'Date of birth';
    dobInput.type = 'date';
    dobInput.name = 'dateOfBirth';
    const now = new Date();
    dobInput.max = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    dobInput.required = true;
    dobLabel.appendChild(dobInput);

    profileStep.append(nameLabel, dobLabel, purposeField.element);
  }

  const pin = createPinField('Six-digit PIN', 'new-password');
  const confirmation = createPinField('Confirm PIN', 'new-password');
  pinStep.append(pin.label, confirmation.label);
  const stepText = document.createElement('p');
  stepText.className = 'local-gate-step-text sr-only';
  stepText.setAttribute('aria-live', 'polite');
  stepText.textContent = resetPin ? 'Set a new PIN' : 'Step 1 of 2';
  const stepper = document.createElement('ol');
  stepper.className = 'profile-stepper';
  stepper.setAttribute('aria-label', 'Profile setup steps');
  const stepLabels = ['Your details', 'Secure your profile'];
  const stepItems = stepLabels.map((label, index) => {
    const item = document.createElement('li');
    item.className = 'profile-step';
    const marker = document.createElement('span');
    marker.className = 'profile-step-marker';
    marker.textContent = String(index + 1);
    const labelElement = document.createElement('span');
    labelElement.textContent = label;
    item.append(marker, labelElement);
    stepper.appendChild(item);
    return item;
  });
  stepper.hidden = resetPin;
  const message = createMessageArea();
  const actions = document.createElement('div');
  actions.className = 'local-gate-actions';
  const next = createGateButton('Continue to PIN');
  const back = createGateButton('Back', 'action-chip');
  const submit = createGateButton(resetPin ? 'Save new PIN' : 'Create profile');
  submit.type = 'submit';
  if (resetPin) {
    actions.appendChild(submit);
  } else {
    actions.append(next);
  }
  form.append(stepText, stepper, profileStep, pinStep, message, actions);

  next.addEventListener('click', () => {
    message.textContent = '';
    if (!nameInput.reportValidity() || !dobInput.reportValidity() || !purposeField.validate()) return;
    profileStep.hidden = true;
    pinStep.hidden = false;
    stepItems[0].classList.add('complete');
    stepItems[1].classList.add('active');
    stepItems[1].setAttribute('aria-current', 'step');
    stepItems[0].removeAttribute('aria-current');
    actions.replaceChildren(back, submit);
    stepText.textContent = 'Step 2 of 2';
    pin.input.focus();
  });
  back.addEventListener('click', () => {
    message.textContent = '';
    pinStep.hidden = true;
    profileStep.hidden = false;
    stepItems[0].classList.remove('complete');
    stepItems[0].classList.add('active');
    stepItems[0].setAttribute('aria-current', 'step');
    stepItems[1].classList.remove('active');
    stepItems[1].removeAttribute('aria-current');
    actions.replaceChildren(next);
    stepText.textContent = 'Step 1 of 2';
  });
  if (!resetPin) stepItems[0].classList.add('active');
  if (!resetPin) stepItems[0].setAttribute('aria-current', 'step');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.textContent = '';
    if (pin.input.value !== confirmation.input.value) {
      message.textContent = 'The PIN entries do not match.';
      return;
    }
    submit.disabled = true;
    try {
      const savedProfile = resetPin
        ? await resetLocalPin(resetPinProfile.id, pin.input.value)
        : await saveLocalProfile({
            name: nameInput.value,
            dateOfBirth: dobInput.value,
            purpose: purposeField.getValue(),
            pin: pin.input.value,
          });
      await onComplete(savedProfile);
    } catch (error) {
      message.textContent = error.message || 'Could not save this local profile.';
    } finally {
      submit.disabled = false;
    }
  });
  card.appendChild(form);

  const note = document.createElement('p');
  note.className = 'local-gate-note local-gate-note-card';
  const noteIcon = document.createElement('span');
  noteIcon.className = 'local-gate-note-icon';
  noteIcon.setAttribute('aria-hidden', 'true');
  noteIcon.appendChild(Icon({ name: 'lock', size: 18 }));
  const noteText = document.createElement('span');
  noteText.textContent = resetPin
    ? 'PIN reset does not verify identity. Anyone who can reset this PIN can access this profile on this device.'
    : 'Your date of birth stays on this device and is not used to verify identity. Your intended use is stored locally and included with AI requests to personalize responses. The PIN is a basic interface lock, not encryption.';
  note.append(noteIcon, noteText);
  card.appendChild(note);
  if (onCancel) {
    const cancel = createGateButton('Cancel', 'text-button local-gate-reset');
    cancel.addEventListener('click', onCancel);
    card.appendChild(cancel);
  }
  return page;
}

export function createProfilePickerPage(profiles, { onSelect, onCreate, onDelete }) {
  const { page, card } = createGateCard();
  card.classList.add('profile-picker-card');
  const activeProfiles = profiles.length;
  card.append(createGateKicker('LOCAL PROFILES'),);
  const heading = document.createElement('h1');
  heading.textContent = 'Who is using Floro AI?';
  heading.className = 'local-gate-title';
  const description = document.createElement('p');
  description.className = 'local-gate-description';
  description.textContent = 'Choose a local profile, or create one for another person.';
  const count = document.createElement('span');
  count.className = 'profile-count';
  count.textContent = `${activeProfiles} ${activeProfiles === 1 ? 'profile' : 'profiles'} on this device`;
  const list = document.createElement('div');
  list.className = 'local-profile-list';
  profiles.forEach((profile) => {
    const row = document.createElement('div');
    row.className = 'local-profile-row';
    const select = createGateButton('', 'local-profile-select');
    select.setAttribute('aria-label', `Continue as ${profile.name}`);
    select.appendChild(createProfileAvatar(profile.name));
    const details = document.createElement('span');
    details.className = 'local-profile-details';
    const name = document.createElement('strong');
    name.textContent = profile.name;
    const subtitle = document.createElement('span');
    subtitle.textContent = 'Personal workspace';
    details.append(name, subtitle);
    const arrow = document.createElement('span');
    arrow.className = 'local-profile-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.appendChild(Icon({ name: 'chevron', size: 17 }));
    select.append(details, arrow);
    select.addEventListener('click', () => onSelect(profile));
    const remove = createGateButton('', 'profile-delete-button');
    remove.title = `Delete ${profile.name}`;
    remove.setAttribute('aria-label', `Delete ${profile.name}`);
    remove.appendChild(Icon({ name: 'trash', size: 17 }));
    remove.addEventListener('click', () => {
      if (confirm(`Delete ${profile.name} and permanently remove their local chats and profile data? This cannot be undone.`)) {
        onDelete(profile);
      }
    });
    row.append(select, remove);
    list.appendChild(row);
  });
  const create = createGateButton('', 'local-profile-create');
  const plus = document.createElement('span');
  plus.className = 'local-profile-create-icon';
  plus.appendChild(Icon({ name: 'plus', size: 20 }));
  const createLabel = document.createElement('span');
  createLabel.textContent = 'Create another profile';
  const createHint = document.createElement('small');
  createHint.textContent = 'A separate space for another person';
  create.append(plus, createLabel, createHint);
  create.addEventListener('click', onCreate);
  card.append(heading, description, count, list, create);
  return page;
}

export function createPinLockPage(profile, { onUnlock, onResetPin, onSwitchUser }) {
  const { page, card } = createGateCard();
  card.classList.add('profile-lock-card');
  card.append(createGateKicker('PROFILE LOCKED'));
  const identity = document.createElement('div');
  identity.className = 'local-profile-identity';
  identity.appendChild(createProfileAvatar(profile.name, 'large'));
  const identityDetails = document.createElement('div');
  const identityName = document.createElement('strong');
  identityName.textContent = profile.name;
  const identityLabel = document.createElement('span');
  identityLabel.textContent = 'Local profile';
  identityDetails.append(identityName, identityLabel);
  identity.appendChild(identityDetails);
  const heading = document.createElement('h1');
  heading.textContent = 'Welcome back';
  heading.className = 'local-gate-title';
  const description = document.createElement('p');
  description.className = 'local-gate-description';
  description.textContent = 'Enter this profile’s local PIN to continue.';
  const form = document.createElement('form');
  form.className = 'local-gate-form';
  const pin = createPinField('Six-digit PIN', 'current-password');
  const message = createMessageArea();
  const submit = createGateButton('Unlock Floro AI');
  submit.type = 'submit';
  form.append(pin.label, message, submit);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.textContent = '';
    submit.disabled = true;
    try {
      if (await verifyLocalPin(pin.input.value, profile.id)) await onUnlock(profile);
      else message.textContent = 'That PIN is incorrect.';
    } catch (error) {
      message.textContent = error.message || 'Could not check the local PIN.';
    } finally {
      submit.disabled = false;
      pin.input.value = '';
      pin.input.focus();
    }
  });
  const reset = createGateButton('Forgot PIN? Reset it on this device', 'text-button local-gate-reset');
  reset.addEventListener('click', () => onResetPin(profile));
  const switchUser = createGateButton('Choose a different user', 'action-chip local-gate-reset');
  switchUser.addEventListener('click', onSwitchUser);
  card.append(identity, heading, description, form, reset, switchUser);
  const note = document.createElement('p');
  note.className = 'local-gate-note local-gate-note-card';
  note.textContent = 'This PIN only deters casual access; it does not encrypt chats or verify identity.';
  card.appendChild(note);
  return page;
}

export function createChangePinPage(profile, { onComplete, onCancel }) {
  const { page, card } = createGateCard();
  card.classList.add('profile-lock-card');
  card.append(createGateKicker('PROFILE SECURITY'));
  const heading = document.createElement('h1');
  heading.className = 'local-gate-title';
  heading.textContent = 'Change your PIN';
  const description = document.createElement('p');
  description.className = 'local-gate-description';
  description.textContent = `Update the local PIN for ${profile.name}.`;
  const form = document.createElement('form');
  form.className = 'local-gate-form';
  const currentPin = createPinField('Current six-digit PIN', 'current-password');
  const newPin = createPinField('New six-digit PIN', 'new-password');
  const confirmation = createPinField('Confirm new PIN', 'new-password');
  const message = createMessageArea();
  const actions = document.createElement('div');
  actions.className = 'local-gate-actions';
  const cancel = createGateButton('Cancel', 'action-chip');
  cancel.addEventListener('click', onCancel);
  const save = createGateButton('Save new PIN');
  save.type = 'submit';
  actions.append(cancel, save);
  form.append(currentPin.label, newPin.label, confirmation.label, message, actions);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.textContent = '';
    if (newPin.input.value !== confirmation.input.value) {
      message.textContent = 'The new PIN entries do not match.';
      return;
    }
    save.disabled = true;
    try {
      if (!(await verifyLocalPin(currentPin.input.value, profile.id))) {
        message.textContent = 'The current PIN is incorrect.';
        return;
      }
      await onComplete(await resetLocalPin(profile.id, newPin.input.value));
    } catch (error) {
      message.textContent = error.message || 'Could not change the local PIN.';
    } finally {
      save.disabled = false;
      currentPin.input.value = '';
      newPin.input.value = '';
      confirmation.input.value = '';
    }
  });
  card.append(heading, description, form);
  const note = document.createElement('p');
  note.className = 'local-gate-note local-gate-note-card';
  note.textContent = 'Your PIN stays on this device. It is a basic interface lock and does not encrypt your data.';
  card.appendChild(note);
  return page;
}

export function createProfileDeletePage(profile, { onDelete, onCancel }) {
  const { page, card } = createGateCard();
  card.classList.add('profile-delete-card');
  card.append(createGateKicker('PERMANENT ACTION'));
  const heading = document.createElement('h1');
  heading.textContent = `Delete ${profile.name}?`;
  heading.className = 'local-gate-title';
  const description = document.createElement('p');
  description.className = 'local-gate-description';
  description.textContent = 'Enter this profile’s PIN to permanently delete its local chats and profile data.';
  const form = document.createElement('form');
  form.className = 'local-gate-form';
  const pin = createPinField('Six-digit PIN', 'current-password');
  const message = createMessageArea();
  const actions = document.createElement('div');
  actions.className = 'local-gate-actions';
  const cancel = createGateButton('Cancel', 'action-chip');
  cancel.addEventListener('click', onCancel);
  const remove = createGateButton('Delete profile and data', 'danger-button');
  remove.type = 'submit';
  actions.append(cancel, remove);
  form.append(pin.label, message, actions);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.textContent = '';
    remove.disabled = true;
    try {
      if (!(await verifyLocalPin(pin.input.value, profile.id))) {
        message.textContent = 'That PIN is incorrect.';
        return;
      }
      await onDelete(profile);
    } catch (error) {
      message.textContent = error.message || 'Could not delete the local profile.';
    } finally {
      remove.disabled = false;
      pin.input.value = '';
    }
  });
  card.append(heading, description, form);
  const note = document.createElement('p');
  note.className = 'local-gate-note';
  note.textContent = 'This deletion cannot be undone. PIN reset does not verify identity.';
  card.appendChild(note);
  return page;
}
