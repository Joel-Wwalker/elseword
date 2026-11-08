import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { validateLanguage } from './engine.js';
import { canonicalJSON } from './cloud-document.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const MAX_BYTES = 1_000_000;
const MAX_VERSION = 1_000_000_000;
const utf8 = new TextEncoder();
const messages = {
  AUTH_CALLBACK: 'Sign-in could not finish. Try signing in again, or request a new email link and open it in this browser. Your device languages are safe.',
  CONFLICT: 'This language changed on another device. Refresh the library or save your work as a new cloud copy.',
  AUTH_REQUIRED: 'Please sign in again to use your cloud library. Your device copy is safe.',
  NETWORK: 'Could not reach the cloud. Your device copy is safe; try again when you are online.',
  UNAVAILABLE: 'Cloud saving is not available right now. Your device copy is safe.',
  INVALID_DATA: 'The cloud request or response was invalid. Your device copy has not been replaced.',
  LIMIT: 'Your cloud library can hold 50 languages. Remove a cloud copy before adding another.',
};

export class CloudError extends Error {
  constructor(code, message = messages[code] ?? messages.UNAVAILABLE) {
    super(message);
    this.name = 'CloudError';
    this.code = code;
  }
}

function localHost(hostname) { return ['localhost', '127.0.0.1', '[::1]'].includes(hostname); }

function publicKey(key) {
  if (/^sb_publishable_[A-Za-z0-9_-]{8,}$/u.test(key)) return true;
  // Legacy anon JWTs are public application keys too. This check identifies the
  // key's role; actual token verification and ownership happen in Supabase.
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(key)) return false;
  try {
    const payload = key.split('.')[1].replaceAll('-', '+').replaceAll('_', '/');
    return JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '='))).role === 'anon';
  } catch { return false; }
}

/** Only public deployment settings belong in the browser bundle. */
export function validateCloudConfig(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new CloudError('INVALID_DATA', 'Cloud configuration must contain public connection settings.');
  if ((input.url !== undefined && typeof input.url !== 'string') || (input.publishableKey !== undefined && typeof input.publishableKey !== 'string')
    || (input.googleEnabled !== undefined && typeof input.googleEnabled !== 'boolean')) throw new CloudError('INVALID_DATA', 'Cloud configuration contains invalid public connection settings.');
  const url = typeof input.url === 'string' ? input.url.trim() : '';
  const publishableKey = typeof input.publishableKey === 'string' ? input.publishableKey.trim() : '';
  if (!url && !publishableKey) return { url: '', publishableKey: '', googleEnabled: false };
  if (!url || !publishableKey) throw new CloudError('INVALID_DATA', 'Cloud configuration is incomplete. Supply the project URL and its public publishable key.');
  let parsed;
  try { parsed = new URL(url); } catch { throw new CloudError('INVALID_DATA', 'Use a valid Supabase project URL for cloud configuration.'); }
  const hosted = parsed.protocol === 'https:' && /^[a-z0-9-]+\.supabase\.co$/iu.test(parsed.hostname) && !parsed.port;
  const local = localHost(parsed.hostname) && ['http:', 'https:'].includes(parsed.protocol);
  if ((!hosted && !local) || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) throw new CloudError('INVALID_DATA', 'Use a Supabase project origin, without a path, credentials, or query string.');
  if (publishableKey.length > 4096 || !publicKey(publishableKey)) throw new CloudError('INVALID_DATA', 'Use a public publishable or anon key. Secret and service-role keys must never be placed in this app.');
  return { url: parsed.origin, publishableKey, googleEnabled: input.googleEnabled === true };
}

