const escapeHTML = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = id => document.getElementById(id);

/** Account UI depends on callbacks, so the language editor stays independent. */
export function mountCloudUI({ library, service, button, getLanguage, openLocalCopy, openDialog, closeDialog, notify }) {
  let screen = null;
  let emailBusy = false;
  let authMessage = '';
  let signInError = '';
  let noticeEpoch = 0;
  let lastUser = null;
  let lastSignOutFailed = false;
  let preferredLibraryFocus = null;
  const isOpen = () => Boolean(document.querySelector('dialog[open] [data-cloud-screen]'));
  const redirectTo = () => new URL('./', window.location.href).href;
  const content = html => `<div class="cloud-panel" data-cloud-screen>${html}</div>`;
  const errorMarkup = () => library.state.error ? `<p class="cloud-error" role="alert">${escapeHTML(library.state.error)}</p>` : '';
  const signInErrorMarkup = () => signInError ? `<p class="cloud-error" role="alert" data-cloud-auth-error>${escapeHTML(signInError)}</p>` : '';
  const clearSignInError = () => {
    noticeEpoch++;
    signInError = '';
    document.querySelector('[data-cloud-auth-error]')?.remove();
  };
  const setError = error => { const target = $('modal-error'); if (target) target.textContent = error?.message || 'That did not work. Please try again.'; };

  function refreshButton() {
    const state = library.state;
    const title = state.user ? 'Cloud library' : 'Sign in';
    button.innerHTML = `<span aria-hidden="true">☁</span><span class="account-label">${title}</span>`;
    button.setAttribute('aria-label', state.user ? 'Open your cloud library' : 'Sign in for cloud saves');
    button.title = state.user ? `Cloud library · ${state.user.email || 'Signed in'}` : 'Optional account · save languages across devices';
  }

  function signInDialog() {
    screen = 'signin';
    const configured = library.state.configured;
    if (!configured) {
      openDialog('Cloud saves unavailable', content('<p class="dialog-intro">Cloud saves are unavailable. Your languages save on this device. You can download a backup from Files.</p>'), '<button class="primary-button" data-close>Back to my language</button>');
      return;
    }
    if(library.state.signOutFailed){
      openDialog('Finish signing out',content(`<p class="dialog-intro">Your cloud library is hidden, but sign-out has not finished. Try again to finish signing out.</p>${errorMarkup()}`),'<button id="cloud-retry-signout" class="primary-button">Retry sign out</button>');
      $('cloud-retry-signout').onclick=()=>library.signOut().catch(()=>{});
      $('cloud-retry-signout').focus();
      return;
    }
    openDialog('Sign in to save online', content(`<p class="dialog-intro">Save private copies online to open on other devices. Languages on this device upload only when you choose Save online.</p>${signInErrorMarkup()}${service.googleEnabled ? '<button id="cloud-google" class="secondary-button cloud-wide">Continue with Google</button><p class="cloud-divider">or use your email</p>' : ''}<form id="cloud-email-form"><label>Email address<input id="cloud-email" type="email" autocomplete="email" maxlength="254" required placeholder="you@example.com"></label><button class="primary-button cloud-wide" id="cloud-email-submit" type="submit">Email me a sign-in link</button></form><p class="small-note cloud-note">Email sign-in uses a link instead of a password. Open the link in this browser.</p>${authMessage ? `<p class="cloud-feedback" role="status">${escapeHTML(authMessage)}</p>` : ''}`), '<button class="text-button" data-close>Continue without signing in</button>');
    $('cloud-email-form').onsubmit = async event => {
      event.preventDefault();
      if (emailBusy || !$('cloud-email-form').reportValidity()) return;
      const email = $('cloud-email').value.trim();
      clearSignInError();
      emailBusy = true;
      const submit = $('cloud-email-submit');
      submit.disabled = true;
      submit.textContent = 'Sending…';
      try {
        await service.signInEmail(email, redirectTo());
        authMessage = 'Check your email for a sign-in link. You can keep editing while you wait.';
        if (isOpen() && screen === 'signin') {
          let feedback = document.querySelector('.cloud-feedback');
          if (!feedback) { feedback = document.createElement('p'); feedback.className = 'cloud-feedback'; feedback.setAttribute('role', 'status'); $('cloud-email-form').after(feedback); }
          feedback.textContent = authMessage;
        }
      } catch (error) { if (isOpen()) setError(error); }
      finally { emailBusy = false; if (submit.isConnected) { submit.disabled = false; submit.textContent = 'Email me a sign-in link'; } }
    };
    if ($('cloud-google')) $('cloud-google').onclick = async () => {
      clearSignInError();
      const google = $('cloud-google'); google.disabled = true;
      try { await service.signInGoogle(redirectTo()); }
      catch (error) { if (isOpen()) setError(error); if (google.isConnected) google.disabled = false; }
    };
    $('cloud-email').focus();
  }

  function libraryDialog() {
    if (!library.state.user) { signInDialog(); return; }
    const activeId=isOpen()?document.activeElement?.id:null;
    if(activeId?.startsWith('cloud-'))preferredLibraryFocus=activeId;
    screen = 'library';
    const state = library.state;
    const language = getLanguage();
    const status = library.savedState(language);
    const conflict = state.conflict?.localId === language.id;
    const currentLabel = status === 'saved' ? 'This version is saved online.' : status === 'changed' ? 'You have changes to save online.' : 'This language is saved on this device.';
    const busy = state.busy || state.loading;
    const rows = state.items.map((item, i) => `<li class="cloud-language"><div><strong>${escapeHTML(item.document.name)}</strong><small>${item.document.words.length} words · ${escapeHTML(new Date(item.updated_at).toLocaleDateString())}</small></div><div class="cloud-row-actions"><button class="secondary-button" id="cloud-open-${item.id}" data-cloud-open="${i}" ${busy ? 'disabled' : ''}>Open a copy</button><button class="text-button" id="cloud-remove-${item.id}" data-cloud-delete="${i}" aria-label="Remove ${escapeHTML(item.document.name)} from cloud library" ${busy ? 'disabled' : ''}>Remove</button></div></li>`).join('');
    const conflictAction=conflict?`<p class="small-note cloud-note">Your copy is still on this device. Save a new cloud copy to keep both versions.</p><button class="secondary-button cloud-wide" id="cloud-save-copy" ${busy?'disabled':''}>Save as a new cloud copy</button>`:'';
    const body=`<div class="cloud-account-line"><span>${escapeHTML(state.user.email || 'Signed in')}</span><button class="text-button" id="cloud-signout" ${state.busy ? 'disabled' : ''}>Sign out</button></div>
      <section class="cloud-current"><span class="field-label">Current language</span><h3>${escapeHTML(language.name)}</h3><p class="small-note">${currentLabel}</p><button class="primary-button cloud-wide" id="cloud-save" ${busy ? 'disabled' : ''}>${state.busy ? 'Working…' : status === 'saved' ? 'Save online again' : 'Save online'}</button>${conflictAction}</section>
      ${signInErrorMarkup()}${errorMarkup()}${state.warning ? `<p class="small-note">${escapeHTML(state.warning)}</p>` : ''}
      <div class="cloud-library-heading"><h3>Saved online</h3><button id="cloud-refresh" class="text-button" ${busy ? 'disabled' : ''}>${state.loading ? 'Loading…' : 'Refresh'}</button></div>
      ${rows ? `<ul class="cloud-language-list">${rows}</ul>` : `<p class="small-note">${state.loading ? 'Loading your languages…' : state.error ? 'Your library could not be loaded. Refresh to try again.' : 'No languages saved online yet.'}</p>`}
      <p class="small-note cloud-note">Opening a language saves a copy on this device, even after you sign out. Choose Save online when you want to upload edits.</p>`;
    openDialog('Cloud library',content(body),'<button class="secondary-button" data-close>Back to the studio</button>');
    $('cloud-save').onclick = () => saveOnline(false);
    if ($('cloud-save-copy')) $('cloud-save-copy').onclick = () => saveOnline(true);
    $('cloud-refresh').onclick = () => library.refresh().catch(() => {});
    $('cloud-signout').onclick = () => library.signOut().catch(() => {});
    document.querySelectorAll('[data-cloud-open]').forEach(el => el.onclick = () => {
      try {
        const record = state.items[Number(el.dataset.cloudOpen)];
        const localId = openLocalCopy(record.document);
        if (!localId) return;
        library.linkLocal(localId, record);
        closeDialog(); screen = null;
        notify('Opened a copy on this device. Save online to upload later edits.');
      } catch (error) { setError(error); }
    });
    document.querySelectorAll('[data-cloud-delete]').forEach(el => el.onclick = () => removeDialog(state.items[Number(el.dataset.cloudDelete)]));
    if(preferredLibraryFocus){
      const target=$(preferredLibraryFocus);
      if(target&&!target.disabled)target.focus();
      else {const heading=$('studio-dialog-title');heading.tabIndex=-1;heading.focus();}
    }
  }

  async function saveOnline(asCopy) {
    try {
      const result = await library.save(getLanguage(), { asCopy });
      if (result) { notify('Saved online. You can open it from another device.'); if (isOpen()) libraryDialog(); }
    } catch { /* State carries a safe error and conflict actions. */ }
  }

  function removeDialog(record) {
    screen = 'remove';
    openDialog(`Remove ${record.document.name}?`, content('<p class="dialog-intro">This removes the online copy for all your devices. Copies you already opened stay on those devices.</p>'), '<button class="secondary-button" id="cloud-cancel-remove">Keep it</button><button class="secondary-button danger-button" id="cloud-confirm-remove">Remove cloud copy</button>');
    $('cloud-cancel-remove').onclick = libraryDialog;
    $('cloud-confirm-remove').onclick = async () => {
      const remove = $('cloud-confirm-remove'); remove.disabled = true;
      try { const result = await library.remove(record); if (result && isOpen()) libraryDialog(); }
      catch (error) { if (isOpen()) setError(error); if (remove.isConnected) remove.disabled = false; }
    };
  }

  const show = () => library.state.user ? libraryDialog() : signInDialog();
  button.onclick = show;
  const unsubscribe = library.subscribe(state => {
    refreshButton();
    const changedUser = lastUser !== state.user?.id;
    const changedSignOut = lastSignOutFailed !== Boolean(state.signOutFailed);
    if(changedUser)authMessage='';
    lastUser = state.user?.id;
    lastSignOutFailed=Boolean(state.signOutFailed);
    if (isOpen() && (changedUser || changedSignOut || screen === 'library')) show();
  });
  const initialNoticeEpoch = noticeEpoch;
  void Promise.resolve(service.takeSignInError?.()).then(error => {
    if (!error || initialNoticeEpoch !== noticeEpoch) return;
    signInError = error.message;
    notify(signInError);
    if (isOpen() && ['signin', 'library'].includes(screen)) show();
  });
  return { show, refresh: refreshButton, destroy() { noticeEpoch++; unsubscribe(); } };
}
