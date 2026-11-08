import test from 'node:test';
import assert from 'node:assert/strict';
import { mountCloudUI } from '../src/cloud-ui.js';
import { CloudLibrary } from '../src/cloud-library.js';
import { createLanguage } from '../src/engine.js';

// Only the browser boundary is substituted. The real UI renders its markup,
// receives controller state, and runs the handlers assigned to its buttons.
function fixture(t, { user = null, error = null, delayed = false } = {}) {
  const nodes = new Map(), notices = [], local = createLanguage({ name: 'Still here', seed: 'callback-ui' });
  let body = '', open = false, finishError, signedIn = 0;
  const element = id => ({ id, disabled: false, isConnected: true, value: 'reader@example.com',
    setAttribute() {}, focus() {}, reportValidity: () => true, remove() { this.isConnected = false; } });
  const doc = { getElementById: id => nodes.get(id) ?? null, querySelectorAll: () => [],
    querySelector: selector => selector === 'dialog[open] [data-cloud-screen]' ? open : null };
  for (const [key, value] of Object.entries({ document: doc, window: { location: { href: 'https://languages.example/#world' } } })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, configurable: true });
    t.after(() => previous ? Object.defineProperty(globalThis, key, previous) : delete globalThis[key]);
  }
  const service = { configured: true, googleEnabled: true, getSession: async () => user, subscribe: () => () => {}, list: async () => [],
    takeSignInError: () => delayed ? new Promise(resolve => { finishError = resolve; }) : Promise.resolve(error),
    signInGoogle: async () => { signedIn++; } };
  const library = new CloudLibrary({ service });
  const ui = mountCloudUI({ library, service, button: element('account-button'), getLanguage: () => local, openLocalCopy: () => {},
    openDialog: (_title, html, actions) => {
      body = html; open = true; nodes.clear();
      for (const match of `${html}${actions}`.matchAll(/id="([^"]+)"/g)) nodes.set(match[1], element(match[1]));
      nodes.set('modal-error', element('modal-error'));
    }, closeDialog: () => { open = false; }, notify: message => notices.push(message) });
  t.after(() => { ui.destroy(); library.destroy(); });
  return { ui, library, notices, local, body: () => body, isOpen: () => open, nodes, finishError: value => finishError(value), signedIn: () => signedIn };
}

test('a callback failure is visible on return and in sign-in without opening a dialog or changing local work', async t => {
  const error = { code: 'AUTH_CALLBACK', message: 'Sign-in could not finish. Try again.' };
  const f = fixture(t, { error });
  await f.library.start();
  assert.deepEqual(f.notices, [error.message]);
  assert.equal(f.isOpen(), false, 'Guest editing is not interrupted by an automatic dialog');
  assert.equal(f.local.name, 'Still here');
  f.ui.show();
  assert.match(f.body(), /role="alert"/);
  assert.ok(f.body().includes(error.message));
  await f.nodes.get('cloud-google').onclick();
  assert.equal(f.signedIn(), 1, 'The visitor can retry sign-in');
  f.ui.show();
  assert.ok(!f.body().includes(error.message), 'The old callback must not remain attached to a new attempt');
  assert.equal(f.notices.length, 1);
});

test('a failed callback notice keeps the current account and library usable', async t => {
  const user = { id: '11111111-1111-4111-8111-111111111111', email: 'reader@example.com' };
  const f = fixture(t, { user, error: { code: 'AUTH_CALLBACK', message: 'Sign-in could not finish. Try again.' } });
  await f.library.start();
  f.ui.show();
  assert.equal(f.library.state.user.id, user.id);
  assert.match(f.body(), /role="alert"/);
  assert.match(f.body(), /Saved online/);
  assert.ok(f.nodes.has('cloud-save'));
  assert.equal(f.local.name, 'Still here');
});

test('late callback feedback cannot reappear after a retry or after the UI is destroyed', async t => {
  for (const action of ['retry', 'destroy']) {
    await t.test(action, async child => {
      const f = fixture(child, { delayed: true });
      await f.library.start();
      if (action === 'retry') { f.ui.show(); await f.nodes.get('cloud-google').onclick(); }
      else f.ui.destroy();
      f.finishError({ code: 'AUTH_CALLBACK', message: 'Old error' });
      await new Promise(resolve => setImmediate(resolve));
      assert.deepEqual(f.notices, []);
      assert.ok(!f.body().includes('Old error'));
    });
  }
});

test('ordinary guest and signed-in startup do not show failure feedback', async t => {
  for (const user of [null, { id: '11111111-1111-4111-8111-111111111111', email: 'reader@example.com' }]) {
    await t.test(user ? 'signed-in' : 'guest', async child => {
      const f = fixture(child, { user });
      await f.library.start();
      f.ui.show();
      assert.deepEqual(f.notices, []);
      assert.doesNotMatch(f.body(), /data-cloud-auth-error/);
    });
  }
});