function normalizedError(error) {
  if (error instanceof CloudError) return error;
  const detail = String(error?.message ?? '');
  if (/\bCLOUD_CONFLICT\b/u.test(detail)) return new CloudError('CONFLICT');
  if (/\b(CLOUD_LIMIT|LANGUAGE_LIMIT)\b/u.test(detail)) return new CloudError('LIMIT');
  if (/\bINVALID_DOCUMENT\b/u.test(detail) || error?.code === '22023') return new CloudError('INVALID_DATA');
  if (/\bAUTH_REQUIRED\b/u.test(detail) || [401, 403].includes(error?.status) || ['42501', 'PGRST301', 'refresh_token_not_found', 'refresh_token_already_used', 'session_not_found'].includes(error?.code)) return new CloudError('AUTH_REQUIRED');
  if (error instanceof TypeError || error?.status === 0 || /fetch|network|timeout|timed out/iu.test(detail)) return new CloudError('NETWORK');
  return new CloudError('UNAVAILABLE');
}

function unwrap(result) {
  if (!result || typeof result !== 'object') throw new CloudError('INVALID_DATA');
  if (result.error) throw normalizedError(result.error);
  return result.data;
}

function userFromSession(session) {
  if (session === null || session === undefined) return null;
  const user = session.user;
  if (!user || typeof user.id !== 'string' || !UUID.test(user.id)) throw new CloudError('INVALID_DATA');
  if (user.email !== undefined && user.email !== null && (typeof user.email !== 'string' || user.email.length > 320 || /[\u0000-\u001f\u007f]/u.test(user.email))) throw new CloudError('INVALID_DATA');
  return { id: user.id.toLowerCase(), email: user.email ?? '' };
}

function checkedDocument(value, validateDocument = validateLanguage) {
  try {
    const document = validateDocument(value);
    if (utf8.encode(JSON.stringify(document)).byteLength > MAX_BYTES) throw new Error('Too large');
    return document;
  } catch { throw new CloudError('INVALID_DATA', 'This language is invalid or exceeds the 1 MB cloud-save limit. Your device copy is safe.'); }
}

function validDate(value) {
  return typeof value === 'string' && value.length <= 40 && /^\d{4}-\d{2}-\d{2}T/u.test(value) && Number.isFinite(Date.parse(value));
}

function checkedRecord(value, validateDocument = validateLanguage) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.id !== 'string' || !UUID.test(value.id)
    || !Number.isSafeInteger(value.version) || value.version < 1 || value.version > MAX_VERSION || !validDate(value.updated_at)
    || (value.deleted_at !== null && !validDate(value.deleted_at))) throw new CloudError('INVALID_DATA');
  const document = value.deleted_at !== null && value.document === null ? null : checkedDocument(value.document, validateDocument);
  return { id: value.id.toLowerCase(), document, version: value.version, updated_at: value.updated_at, deleted_at: value.deleted_at };
}

function checkedMutation({ id, expectedVersion, mutationId }, { creating = false } = {}) {
  if (typeof id !== 'string' || !UUID.test(id) || typeof mutationId !== 'string' || !UUID.test(mutationId)
    || (!(creating && expectedVersion === null) && (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1 || expectedVersion >= MAX_VERSION))) throw new CloudError('INVALID_DATA');
  return { p_id: id.toLowerCase(), p_expected_version: expectedVersion, p_mutation_id: mutationId.toLowerCase() };
}

function checkedRedirect(value) {
  let url;
  try { url = new URL(value); } catch { throw new CloudError('INVALID_DATA', 'Sign-in needs a valid return address.'); }
  if (url.username || url.password || !(url.protocol === 'https:' || url.protocol === 'http:' && localHost(url.hostname))) throw new CloudError('INVALID_DATA', 'Sign-in needs a secure return address.');
  if (typeof location !== 'undefined' && url.origin !== location.origin) throw new CloudError('INVALID_DATA', 'Sign-in must return to this website.');
  return url.href;
}

