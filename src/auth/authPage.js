import { authRedirectUrl, getSupabaseSetupMessage, supabase, supabaseConfigured } from '../supabase.js';
import { downloadCloudConversations, getProfile, saveUserProfile, setCloudSyncEnabled, syncLocalConversations } from './cloudSync.js';

function button(text, className = 'action-chip') {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = className;
  element.textContent = text;
  return element;
}

function field(labelText, type, name, autocomplete) {
  const label = document.createElement('label');
  label.className = 'auth-field';
  label.textContent = labelText;
  const input = document.createElement('input');
  input.type = type;
  input.name = name;
  input.autocomplete = autocomplete;
  input.required = type !== 'file';
  label.appendChild(input);
  return { label, input };
}

function googleIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5h6.6c3.9-3.6 6.1-8.8 6.1-14.9Z"/><path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.6-5c-1.8 1.2-4.1 2-6.9 2-5.3 0-9.8-3.6-11.4-8.4H5.8v5.2A20 20 0 0 0 24 44Z"/><path fill="#FBBC05" d="M12.6 27.7a12 12 0 0 1 0-7.5V15H5.8a20 20 0 0 0 0 18Z"/><path fill="#EA4335" d="M24 11.8c3 0 5.7 1 7.8 3.1l5.8-5.8C34.1 5.8 29.5 4 24 4A20 20 0 0 0 5.8 15l6.8 5.2c1.6-4.8 6.1-8.4 11.4-8.4Z"/>';
  return svg;
}

