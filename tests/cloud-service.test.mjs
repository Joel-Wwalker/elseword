import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudService, validateCloudConfig } from '../src/cloud-service.js';
import { createLanguage } from '../src/engine.js';
import { canonicalJSON } from '../src/cloud-document.js';
import { createClient as createRealClient } from '@supabase/supabase-js';

const config = { url: 'https://language-test.supabase.co', publishableKey: 'sb_publishable_example_public_key', googleEnabled: true };
const owner = { id: '11111111-1111-4111-8111-111111111111', email: 'reader@example.com' };
const id = '22222222-2222-4222-8222-222222222222';
const mutationId = '33333333-3333-4333-8333-333333333333';
const document = createLanguage({ name: 'Cloud test', seed: 'cloud-service' });
const record = (overrides = {}) => ({ id, document, version: 1, updated_at: '2026-11-07T12:00:00+00:00', deleted_at: null, ...overrides });
const isCode = code => error => error?.code === code;

function fixture(overrides = {}) {
  const calls = [];
  let session = { user: owner, access_token: 'fake-account-a-access-token' }, callback, unsubscribed = false;
  const client = {
    auth: {
      initialize: async () => ({ error: null }),
      getSession: async () => ({ data: { session }, error: null }),
      onAuthStateChange: handler => { callback = handler; return { data: { subscription: { unsubscribe() { unsubscribed = true; } } } }; },
      signInWithOtp: async args => { calls.push(['email', args]); return { data: {}, error: null }; },
      signInWithOAuth: async args => { calls.push(['google', args]); return { data: { url: 'https://accounts.google.com/' }, error: null }; },
      signOut: async args => { calls.push(['signOut', args]); session = null; return { error: null }; },
    },
    from: table => {
      calls.push(['from', table]);
      const query = {};
      for (const method of ['select', 'is', 'order']) query[method] = (...args) => { calls.push([method, ...args]); return query; };
      query.limit = async n => { calls.push(['limit', n]); return { data: [record()], error: null }; };
      return query;
    },
    rpc: async (name, args) => { calls.push([name, args]); return { data: record(name === 'delete_language' ? { version: 2, deleted_at: '2026-11-07T12:01:00Z' } : {}), error: null }; },
    ...overrides,
  };
  const request = run => ({
    setHeader(name, value) { calls.push(['header', name, value]); return this; },
    then(resolve, reject) { return Promise.resolve().then(run).then(resolve, reject); },
  });
  const from = client.from.bind(client);
  client.from = (...args) => {
    const query = from(...args);
    const limit = query.limit.bind(query);
    query.limit = (...limitArgs) => request(() => limit(...limitArgs));
    return query;
  };
  const rpc = client.rpc.bind(client);
  client.rpc = (...args) => request(() => rpc(...args));
  const service = createCloudService(config, { createClient: (url, key, options) => { calls.push(['create', url, key, options]); return client; } });
  return { service, client, calls, setSession: value => { session = value; }, emit: (...args) => callback(...args), unsubscribed: () => unsubscribed };
}

test('unconfigured cloud keeps guest mode available without constructing a client', async () => {
  const service = createCloudService({}, { createClient: () => { throw new Error('Must not connect'); } });
  assert.equal(service.configured, false);
  assert.equal(service.googleEnabled, false);
  assert.equal(await service.getSession(), null);
  assert.equal(typeof service.subscribe(() => {}), 'function');
  await assert.rejects(service.list({ expectedUserId: owner.id }), isCode('UNAVAILABLE'));
});

