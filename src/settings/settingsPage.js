import { createPurposeField, getLocalProfile, updateLocalProfile } from '../profile.js';
import { Icon } from '../components/icons.js';

function button(text, className = 'action-chip') {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = className;
  element.textContent = text;
  return element;
}

function createField(labelText, input) {
  const label = document.createElement('label');
  label.className = 'local-gate-field settings-field';
  label.textContent = labelText;
  label.appendChild(input);
  return label;
}

export function createSettingsPage({
  onLogout = () => {},
  onDelete = () => {},
  onChangePin = () => {},
  onProfileUpdated = () => {},
} = {}) {
  const page = document.createElement('section');
  page.className = 'manager-page settings-page';
  page.innerHTML = '<div class="page-heading"><div><p class="eyebrow">YOUR ACCOUNT</p><h2>Profile settings</h2><p>Update your details or manage access to this local profile.</p></div></div>';

  let profile = getLocalProfile();
  const profileSection = document.createElement('article');
  profileSection.className = 'settings-card profile-settings-card';
  profileSection.innerHTML = '<h3>Your details</h3><p>Your profile is stored only on this device. Your date of birth is not used to verify identity.</p>';

  const profileSummary = document.createElement('div');
  profileSummary.className = 'settings-profile-summary';
  const profileAvatar = document.createElement('span');
  profileAvatar.className = 'settings-profile-avatar';
  profileAvatar.setAttribute('aria-hidden', 'true');
  profileAvatar.appendChild(Icon({ name: 'user', size: 20 }));
  const profileDetails = document.createElement('span');
  profileDetails.className = 'settings-profile-details';
  const profileName = document.createElement('strong');
  const profileMeta = document.createElement('small');
  profileDetails.append(profileName, profileMeta);
  profileSummary.append(profileAvatar, profileDetails);

  const detailsForm = document.createElement('form');
  detailsForm.className = 'profile-details-form';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.name = 'name';
  nameInput.autocomplete = 'given-name';
  nameInput.maxLength = 60;
  nameInput.required = true;
  const nameLabel = createField('Name', nameInput);
  const dobInput = document.createElement('input');
  dobInput.type = 'date';
  dobInput.name = 'dateOfBirth';
  dobInput.required = true;
  const now = new Date();
  dobInput.max = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const dobLabel = createField('Date of birth', dobInput);
  const purposeField = createPurposeField(profile?.purpose || '');
  const message = document.createElement('p');
  message.className = 'settings-hint';
  message.setAttribute('role', 'status');
  const save = button('Save details', 'primary-button');
  save.type = 'submit';
  detailsForm.append(nameLabel, dobLabel, purposeField.element, message, save);

  function displayProfile(nextProfile) {
    profile = nextProfile;
    nameInput.value = profile?.name || '';
    dobInput.value = profile?.dateOfBirth || '';
    profileName.textContent = profile?.name || 'Local profile';
    profileMeta.textContent = profile?.purpose || 'Personal workspace on this device';
  }

  displayProfile(profile);
  detailsForm.addEventListener('submit', (event) => {
    event.preventDefault();
    message.textContent = '';
    try {
      if (!nameInput.reportValidity() || !dobInput.reportValidity() || !purposeField.validate()) return;
      const updated = updateLocalProfile(profile.id, {
        name: nameInput.value,
        dateOfBirth: dobInput.value,
        purpose: purposeField.getValue(),
      });
      displayProfile(updated);
      onProfileUpdated(updated);
      message.textContent = 'Your details have been saved on this device.';
      message.className = 'settings-hint success';
    } catch (error) {
      message.textContent = error.message || 'Could not save your profile details.';
      message.className = 'settings-hint error';
    }
  });
  profileSection.append(profileSummary, detailsForm);

  const accessSection = document.createElement('article');
  accessSection.className = 'settings-card';
  accessSection.innerHTML = '<h3>Access and security</h3><p>The local PIN is a basic interface lock. It does not encrypt your data.</p>';
  const accessActions = document.createElement('div');
  accessActions.className = 'settings-account-actions';
  const changePin = button('Change PIN', 'action-chip settings-action-button');
  changePin.prepend(Icon({ name: 'lock', size: 18 }));
  changePin.addEventListener('click', () => onChangePin(profile));
  const logout = button('Log out', 'action-chip settings-action-button');
  logout.prepend(Icon({ name: 'logout', size: 18 }));
  logout.addEventListener('click', onLogout);
  accessActions.append(changePin, logout);
  accessSection.appendChild(accessActions);

  const deleteSection = document.createElement('article');
  deleteSection.className = 'settings-card settings-danger-card';
  deleteSection.innerHTML = '<h3>Delete this profile</h3><p>Permanently delete this profile and its local chats and preferences from this device. This cannot be undone.</p>';
  const deleteButton = button('Delete profile and its data', 'danger-button');
  deleteButton.addEventListener('click', () => {
    if (confirm(`Delete ${profile.name} and permanently remove their local chats and preferences? This cannot be undone.`)) {
      onDelete(profile);
    }
  });
  deleteSection.appendChild(deleteButton);

  page.append(profileSection, accessSection, deleteSection);
  return page;
}