export function createAuthPage({ onUserChanged = () => {} } = {}) {
  const page = document.createElement('section');
  page.className = 'manager-page auth-page';
  page.innerHTML = '<div class="page-heading"><div><p class="eyebrow">YOUR ACCOUNT</p><h2>Account</h2><p>Sign in to sync your Floro AI data across devices.</p></div></div>';

  const card = document.createElement('div');
  card.className = 'auth-card';
  page.appendChild(card);

  if (!supabaseConfigured || !supabase) {
    card.innerHTML = `<h3>Connect your Supabase project</h3><p>${getSupabaseSetupMessage()}</p><div class="auth-hint">Redirect URL for Google OAuth: <code>${authRedirectUrl}</code></div>`;
    return page;
  }

  let mode = 'login';
  let errorArea;
  let formArea;

  function showMessage(message, type = 'error') {
    errorArea.className = `auth-message ${type}`;
    errorArea.textContent = message;
  }

  async function renderSignedIn(user) {
    errorArea = document.createElement('div');
    errorArea.className = 'auth-message';
    let profileError = '';
    try { await saveUserProfile(user); } catch (error) { profileError = error.message || 'Could not save your profile.'; }
    let profile = null;
    try { profile = await getProfile(); } catch (error) { profileError = error.message || 'Could not load your profile.'; }
    card.replaceChildren();

    const accountHeading = document.createElement('div');
    accountHeading.className = 'account-heading';
    const avatar = document.createElement('img');
    avatar.className = 'account-avatar';
    avatar.src = profile?.avatar_url || user.user_metadata?.avatar_url || '/Floro.png';
    avatar.alt = 'Profile picture';
    const name = document.createElement('div');
    name.innerHTML = `<strong></strong><span></span>`;
    name.querySelector('strong').textContent = profile?.display_name || user.user_metadata?.full_name || user.email || 'Floro user';
    name.querySelector('span').textContent = user.email || '';
    accountHeading.append(avatar, name);

    const provider = user.app_metadata?.provider || 'email';
    const providerText = document.createElement('p');
    providerText.className = 'auth-hint';
    providerText.textContent = `Signed in with ${provider}.`;

    const profileForm = document.createElement('form');
    profileForm.className = 'auth-form';
    const display = field('Display name', 'text', 'display_name', 'name');
    display.input.value = profile?.display_name || user.user_metadata?.full_name || '';
    const avatarInput = field('Profile image URL', 'url', 'avatar_url', 'url');
    avatarInput.input.value = profile?.avatar_url || user.user_metadata?.avatar_url || '';
    const uploadLabel = document.createElement('label');
    uploadLabel.className = 'auth-field';
    uploadLabel.textContent = 'Upload profile picture (PNG, JPEG, or WebP; up to 2 MB)';
    const uploadInput = document.createElement('input');
    uploadInput.type = 'file';
    uploadInput.accept = 'image/png,image/jpeg,image/webp';
    uploadLabel.appendChild(uploadInput);
    const save = button('Save profile', 'primary-button');
    save.type = 'submit';
    profileForm.append(display.label, avatarInput.label, uploadLabel, save);
    profileForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      save.disabled = true;
      try {
        let avatarUrl = avatarInput.input.value.trim() || null;
        const image = uploadInput.files?.[0];
        if (image) {
          if (!['image/png', 'image/jpeg', 'image/webp'].includes(image.type) || image.size > 2 * 1024 * 1024) {
            throw new Error('Choose a PNG, JPEG, or WebP image smaller than 2 MB.');
          }
          const extension = image.type === 'image/jpeg' ? 'jpg' : image.type.split('/')[1];
          const objectPath = `${user.id}/profile.${extension}`;
          const { error: uploadError } = await supabase.storage.from('avatars').upload(objectPath, image, { upsert: true, contentType: image.type });
          if (uploadError) throw uploadError;
          avatarUrl = supabase.storage.from('avatars').getPublicUrl(objectPath).data.publicUrl;
        }
        const { error } = await supabase.auth.updateUser({
          data: { display_name: display.input.value.trim(), avatar_url: avatarUrl },
        });
        if (error) throw error;
        await saveUserProfile({ ...user, user_metadata: { ...user.user_metadata, display_name: display.input.value.trim(), avatar_url: avatarUrl } });
        showMessage('Profile updated.', 'success');
        avatar.src = avatarUrl || '/Floro.png';
        name.querySelector('strong').textContent = display.input.value.trim();
      } catch (error) {
        showMessage(error.message || 'Could not update profile.');
      } finally {
        save.disabled = false;
      }
    });

    const syncActions = document.createElement('div');
    syncActions.className = 'auth-actions';
    const syncLabel = document.createElement('label');
    syncLabel.className = 'sync-toggle';
    const syncToggle = document.createElement('input');
    syncToggle.type = 'checkbox';
    syncToggle.checked = localStorage.getItem(`floro:cloud-sync:${user.id}`) === 'enabled';
    syncToggle.addEventListener('change', () => {
      if (syncToggle.checked && !confirm('Enable automatic cloud sync for this account? Local conversations and preferences will be uploaded. Conflicts are kept as separate copies.')) {
        syncToggle.checked = false;
        return;
      }
      setCloudSyncEnabled(syncToggle.checked);
      if (syncToggle.checked) syncLocalConversations({ conflictPolicy: 'preserve-both' }).catch(() => {});
    });
    const syncToggleText = document.createElement('span');
    syncToggleText.textContent = 'Enable automatic cloud sync';
    syncLabel.append(syncToggle, syncToggleText);
    const syncButton = button('Sync local conversations', 'primary-button');
    const downloadButton = button('Download cloud conversations', 'action-chip');
    syncButton.addEventListener('click', async () => {
      if (!confirm('Sync your local conversations to this account? Existing local data will be preserved; conflicting versions will be saved as separate copies.')) return;
      syncButton.disabled = true;
      try {
        setCloudSyncEnabled(true);
        syncToggle.checked = true;
        await syncLocalConversations({ conflictPolicy: 'preserve-both' });
        showMessage('Sync completed.', 'success');
      }
      catch (error) { showMessage(error.message || 'Sync failed.'); }
      finally { syncButton.disabled = false; }
    });
    downloadButton.addEventListener('click', async () => {
      if (!confirm('Merge cloud data into this device? Existing local conversations will not be overwritten. If cloud settings are newer, your current local settings will be saved as a restorable copy.')) return;
      downloadButton.disabled = true;
      try {
        const count = await downloadCloudConversations();
        showMessage(`Merged ${count} cloud conversations.`, 'success');
        onUserChanged(user);
      } catch (error) { showMessage(error.message || 'Download failed.'); }
      finally { downloadButton.disabled = false; }
    });
    syncActions.append(syncLabel, syncButton, downloadButton);
    const preferenceBackupKey = `floro:sync-preference-backup:${user.id}`;
    if (localStorage.getItem(preferenceBackupKey)) {
      const restoreSettings = button('Restore saved local settings', 'action-chip');
      restoreSettings.addEventListener('click', () => {
        if (!confirm('Restore the local settings saved before the last cloud download?')) return;
        try {
          const backup = JSON.parse(localStorage.getItem(preferenceBackupKey) || '{}');
          const { modelLabels, defaultModel, ...preferences } = backup.preferences || {};
          localStorage.setItem('floro:preferences', JSON.stringify(preferences));
          if (modelLabels && Object.keys(modelLabels).length) localStorage.setItem('floro:model-labels', JSON.stringify(modelLabels));
          else localStorage.removeItem('floro:model-labels');
          if (defaultModel) localStorage.setItem('floro:default-model', JSON.stringify(defaultModel));
          else localStorage.removeItem('floro:default-model');
          localStorage.setItem('floro:custom-instructions', backup.customInstructions || '');
          localStorage.setItem('floro:preferences-updated-at', new Date().toISOString());
          localStorage.removeItem(preferenceBackupKey);
          window.dispatchEvent(new CustomEvent('floro-data-changed'));
          window.dispatchEvent(new CustomEvent('floro-models-changed'));
          showMessage('Saved local settings restored.', 'success');
          restoreSettings.remove();
        } catch (error) {
          showMessage(error.message || 'Could not restore saved settings.');
        }
      });
      syncActions.appendChild(restoreSettings);
    }

    const logout = button('Sign out', 'action-chip');
    logout.addEventListener('click', async () => {
      const { error } = await supabase.auth.signOut();
      if (error) showMessage(error.message);
      else {
        renderForm();
        onUserChanged(null);
      }
    });
    card.append(accountHeading, providerText, profileForm, syncActions, logout, errorArea);
    if (profileError) showMessage(profileError);
  }

  function renderForm() {
    card.replaceChildren();
    const title = document.createElement('h3');
    title.textContent = mode === 'login' ? 'Welcome back' : mode === 'signup' ? 'Create your account' : mode === 'set-password' ? 'Choose a new password' : 'Reset your password';
    const description = document.createElement('p');
    description.textContent = mode === 'reset' ? 'We will send a password reset link to your email.' : mode === 'set-password' ? 'Choose a new password for your account.' : 'Your local chats stay on this device unless you choose to sync them.';
    const oauth = button('Continue with Google', 'google-button');
    oauth.prepend(googleIcon());
    errorArea = document.createElement('div');
    errorArea.className = 'auth-message';
    formArea = document.createElement('form');
    formArea.className = 'auth-form';
    const email = mode === 'set-password' ? null : field('Email address', 'email', 'email', 'email');
    if (email) formArea.append(email.label);
    let password;
    if (mode === 'login' || mode === 'signup' || mode === 'set-password') {
      password = field('Password', 'password', 'password', mode === 'signup' ? 'new-password' : 'current-password');
      formArea.append(password.label);
    }
    const submit = button(mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Create account' : mode === 'set-password' ? 'Update password' : 'Send reset link', 'primary-button');
    submit.type = 'submit';
    formArea.append(submit);
    const switcher = document.createElement('div');
    switcher.className = 'auth-switcher';
    const login = button('Sign in', 'text-button');
    const signup = button('Create account', 'text-button');
    const forgot = button('Forgot password?', 'text-button');
    login.addEventListener('click', () => { mode = 'login'; renderForm(); });
    signup.addEventListener('click', () => { mode = 'signup'; renderForm(); });
    forgot.addEventListener('click', () => { mode = 'reset'; renderForm(); });
    if (mode === 'login') switcher.append(signup, forgot);
    else switcher.append(login);

    oauth.addEventListener('click', async () => {
      oauth.disabled = true;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: authRedirectUrl, queryParams: { prompt: 'select_account' } },
      });
      if (error) showMessage(error.message);
      oauth.disabled = false;
    });

    formArea.addEventListener('submit', async (event) => {
      event.preventDefault();
      submit.disabled = true;
      try {
        if (mode === 'signup') {
          const { error } = await supabase.auth.signUp({ email: email.input.value, password: password.input.value, options: { emailRedirectTo: authRedirectUrl } });
          if (error) throw error;
          showMessage('Check your email to verify your account.', 'success');
        } else if (mode === 'login') {
          const { data, error } = await supabase.auth.signInWithPassword({ email: email.input.value, password: password.input.value });
          if (error) throw error;
          if (data.user) await renderSignedIn(data.user);
          onUserChanged(data.user || null);
        } else if (mode === 'set-password') {
          const { error } = await supabase.auth.updateUser({ password: password.input.value });
          if (error) throw error;
          showMessage('Password updated.', 'success');
          const { data } = await supabase.auth.getSession();
          if (data.session?.user) await renderSignedIn(data.session.user);
        } else {
          const { error } = await supabase.auth.resetPasswordForEmail(email.input.value, { redirectTo: authRedirectUrl });
          if (error) throw error;
          showMessage('Password reset email sent.', 'success');
        }
      } catch (error) {
        showMessage(error.message || 'Authentication failed.');
      } finally {
        submit.disabled = false;
      }
    });
    card.append(title, description, oauth, errorArea, formArea, switcher);
  }

  supabase.auth.getSession().then(({ data, error }) => {
    if (error) showMessage(error.message);
    if (data?.session?.user) renderSignedIn(data.session.user);
    else renderForm();
  }).catch((error) => {
    renderForm();
    showMessage(error.message || 'Could not restore your Supabase session.');
  });
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      mode = 'set-password';
      renderForm();
      return;
    }
    if (session?.user) {
      renderSignedIn(session.user).catch((error) => showMessage(error.message));
      onUserChanged(session.user);
    } else {
      renderForm();
      onUserChanged(null);
    }
  });

  return page;
}