/** The adapter owns transport only; the editor/controller owns local copies. */
export function createCloudService(input, { createClient = createSupabaseClient } = {}) {
  const config = validateCloudConfig(input);
  const configured = Boolean(config.url);
  const client = configured ? createClient(config.url, config.publishableKey, {
    auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
  }) : null;
  const needClient = () => { if (!client) throw new CloudError('UNAVAILABLE', 'Cloud accounts have not been connected yet. You can keep creating and saving on this device.'); };
  const guarded = async callback => { try { needClient(); return await callback(); } catch (error) { throw normalizedError(error); } };
  let signInAttempt = 0;
  let signInErrorRead = false;

  const readSession = async () => {
    if (!configured) return null;
    return guarded(async () => {
      const data = unwrap(await client.auth.getSession());
      if (!data || !Object.hasOwn(data, 'session')) throw new CloudError('INVALID_DATA');
      return data.session;
    });
  };
  const getSession = async () => userFromSession(await readSession());
  const privateRequest = (expectedUserId, callback) => guarded(async () => {
    // This is the account the user acted on in the UI, not an owner supplied to
    // the database. Auth may already have changed before its UI event arrives.
    if (typeof expectedUserId !== 'string' || !UUID.test(expectedUserId)) throw new CloudError('AUTH_REQUIRED');
    const session = await readSession();
    const before = userFromSession(session);
    const accessToken = session?.access_token;
    if (!before || before.id !== expectedUserId.toLowerCase() || typeof accessToken !== 'string' || !accessToken || accessToken.length > 16_384 || !/^[A-Za-z0-9._~-]+$/u.test(accessToken)) throw new CloudError('AUTH_REQUIRED');
    // SDK fetchWithAuth otherwise looks up the current token at fetch time.
    // Capture it alongside the user, then pin it on every individual request:
    // a concurrent A -> B account switch must never send A's document as B.
    const result = await callback(accessToken);
    // An old request may finish after sign-out or another account signs in.
    // Never allow that response to populate the current account's library.
    const after = await getSession();
    if (before.id !== after?.id) throw new CloudError('AUTH_REQUIRED');
    return result;
  });

  const service = {
    configured,
    googleEnabled: configured && config.googleEnabled,
    forScenes(validateDocument) {
      if(typeof validateDocument !== 'function') throw new TypeError('Scene saves need a validator.');
      const readRecord = value => checkedRecord(value, validateDocument);
      const sceneRequest = async callback => {
        try { return await callback(); }
        catch(error) { if(error instanceof CloudError) throw new CloudError(error.code,error.message.replace(/languages/g,'scenes').replace(/language/g,'scene')); throw error; }
      };
      return {
        configured, getSession, subscribe: listener => service.subscribe(listener), signOut: () => service.signOut(),
        list({expectedUserId}={}) { return sceneRequest(()=>privateRequest(expectedUserId,async accessToken=>{
          const rows=unwrap(await client.from('cloud_scenes').select('id,document,version,updated_at,deleted_at').is('deleted_at',null).order('updated_at',{ascending:false}).limit(51).setHeader('Authorization',`Bearer ${accessToken}`));
          if(!Array.isArray(rows)||rows.length>50)throw new CloudError('INVALID_DATA');
          const records=rows.map(readRecord);
          if(records.some(record=>record.deleted_at!==null)||new Set(records.map(record=>record.id)).size!==records.length)throw new CloudError('INVALID_DATA');
          return records;
        })); },
        save({id,document,expectedVersion,mutationId,expectedUserId}) { return sceneRequest(()=>privateRequest(expectedUserId,async accessToken=>{
          const args=checkedMutation({id,expectedVersion,mutationId},{creating:true});
          const normalized=checkedDocument(document,validateDocument);
          const record=readRecord(unwrap(await client.rpc('save_scene',{...args,p_document:normalized}).setHeader('Authorization',`Bearer ${accessToken}`)));
          if(record.id!==args.p_id||record.deleted_at!==null||record.version!==(expectedVersion??0)+1||canonicalJSON(record.document)!==canonicalJSON(normalized))throw new CloudError('INVALID_DATA');
          return record;
        })); },
        remove({id,expectedVersion,mutationId,expectedUserId}) { return sceneRequest(()=>privateRequest(expectedUserId,async accessToken=>{
          const args=checkedMutation({id,expectedVersion,mutationId});
          const record=readRecord(unwrap(await client.rpc('delete_scene',args).setHeader('Authorization',`Bearer ${accessToken}`)));
          if(record.id!==args.p_id||!record.deleted_at||record.version!==expectedVersion+1)throw new CloudError('INVALID_DATA');
          return record;
        })); },
      };
    },
    getSession,
    async takeSignInError() {
      if (!configured || signInErrorRead) return null;
      signInErrorRead = true;
      const attempt = signInAttempt;
      // getSession() waits for SDK initialization but does not return its
      // callback error. Keep that notice separate from any surviving session.
      let failed;
      try { failed = Boolean((await client.auth.initialize()).error); }
      catch { failed = true; }
      return failed && attempt === signInAttempt ? new CloudError('AUTH_CALLBACK') : null;
    },
    subscribe(listener) {
      if (typeof listener !== 'function') throw new TypeError('An account listener is required.');
      if (!configured) return () => {};
      let active = true;
      const pending = new Set();
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        if (_event === 'SIGNED_IN') { signInAttempt++; signInErrorRead = true; }
        let user;
        try { user = userFromSession(session); } catch { user = null; }
        // Supabase holds an auth lock during this callback. Dispatch on the next
        // task so listeners can safely make subsequent SDK calls.
        const timer = setTimeout(() => {
          pending.delete(timer);
          if (active) listener(user);
        }, 0);
        pending.add(timer);
      });
      return () => {
        active = false;
        for (const timer of pending) clearTimeout(timer);
        pending.clear();
        data?.subscription?.unsubscribe();
      };
    },
    signInEmail(email, redirectTo) {
      return guarded(async () => {
        if (typeof email !== 'string' || email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email.trim())) throw new CloudError('INVALID_DATA', 'Enter a valid email address.');
        const emailRedirectTo = checkedRedirect(redirectTo);
        signInAttempt++;
        signInErrorRead = true;
        unwrap(await client.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo, shouldCreateUser: true } }));
      });
    },
    signInGoogle(redirectTo) {
      return guarded(async () => {
        if (!config.googleEnabled) throw new CloudError('UNAVAILABLE', 'Google sign-in is not enabled yet. Use an email sign-in link.');
        const returnTo = checkedRedirect(redirectTo);
        signInAttempt++;
        signInErrorRead = true;
        unwrap(await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: returnTo } }));
      });
    },
    signOut() { return guarded(async () => { unwrap(await client.auth.signOut({ scope: 'local' })); }); },
    list({ expectedUserId } = {}) {
      return privateRequest(expectedUserId, async accessToken => {
        const rows = unwrap(await client.from('cloud_languages').select('id,document,version,updated_at,deleted_at').is('deleted_at', null).order('updated_at', { ascending: false }).limit(51).setHeader('Authorization', `Bearer ${accessToken}`));
        if (!Array.isArray(rows) || rows.length > 50) throw new CloudError('INVALID_DATA');
        const records = rows.map(value => checkedRecord(value));
        if (records.some(record => record.deleted_at !== null) || new Set(records.map(record => record.id)).size !== records.length) throw new CloudError('INVALID_DATA');
        return records;
      });
    },
    save({ id, document, expectedVersion, mutationId, expectedUserId }) {
      return privateRequest(expectedUserId, async accessToken => {
        const args = checkedMutation({ id, expectedVersion, mutationId }, { creating: true });
        const normalized = checkedDocument(document);
        const saved = checkedRecord(unwrap(await client.rpc('save_language', { ...args, p_document: normalized }).setHeader('Authorization', `Bearer ${accessToken}`)));
        if (saved.id !== args.p_id || saved.deleted_at !== null || saved.version !== (expectedVersion ?? 0) + 1 || canonicalJSON(saved.document) !== canonicalJSON(normalized)) throw new CloudError('INVALID_DATA');
        return saved;
      });
    },
    remove({ id, expectedVersion, mutationId, expectedUserId }) {
      return privateRequest(expectedUserId, async accessToken => {
        const args = checkedMutation({ id, expectedVersion, mutationId });
        const removed = checkedRecord(unwrap(await client.rpc('delete_language', args).setHeader('Authorization', `Bearer ${accessToken}`)));
        if (removed.id !== args.p_id || !removed.deleted_at || removed.version !== expectedVersion + 1) throw new CloudError('INVALID_DATA');
        return removed;
      });
    },
  };
  return service;
}