test('configuration accepts public keys and local development but refuses secret credentials and unsafe origins', () => {
  assert.equal(validateCloudConfig(config).url, config.url);
  assert.equal(validateCloudConfig({ ...config, url: 'http://127.0.0.1:54321/' }).url, 'http://127.0.0.1:54321');
  const jwt = role => `e30.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;
  assert.equal(validateCloudConfig({ ...config, publishableKey: jwt('anon') }).publishableKey, jwt('anon'));
  for (const publishableKey of ['sb_secret_do_not_expose', jwt('service_role'), jwt('authenticated'), 'not-a-key']) {
    assert.throws(() => validateCloudConfig({ ...config, publishableKey }), error => error.code === 'INVALID_DATA' && !error.message.includes(publishableKey));
  }
  for (const url of ['http://language-test.supabase.co', 'https://evil.example', 'https://language-test.supabase.co?key=secret', 'https://name:password@language-test.supabase.co', 'javascript:alert(1)']) {
    assert.throws(() => validateCloudConfig({ ...config, url }), isCode('INVALID_DATA'));
  }
  assert.throws(() => validateCloudConfig({ url: config.url }), isCode('INVALID_DATA'));
  assert.throws(() => validateCloudConfig({ url: 42 }), isCode('INVALID_DATA'));
  assert.throws(() => validateCloudConfig({ googleEnabled: 'true' }), isCode('INVALID_DATA'));
});

test('authentication uses PKCE, passwordless email and optional Google without exposing session tokens', async () => {
  const { service, calls } = fixture();
  assert.deepEqual(await service.getSession(), owner);
  assert.deepEqual(calls[0][3].auth, { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true });
  await service.signInEmail(' reader@example.com ', 'https://languages.example/');
  assert.deepEqual(calls.find(call => call[0] === 'email')[1], { email: owner.email, options: { emailRedirectTo: 'https://languages.example/', shouldCreateUser: true } });
  await service.signInGoogle('https://languages.example/');
  assert.deepEqual(calls.find(call => call[0] === 'google')[1], { provider: 'google', options: { redirectTo: 'https://languages.example/' } });
  await service.signOut();
  assert.deepEqual(calls.find(call => call[0] === 'signOut')[1], { scope: 'local' });
  assert.equal(await service.getSession(), null);
});

test('invalid email or redirect cannot trigger an authentication request', async () => {
  const { service, calls } = fixture();
  for (const email of ['', 'reader', 'reader@example.com\nBcc:someone@example.com']) await assert.rejects(service.signInEmail(email, 'https://languages.example/'), isCode('INVALID_DATA'));
  for (const redirect of ['javascript:alert(1)', 'http://languages.example/', 'https://user:pass@languages.example/']) await assert.rejects(service.signInEmail(owner.email, redirect), isCode('INVALID_DATA'));
  assert.equal(calls.filter(call => call[0] === 'email').length, 0);
});

test('a real SDK callback failure is reported safely once without replacing the existing session', async t => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { href: 'https://languages.example/#error=access_denied&error_description=private-provider-details' } } });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {} });
  t.after(() => {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow); else delete globalThis.window;
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument); else delete globalThis.document;
  });
  let client;
  const service = createCloudService(config, { createClient: (url, key, options) => {
    client = createRealClient(url, key, { ...options, auth: { ...options.auth, persistSession: false, autoRefreshToken: false, storageKey: 'cloud-callback-failure' },
      global: { fetch: async () => { throw new Error('This callback must not need a network request'); } } });
    return client;
  } });
  // Characterize the SDK behavior that hid the failure from the app.
  assert.ok((await client.auth.initialize()).error);
  assert.deepEqual(await client.auth.getSession(), { data: { session: null }, error: null });
  const error = await service.takeSignInError?.();
  assert.equal(error?.code, 'AUTH_CALLBACK');
  assert.match(error.message, /try.*again|new.*link/i);
  assert.doesNotMatch(error.message, /private-provider-details|access_denied/);
  assert.equal(await service.takeSignInError(), null, 'A callback notice is consumed once, not on every session read');
  assert.equal(await service.getSession(), null);
  // A failed callback must also leave a previously signed-in account usable.
  client.auth.getSession = async () => ({ data: { session: { user: owner } }, error: null });
  assert.deepEqual(await service.getSession(), owner);
});

test('a new sign-in attempt or successful sign-in discards a delayed previous callback error', async () => {
  for (const next of ['email', 'google', 'signed-in']) {
    const { service, client, emit } = fixture();
    let finishInitialization;
    client.auth.initialize = () => new Promise(resolve => { finishInitialization = resolve; });
    const unsubscribe = service.subscribe(() => {});
    const pending = service.takeSignInError?.();
    assert.ok(pending, 'The callback result must be observable independently of session loading');
    if (next === 'email') await service.signInEmail(owner.email, 'https://languages.example/');
    if (next === 'google') await service.signInGoogle('https://languages.example/');
    if (next === 'signed-in') emit('SIGNED_IN', { user: owner });
    finishInitialization({ error: new Error('old callback failure') });
    assert.equal(await pending, null);
    assert.deepEqual(await service.getSession(), owner);
    unsubscribe();
  }
});

test('normal initialization and guest mode do not invent a sign-in error', async () => {
  const { service } = fixture();
  assert.equal(await service.takeSignInError?.(), null);
  assert.deepEqual(await service.getSession(), owner);
  const guest = createCloudService({});
  assert.equal(await guest.takeSignInError?.(), null);
});

test('a completed later sign-in makes an unread initialization error obsolete', async () => {
  const { service, client, emit } = fixture();
  client.auth.initialize = async () => ({ error: new Error('old failed callback') });
  const unsubscribe = service.subscribe(() => {});
  emit('SIGNED_IN', { user: owner });
  assert.equal(await service.takeSignInError(), null);
  unsubscribe();
});

test('auth notifications leave the SDK callback before delivering identity and unsubscribe cancels queued events', async () => {
  const { service, emit, unsubscribed } = fixture();
  const received = [];
  const unsubscribe = service.subscribe(user => received.push(user));
  emit('SIGNED_IN', { user: { ...owner, user_metadata: { private: true } }, access_token: 'never-forward-this' });
  assert.deepEqual(received, []);
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.deepEqual(received, [owner]);
  emit('SIGNED_OUT', null);
  unsubscribe();
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(unsubscribed(), true);
  assert.equal(received.length, 1);
});

test('private library requests are bounded and validated and anonymous users cannot mistake a denied read for an empty library', async () => {
  const { service, calls, setSession } = fixture();
  const rows = await service.list({ expectedUserId: owner.id });
  assert.deepEqual(rows, [record()]);
  assert.notEqual(rows[0].document, document);
  assert.ok(calls.some(call => call[0] === 'is' && call[1] === 'deleted_at' && call[2] === null));
  assert.ok(calls.some(call => call[0] === 'limit' && call[1] === 51));
  setSession(null);
  await assert.rejects(service.list({ expectedUserId: owner.id }), isCode('AUTH_REQUIRED'));
});

test('saves and deletions carry independent versions and stable mutation IDs without caller supplied owners', async () => {
  const { service, calls } = fixture();
  const saved = await service.save({ expectedUserId: owner.id, id, document, expectedVersion: null, mutationId });
  assert.equal(saved.version, 1);
  assert.deepEqual(calls.find(call => call[0] === 'save_language')[1], { p_id: id, p_document: document, p_expected_version: null, p_mutation_id: mutationId });
  const removed = await service.remove({ expectedUserId: owner.id, id, expectedVersion: 1, mutationId });
  assert.equal(removed.version, 2);
  assert.ok(removed.deleted_at);
  assert.deepEqual(calls.find(call => call[0] === 'delete_language')[1], { p_id: id, p_expected_version: 1, p_mutation_id: mutationId });
});

test('compact deletion acknowledgments accept an empty document only for a valid tombstone', async () => {
  const { service } = fixture({ rpc: async () => ({ data: record({ version: 2, document: null, deleted_at: '2026-11-07T12:01:00Z' }), error: null }) });
  const deleted = await service.remove({ expectedUserId: owner.id, id, expectedVersion: 1, mutationId });
  assert.equal(deleted.document, null);
  assert.equal(deleted.version, 2);
  for (const deleted_at of [null, 'not-a-date']) {
    const { service: invalid } = fixture({ rpc: async () => ({ data: record({ document: null, deleted_at }), error: null }) });
    await assert.rejects(invalid.save({ expectedUserId: owner.id, id, document, expectedVersion: null, mutationId }), isCode('INVALID_DATA'));
  }
});

test('a save accepts PostgreSQL jsonb object-key ordering without altering the saved language', async () => {
  const input = structuredClone(document);
  input.script = { ...input.script, style: 'custom', glyphs: { z: 'ᛉ', a: 'ᚨ', th: 'ᚦ' } };
  const before = structuredClone(input);
  const returned = structuredClone(input);
  returned.script.glyphs = { a: 'ᚨ', th: 'ᚦ', z: 'ᛉ' };
  const { service } = fixture({ rpc: async () => ({ data: record({ document: returned }), error: null }) });
  const saved = await service.save({ expectedUserId: owner.id, id, document: input, expectedVersion: null, mutationId });
  assert.deepEqual(saved.document, input);
  assert.deepEqual(input, before);
  assert.deepEqual(returned.script.glyphs, { a: 'ᚨ', th: 'ᚦ', z: 'ᛉ' });
});

test('canonical comparison preserves meaningful array order and handles nested keys without mutation', () => {
  const first = { script: { glyphs: { z: 'ᛉ', a: 'ᚨ' }, direction: 'ltr' }, words: [{ word: 'one', english: 'first' }, { word: 'two', english: 'second' }] };
  const reordered = { words: [{ english: 'first', word: 'one' }, { english: 'second', word: 'two' }], script: { direction: 'ltr', glyphs: { a: 'ᚨ', z: 'ᛉ' } } };
  const snapshot = JSON.stringify(first);
  assert.equal(canonicalJSON(first), canonicalJSON(reordered));
  assert.notEqual(canonicalJSON(first), canonicalJSON({ ...reordered, words: [...reordered.words].reverse() }));
  assert.equal(JSON.stringify(first), snapshot);
});

test('database conflicts, ownership failures and limits become safe actionable errors', async () => {
  for (const [message, code] of [['CLOUD_CONFLICT','CONFLICT'], ['AUTH_REQUIRED','AUTH_REQUIRED'], ['INVALID_DOCUMENT','INVALID_DATA'], ['CLOUD_LIMIT','LIMIT']]) {
    const { service } = fixture({ rpc: async () => ({ data: null, error: { message: `${message}: secret internal details`, code: 'P0001' } }) });
    await assert.rejects(service.save({ expectedUserId: owner.id, id, document, expectedVersion: null, mutationId }), error => error.code === code && !error.message.includes('secret'));
  }
});

test('invalid documents, byte bounds and invalid request identifiers are rejected before writes', async () => {
  const { service, calls } = fixture();
  const bad = structuredClone(document); bad.words[0].word = '';
  await assert.rejects(service.save({ expectedUserId: owner.id, id, document: bad, expectedVersion: null, mutationId }), isCode('INVALID_DATA'));
  for (const extra of [{ id: 'bad-id' }, { mutationId: 'bad-mutation' }, { expectedVersion: -1 }, { expectedVersion: 1.5 }]) {
    await assert.rejects(service.save({ expectedUserId: owner.id, id, document, expectedVersion: null, mutationId, ...extra }), isCode('INVALID_DATA'));
  }
  await assert.rejects(service.remove({ expectedUserId: owner.id, id, expectedVersion: null, mutationId }), isCode('INVALID_DATA'));
  const large = structuredClone(document);
  large.words = Array.from({ length: 700 }, (_, index) => ({ id: `w${index}`, english: `word ${index}`, word: 'word', pos: 'noun', category: 'test', notes: '漢'.repeat(500), locked: false }));
  await assert.rejects(service.save({ expectedUserId: owner.id, id, document: large, expectedVersion: null, mutationId }), isCode('INVALID_DATA'));
  assert.equal(calls.filter(call => call[0] === 'save_language').length, 0);
});

test('malformed, mismatched or oversized responses never become successful cloud saves', async () => {
  for (const result of [null, record({ id: 'bad' }), record({ document: { version: 9 } }), record({ version: 3 }), record({ deleted_at: '2026-11-07T12:00:00Z' }), record({ updated_at: 'yesterday' })]) {
    const { service } = fixture({ rpc: async () => ({ data: result, error: null }) });
    await assert.rejects(service.save({ expectedUserId: owner.id, id, document, expectedVersion: null, mutationId }), isCode('INVALID_DATA'));
  }
});

test('corrupt or excessive cloud library results cannot silently replace the visible list', async () => {
  for (const rows of [null, {}, [record(), record()], [record({ deleted_at: '2026-11-07T12:00:00Z' })], Array.from({ length: 51 }, () => record())]) {
    const { service } = fixture({ from: () => {
      const query = { select: () => query, is: () => query, order: () => query, limit: async () => ({ data: rows, error: null }) };
      return query;
    } });
    await assert.rejects(service.list({ expectedUserId: owner.id }), isCode('INVALID_DATA'));
  }
});

test('disabled Google sign-in does not call the provider', async () => {
  let called = false;
  const service = createCloudService({ ...config, googleEnabled: false }, { createClient: () => ({ auth: { signInWithOAuth: () => { called = true; } } }) });
  await assert.rejects(service.signInGoogle('https://languages.example/'), isCode('UNAVAILABLE'));
  assert.equal(called, false);
});

test('connection failures are surfaced without claiming the local document was saved online', async () => {
  const { service } = fixture({ rpc: async () => { throw new TypeError('Failed to fetch sensitive internal URL'); } });
  await assert.rejects(service.save({ expectedUserId: owner.id, id, document, expectedVersion: null, mutationId }), error => error.code === 'NETWORK' && !error.message.includes('sensitive'));
});

test('responses arriving after an account switch cannot be returned as the new account library', async () => {
  let resolveRequest;
  const { service, setSession } = fixture({ from: () => { const query = { select: () => query, is: () => query, order: () => query, limit: () => new Promise(resolve => { resolveRequest = resolve; }) }; return query; } });
  const request = service.list({ expectedUserId: owner.id });
  await new Promise(resolve => setImmediate(resolve));
  setSession({ user: { id: '44444444-4444-4444-8444-444444444444', email: 'other@example.com' } });
  resolveRequest({ data: [record()], error: null });
  await assert.rejects(request, isCode('AUTH_REQUIRED'));
});

test('a stale account intent or missing intended user is rejected before any private request is built', async () => {
  for (const expectedUserId of [owner.id, undefined]) for (const operation of ['list', 'save', 'remove']) {
    const { service, calls, setSession } = fixture();
    setSession({ user: { id: '44444444-4444-4444-8444-444444444444', email: 'other@example.com' }, access_token: 'fake-account-b-access-token' });
    const request = service[operation]({ expectedUserId, id, document, expectedVersion: operation === 'save' ? null : 1, mutationId });
    await assert.rejects(request, isCode('AUTH_REQUIRED'));
    assert.equal(calls.filter(call => ['from', 'save_language', 'delete_language'].includes(call[0])).length, 0, 'Neither the document nor a library request may be sent under a different user');
  }
});

test('the real SDK pins private requests to the captured account even if the session switches before fetch', async () => {
  const other = { id: '44444444-4444-4444-8444-444444444444', email: 'other@example.com' };
  for (const operation of ['list', 'save', 'remove']) {
    let current = { user: owner, access_token: 'fake-account-a-access-token' };
    const outgoing = [];
    const service = createCloudService(config, { createClient: (url, key, options) => {
      const client = createRealClient(url, key, {
        ...options,
        auth: { ...options.auth, persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: `cloud-race-${operation}` },
        global: { fetch: async (_url, init) => {
          outgoing.push(new Headers(init.headers).get('Authorization'));
          const body = operation === 'list' ? [record()] : operation === 'remove' ? record({ version: 2, deleted_at: '2026-11-07T12:01:00Z' }) : record();
          return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } },
      });
      client.auth.getSession = async () => ({ data: { session: current }, error: null });
      for (const method of ['from', 'rpc']) {
        const original = client[method].bind(client);
        client[method] = (...args) => {
          // This is the gap after the app checked A but before fetchWithAuth
          // asks the SDK for whichever account is signed in at that instant.
          current = { user: other, access_token: 'fake-account-b-access-token' };
          return original(...args);
        };
      }
      return client;
    } });
    const request = operation === 'list' ? service.list({ expectedUserId: owner.id })
      : operation === 'save' ? service.save({ expectedUserId: owner.id, id, document, expectedVersion: null, mutationId })
      : service.remove({ expectedUserId: owner.id, id, expectedVersion: 1, mutationId });
    await assert.rejects(request, isCode('AUTH_REQUIRED'), 'A late result must remain hidden from the newly signed-in account');
    assert.deepEqual(outgoing, ['Bearer fake-account-a-access-token'], `${operation} must never send A's work using B's identity`);
  }
});
