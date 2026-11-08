import test from 'node:test';
import assert from 'node:assert/strict';
import { CloudLibrary } from '../src/cloud-library.js';
import { createLanguage } from '../src/engine.js';

const A = { id: 'account-a', email: 'a@example.test' };
const B = { id: 'account-b', email: 'b@example.test' };
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const record = (language, { id = uuid(1), version = 1, deleted_at = null } = {}) => ({ id, document: structuredClone(language), version, updated_at: '2026-11-07T10:00:00Z', deleted_at });
const fail = code => Object.assign(new Error('Provider detail should not leak'), { code });
const flush = () => new Promise(resolve => setImmediate(resolve));

function fixture({ user = A, configured = true, storage } = {}) {
  const calls = { save: [], remove: [], list: 0, signOut: 0 };
  let subscriber, nextId = 100;
  const values = new Map();
  const memory = storage ?? { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const service = {
    configured, googleEnabled: true,
    getSession: async () => user,
    subscribe(fn) { subscriber = fn; return () => { subscriber = null; }; },
    list: async () => { calls.list++; return []; },
    save: async request => { calls.save.push(structuredClone(request)); return record(request.document, { id: request.id, version: (request.expectedVersion ?? 0) + 1 }); },
    remove: async request => { calls.remove.push(structuredClone(request)); return record(createLanguage(), { id: request.id, version: request.expectedVersion + 1, deleted_at: '2026-11-07T10:01:00Z' }); },
    signOut: async () => { calls.signOut++; subscriber?.(null); },
  };
  const library = new CloudLibrary({ service, storage: memory, uuid: () => uuid(nextId++) });
  return { library, service, calls, values, memory, emit: next => subscriber?.(next) };
}

test('guest and unconfigured startup never upload or alter local work', async () => {
  for (const options of [{ user: null }, { configured: false }]) {
    const f = fixture(options);
    await f.library.start();
    assert.equal(f.library.state.ready, true);
    assert.equal(f.library.state.user, null);
    assert.equal(f.calls.list, 0);
    assert.deepEqual(f.calls.save, []);
    assert.equal(f.values.size, 0);
    f.library.destroy();
  }
});

test('cloud acknowledgments track only the exact saved edit and are owner scoped', async () => {
  const f = fixture(); await f.library.start();
  const language = createLanguage({ name: 'Mine' });
  const waiting = deferred(); let sent;
  f.service.save = input => { sent = structuredClone(input); return waiting.promise; };
  const operation = f.library.save(language);
  language.name = 'Edited while saving';
  waiting.resolve(record(sent.document, { id: sent.id }));
  await operation;
  assert.equal(f.library.savedState(language), 'changed');
  assert.equal(f.library.savedState(sent.document), 'saved');
  assert.equal(f.library.getLink(language.id).version, 1);
  assert.ok([...f.values.keys()].every(key => key.startsWith('little-languages-cloud-links-v1:')));
  f.emit(B); await flush();
  assert.equal(f.library.getLink(language.id), null);
  assert.equal(f.library.savedState(language), 'local');
  f.emit(A); await flush();
  assert.equal(f.library.getLink(language.id).version, 1);
  f.library.destroy();
});

test('late reads and writes from an earlier account cannot change the new account', async () => {
  const f = fixture(); await f.library.start();
  const oldRead = deferred(), oldWrite = deferred();
  f.service.list = () => oldRead.promise;
  const read = f.library.refresh();
  const language = createLanguage(); let sent;
  f.service.save = input => { sent = input; return oldWrite.promise; };
  const write = f.library.save(language);
  f.service.list = async () => [];
  f.emit(B); await flush();
  oldRead.resolve([record(language)]);
  oldWrite.resolve(record(sent.document, { id: sent.id }));
  assert.equal(await read, null);
  assert.equal(await write, null);
  assert.equal(f.library.state.user.id, B.id);
  assert.deepEqual(f.library.state.items, []);
  assert.equal(f.library.getLink(language.id), null);
  assert.equal(f.library.state.busy, false);
  assert.equal(f.values.size, 0);
  f.library.destroy();
});

test('a failed write retries the same mutation; a conflict can save an independent copy', async () => {
  const f = fixture(); await f.library.start();
  const language = createLanguage();
  let attempts = [];
  f.service.save = async input => { attempts.push(structuredClone(input)); if (attempts.length === 1) throw fail('NETWORK'); return record(input.document, { id: input.id, version: (input.expectedVersion ?? 0) + 1 }); };
  await assert.rejects(f.library.save(language), { code: 'NETWORK' });
  await f.library.save(language);
  assert.deepEqual(attempts[0], attempts[1]);
  language.name = 'New name';
  f.service.save = async input => { attempts.push(structuredClone(input)); throw fail('CONFLICT'); };
  await assert.rejects(f.library.save(language), { code: 'CONFLICT' });
  const stale = attempts.at(-1);
  assert.deepEqual(f.library.state.conflict, { localId: language.id, cloudId: stale.id });
  assert.equal(f.library.savedState(language), 'changed');
  f.service.save = async input => { attempts.push(structuredClone(input)); return record(input.document, { id: input.id }); };
  const copy = await f.library.save(language, { asCopy: true });
  assert.notEqual(copy.id, stale.id);
  assert.equal(attempts.at(-1).expectedVersion, null);
  assert.equal(f.library.state.conflict, null);
  f.library.destroy();
});

test('opening a local copy normalizes its local ID without mutating the cloud record', async () => {
  const f = fixture(); await f.library.start();
  const remote = record(createLanguage()); const before = structuredClone(remote);
  const local = { ...structuredClone(remote.document), id: 'local-copy' };
  f.library.linkLocal(local.id, remote);
  assert.deepEqual(remote, before);
  assert.equal(f.library.savedState(local), 'saved');
  await f.library.save(local);
  assert.equal(f.calls.save[0].id, remote.id);
  assert.equal(f.calls.save[0].expectedVersion, remote.version);
  assert.equal(f.calls.save[0].document.id, local.id);
  f.library.destroy();
});

test('storage failure does not turn a confirmed cloud save into failure', async () => {
  const f = fixture({ storage: { getItem: () => null, setItem: () => { throw new Error('quota'); } } });
  await f.library.start();
  const language = createLanguage(); await f.library.save(language);
  assert.equal(f.library.savedState(language), 'saved');
  assert.match(f.library.state.warning, /device|browser/i);
  assert.equal(f.library.state.error, null);
  f.library.destroy();
});

test('refresh failure retains the last library and does not upgrade a stale write version', async () => {
  const f = fixture(); const language = createLanguage();
  f.service.list = async () => [record(language)]; await f.library.start();
  f.library.linkLocal(language.id, f.library.state.items[0]);
  f.service.list = async () => [record(language, { version: 2 })]; await f.library.refresh();
  assert.equal(f.library.getLink(language.id).version, 1);
  assert.equal(f.library.savedState(language), 'changed');
  f.service.list = async () => { throw fail('NETWORK'); };
  await assert.rejects(f.library.refresh(), { code: 'NETWORK' });
  assert.equal(f.library.state.items[0].version, 2);
  assert.match(f.library.state.error, /connect|connection|network|offline/i);
  assert.doesNotMatch(f.library.state.error, /Provider/);
  f.library.destroy();
});

test('sign-out clears private state immediately and rejects stale results', async () => {
  const f = fixture(); await f.library.start();
  const language = createLanguage(); await f.library.save(language);
  const wait = deferred(); f.service.signOut = () => wait.promise;
  const logout = f.library.signOut();
  assert.equal(f.library.state.user, null);
  assert.deepEqual(f.library.state.items, []);
  assert.equal(f.library.getLink(language.id), null);
  f.emit(A); await flush();
  assert.equal(f.library.state.user, null, 'Old refresh events during sign-out cannot restore private state');
  wait.resolve(); await logout;
  f.library.destroy();
});

test('same-user token refresh does not clear a library or trigger another read', async () => {
  const f = fixture(); const language = createLanguage(); f.service.list = async () => { f.calls.list++; return [record(language)]; };
  await f.library.start(); f.emit({ ...A }); await flush();
  assert.equal(f.calls.list, 1);
  assert.equal(f.library.state.items.length, 1);
  f.library.destroy();
});

test('deletion is versioned, retriable and only clears matching cloud links', async () => {
  const f = fixture(); await f.library.start();
  const language = createLanguage(); const saved = await f.library.save(language);
  let requests = [];
  f.service.remove = async input => { requests.push(structuredClone(input)); if (requests.length === 1) throw fail('NETWORK'); return { ...saved, version: saved.version + 1, deleted_at: '2026-11-07T11:00:00Z' }; };
  await assert.rejects(f.library.remove(saved), { code: 'NETWORK' });
  await f.library.remove(saved);
  assert.deepEqual(requests[0], requests[1]);
  assert.equal(requests[0].expectedVersion, 1);
  assert.equal(f.library.getLink(language.id), null);
  assert.deepEqual(f.library.state.items, []);
  assert.equal(language.name, 'Luma');
  f.library.destroy();
});

test('a stale initial session cannot undo a newer auth event or sign-out', async () => {
  const f = fixture(); const initial = deferred();
  f.service.getSession = () => initial.promise;
  const starting = f.library.start();
  f.emit(B); await flush();
  initial.resolve(A); await starting;
  assert.equal(f.library.state.user.id, B.id);
  assert.equal(f.calls.list, 1);
  f.library.destroy();
});

test('corrupt link metadata is ignored without touching the guest workspace', async () => {
  const f = fixture();
  f.values.set('little-languages-studio-v1', 'guest data');
  f.values.set('little-languages-cloud-links-v1:account-a', JSON.stringify({ version: 1, links: [{ localId: '__proto__' }] }));
  await f.library.start();
  assert.match(f.library.state.warning, /could not be restored/i);
  assert.equal(f.library.getLink('__proto__'), null);
  assert.equal(f.values.get('little-languages-studio-v1'), 'guest data');
  await f.library.save(createLanguage());
  assert.equal(f.values.get('little-languages-studio-v1'), 'guest data');
  f.library.destroy();
});

test('invalid remote rows cannot replace a previously loaded library', async () => {
  const f = fixture(); const language = createLanguage();
  f.service.list = async () => [record(language)]; await f.library.start();
  f.service.list = async () => [{ ...record(language), document: { version: 9000 } }];
  await assert.rejects(f.library.refresh(), { code: 'INVALID_DATA' });
  assert.equal(f.library.state.items[0].document.name, language.name);
  assert.equal(f.library.state.loading, false);
  f.library.destroy();
});

test('request preparation failures release the write lock', async () => {
  const f = fixture(); await f.library.start();
  f.library.uuid = () => { throw new Error('random IDs unavailable'); };
  await assert.rejects(f.library.save(createLanguage()));
  assert.equal(f.library.state.busy, false);
  assert.equal(f.calls.save.length, 0);
  f.library.destroy();
});

test('PostgreSQL object key ordering does not change save identity or saved status', async () => {
  const f = fixture(); await f.library.start();
  const language = createLanguage(); language.script.glyphs = { z: '✧', a: '◇' };
  const attempts = [];
  f.service.save = async input => {
    attempts.push(structuredClone(input));
    if (attempts.length === 1) throw fail('NETWORK');
    const reordered = structuredClone(input.document);
    reordered.script.glyphs = { a: '◇', z: '✧' };
    return record(reordered, { id: input.id });
  };
  await assert.rejects(f.library.save(language), { code: 'NETWORK' });
  language.script.glyphs = { a: '◇', z: '✧' };
  await f.library.save(language);
  assert.equal(attempts[0].mutationId, attempts[1].mutationId);
  assert.equal(attempts[0].id, attempts[1].id);
  assert.equal(f.library.savedState(language), 'saved');
  language.script.glyphs = { z: '✧', a: '◇' };
  assert.equal(f.library.savedState(language), 'saved');
  f.library.destroy();
});

test('failed sign-out remains visibly retryable without exposing the previous library', async () => {
  const f = fixture(); await f.library.start();
  await f.library.save(createLanguage());
  f.service.signOut = async () => { throw fail('NETWORK'); };
  await assert.rejects(f.library.signOut(), { code: 'SIGNOUT_FAILED' });
  assert.equal(f.library.state.signOutFailed, true);
  assert.equal(f.library.state.user, null);
  assert.deepEqual(f.library.state.items, []);
  assert.equal(f.library.state.busy, false);
  f.service.signOut = async () => {};
  await f.library.signOut();
  assert.equal(f.library.state.signOutFailed, false);
  assert.equal(f.library.state.error, null);
  f.library.destroy();
});

test('compact deleted tombstones may omit documents, but live languages may not', async () => {
  const f = fixture(); await f.library.start();
  const language = createLanguage(); const saved = await f.library.save(language);
  f.service.remove = async request => ({ id: request.id, document: null, version: request.expectedVersion + 1,
    updated_at: '2026-11-07T11:00:00Z', deleted_at: '2026-11-07T11:00:00Z' });
  const removed = await f.library.remove(saved);
  assert.equal(removed.document, null);
  assert.equal(f.library.getLink(language.id), null);
  f.service.list = async () => [{ ...saved, document: null }];
  await assert.rejects(f.library.refresh(), { code: 'INVALID_DATA' });
  assert.deepEqual(f.library.state.items, []);
  f.library.destroy();
});

test('every operation carries the displayed account across a deferred auth notification', async () => {
  const f = fixture(); await f.library.start();
  const language = createLanguage(); const saved = await f.library.save(language);
  assert.equal(f.calls.save[0].expectedUserId, A.id);
  // The SDK already has B's session, but its queued auth callback has not run.
  let sdkUser = B;
  const requests = [], committed = [];
  const guard = (kind, input) => {
    requests.push({ kind, expectedUserId: input.expectedUserId });
    if (input.expectedUserId !== sdkUser.id) throw fail('AUTH_REQUIRED');
  };
  f.service.list = async input => { guard('list', input); return []; };
  f.service.save = async input => {
    guard('save', input); committed.push(input);
    return record(input.document, { id: input.id, version: (input.expectedVersion ?? 0) + 1 });
  };
  f.service.remove = async input => { guard('remove', input); committed.push(input); return { ...saved, version: 2, document: null, deleted_at: '2026-11-07T11:00:00Z' }; };
  await assert.rejects(f.library.refresh(), { code: 'AUTH_REQUIRED' });
  await assert.rejects(f.library.save(language), { code: 'AUTH_REQUIRED' });
  await assert.rejects(f.library.remove(saved), { code: 'AUTH_REQUIRED' });
  assert.deepEqual(requests, [
    { kind: 'list', expectedUserId: A.id },
    { kind: 'save', expectedUserId: A.id },
    { kind: 'remove', expectedUserId: A.id },
  ]);
  assert.deepEqual(committed, [], 'A-started operations must not write into B');
  f.emit(B); await flush();
  await f.library.save(language);
  assert.equal(requests.at(-1).expectedUserId, B.id);
  assert.equal(committed.length, 1);
  assert.notEqual(committed[0].id, saved.id, 'A cloud link is never reused for B');
  f.library.destroy();
});
