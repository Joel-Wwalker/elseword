import { validateLanguage } from './engine.js';
import { canonicalJSON } from './cloud-document.js';

const CACHE_PREFIX = 'little-languages-cloud-links-v1:';
const MAX_CACHE_BYTES = 10_000_000;
const MAX_LINKS = 100;
const isUUID = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const isLocalId = value => typeof value === 'string' && /^[a-zA-Z0-9][\w-]{0,79}$/.test(value);
const copy = value => structuredClone(value);
const messages = {
  AUTH_REQUIRED: 'Sign in to save or open your online languages.',
  CONFLICT: 'This language changed on another device. Refresh the library or save your work as a new cloud copy.',
  NETWORK: 'Could not connect to your cloud library. Your work on this device is unchanged; try again when connected.',
  UNAVAILABLE: 'Cloud saves are not available yet. Your work can still be saved on this device.',
  INVALID_DATA: 'The cloud library returned an unexpected response. Your local work is unchanged.',
  INVALID_DOCUMENT: 'This language could not be saved online. Check its contents or export a local backup.',
  LIMIT: 'Your cloud library is full. Remove a cloud copy before saving another language.',
  BUSY: 'Another cloud save is still finishing. Please try again in a moment.',
  SIGNOUT_FAILED: 'Sign-out could not finish. Your cloud library is hidden here, but the account session may still be active. Reconnect and retry signing out.',
};
function cloudError(error) {
  const code = Object.hasOwn(messages, error?.code) ? error.code : 'NETWORK';
  return Object.assign(new Error(messages[code]), { code });
}
function invalidData() { throw cloudError({ code: 'INVALID_DATA' }); }
function readRecord(value, validateDocument = validateLanguage) {
  if (!value || !isUUID(value.id) || !Number.isSafeInteger(value.version) || value.version < 1
    || typeof value.updated_at !== 'string' || !Number.isFinite(Date.parse(value.updated_at))
    || (value.deleted_at !== null && (typeof value.deleted_at !== 'string' || !Number.isFinite(Date.parse(value.deleted_at))))) invalidData();
  let document = null;
  if (value.document !== null || !value.deleted_at) {
    try { document = validateDocument(value.document); } catch { invalidData(); }
  }
  return { id: value.id, document, version: value.version, updated_at: value.updated_at, deleted_at: value.deleted_at };
}
function readUser(value) {
  if (value === null) return null;
  if (!value || typeof value.id !== 'string' || !value.id || value.id.length > 200) invalidData();
  return { id: value.id, email: typeof value.email === 'string' ? value.email.slice(0, 320) : '' };
}
const sameDocument = (left, right) => canonicalJSON(left) === canonicalJSON(right);

/**
 * A private cloud library, separate from the editor's device-only workspace.
 * It never changes that workspace or uploads on sign-in. The caller explicitly
 * saves a language or opens a cloud copy, then calls linkLocal for that copy.
 */
export class CloudLibrary {
  constructor({ service, storage, uuid = () => crypto.randomUUID(), validateDocument = validateLanguage, cachePrefix = CACHE_PREFIX, resource = 'language' } = {}) {
    if (!service) throw new TypeError('CloudLibrary needs a cloud service.');
    this.service = service;
    this.storage = storage;
    this.uuid = uuid;
    this.validateDocument = validateDocument;
    this.cachePrefix = cachePrefix;
    this.resource = resource;
    this.readRecord = value => readRecord(value, this.validateDocument);
    this.listeners = new Set();
    this.links = new Map();
    this.pending = new Map();
    this.generation = 0;
    this.readSequence = 0;
    this.authEpoch = 0;
    this.destroyed = false;
    this.established = false;
    this.loaded = false;
    this.signingOut = false;
    this._state = { configured: Boolean(service.configured), ready: false, user: null,
      loading: false, busy: false, items: [], error: null, errorCode: null, conflict: null, warning: null, signOutFailed: false };
  }

  get state() { return copy(this._state); }

  subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('A listener is required.');
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  emit() { for (const listener of this.listeners) listener(this.state); }
  current(generation) { return !this.destroyed && generation === this.generation; }
  clearError() { this._state.error = null; this._state.errorCode = null; }
  report(error) {
    const safe = cloudError(error);
    if(this.resource !== 'language') safe.message = safe.message.replace(/languages/g,`${this.resource}s`).replace(/language/g,this.resource);
    this._state.error = safe.message;
    this._state.errorCode = safe.code;
    this.emit();
    return safe;
  }

  start() {
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.initialize();
    return this.startPromise;
  }

  async initialize() {
    if (!this._state.configured || this.destroyed) {
      this._state.ready = true;
      this.emit();
      return this.state;
    }
    this.unsubscribe = this.service.subscribe(user => {
      this.authEpoch++;
      if (this.destroyed || (this.signingOut && user)) return;
      void this.acceptUser(user).catch(() => {}); // The state already carries the safe error.
    });
    const epoch = this.authEpoch;
    try {
      const user = await this.service.getSession();
      if (!this.destroyed && epoch === this.authEpoch) await this.acceptUser(user);
    } catch (error) {
      if (!this.destroyed && epoch === this.authEpoch) this.report(error);
    }
    if (!this.destroyed) { this._state.ready = true; this.emit(); }
    return this.state;
  }

  async acceptUser(value) {
    let user;
    try { user = readUser(value); } catch (error) { throw this.report(error); }
    if (this.established && this._state.user?.id === user?.id) {
      this._state.user = user;
      if (user) this._state.signOutFailed = false;
      this._state.ready = true;
      this.emit();
      return this.state;
    }
    this.established = true;
    this.generation++;
    this.readSequence++;
    this.loaded = false;
    this.links.clear();
    this.pending.clear();
    Object.assign(this._state, { user, ready: true, items: [], loading: false, busy: false,
      error: null, errorCode: null, conflict: null, warning: null, signOutFailed: false });
    if (user) this.restoreLinks();
    this.emit();
    if (user) return this.refresh();
    return this.state;
  }

  requireUser() {
    if (this.destroyed || !this._state.configured) throw this.report({ code: 'UNAVAILABLE' });
    if (!this._state.user) throw this.report({ code: 'AUTH_REQUIRED' });
    return this.generation;
  }

  async refresh() {
    const generation = this.requireUser();
    const expectedUserId = this._state.user.id;
    const sequence = ++this.readSequence;
    this._state.loading = true;
    this.clearError();
    this.emit();
    try {
      const values = await this.service.list({ expectedUserId });
      if (!this.current(generation) || sequence !== this.readSequence) return null;
      if (!Array.isArray(values) || values.length > 50) invalidData();
      const items = values.map(this.readRecord);
      if (new Set(items.map(item => item.id)).size !== items.length || items.some(item => item.deleted_at)) invalidData();
      this._state.items = items;
      this.loaded = true;
      return copy(items);
    } catch (error) {
      if (!this.current(generation) || sequence !== this.readSequence) return null;
      throw this.report(error);
    } finally {
      if (this.current(generation) && sequence === this.readSequence) {
        this._state.loading = false;
        this.emit();
      }
    }
  }

  cacheKey() { return `${this.cachePrefix}${encodeURIComponent(this._state.user.id)}`; }

  restoreLinks() {
    try {
      const raw = this.storage?.getItem(this.cacheKey());
      if (raw == null) return;
      if (typeof raw !== 'string' || raw.length > MAX_CACHE_BYTES || new TextEncoder().encode(raw).byteLength > MAX_CACHE_BYTES) throw new Error();
      const value = JSON.parse(raw);
      if (value?.version !== 1 || !Array.isArray(value.links) || value.links.length > MAX_LINKS) throw new Error();
      const links = new Map();
      for (const item of value.links) {
        if (!item || !isLocalId(item.localId) || links.has(item.localId) || !isUUID(item.cloudId)
          || !Number.isSafeInteger(item.version) || item.version < 1) throw new Error();
        const savedDocument = this.validateDocument(item.savedDocument);
        if (savedDocument.id !== item.localId) throw new Error();
        links.set(item.localId, { cloudId: item.cloudId, version: item.version, savedDocument });
      }
      this.links = links;
    } catch {
      this._state.warning = `Cloud links on this device could not be restored. Your online ${this.resource}s are unchanged; open a cloud copy to reconnect it.`;
    }
  }

  persistLinks() {
    while (this.links.size > MAX_LINKS) this.links.delete(this.links.keys().next().value);
    try {
      if (!this.storage || typeof this.storage.setItem !== 'function') throw new Error();
      const raw = JSON.stringify({ version: 1, links: [...this.links].map(([localId, value]) => ({ localId, ...value })) });
      if (new TextEncoder().encode(raw).byteLength > MAX_CACHE_BYTES) throw new Error();
      this.storage.setItem(this.cacheKey(), raw);
      this._state.warning = null;
    } catch {
      this._state.warning = `This browser could not remember your cloud links. Your online ${this.resource}s are unaffected; open a cloud copy after reloading to reconnect it.`;
    }
  }

  getLink(localId) {
    const link = this._state.user && this.links.get(localId);
    return link ? copy(link) : null;
  }

  linkLocal(localId, value) {
    this.requireUser();
    if (!isLocalId(localId)) throw this.report({ code: 'INVALID_DOCUMENT' });
    const record = this.readRecord(value);
    if (record.deleted_at) throw this.report({ code: 'CONFLICT' });
    const savedDocument = { ...copy(record.document), id: localId };
    this.links.set(localId, { cloudId: record.id, version: record.version, savedDocument });
    this.upsert(record);
    this.persistLinks();
    this.emit();
    return this.getLink(localId);
  }

  savedState(language) {
    const link = this._state.user && this.links.get(language?.id);
    if (!link) return 'local';
    try {
      if (!sameDocument(this.validateDocument(language), link.savedDocument)) return 'changed';
    } catch { return 'changed'; }
    const record = this._state.items.find(item => item.id === link.cloudId);
    if (this.loaded && (!record || record.version !== link.version)) return 'changed';
    return 'saved';
  }

  upsert(record) {
    this._state.items = [copy(record), ...this._state.items.filter(item => item.id !== record.id)]
      .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
  }

  beginWrite() {
    const generation = this.requireUser();
    const expectedUserId = this._state.user.id;
    if (this._state.busy) throw this.report({ code: 'BUSY' });
    this.readSequence++; // A read started before this write cannot undo its acknowledgment.
    this._state.loading = false;
    this._state.busy = true;
    this.clearError();
    this.emit();
    return { generation, expectedUserId };
  }

  async save(language, { asCopy = false } = {}) {
    this.requireUser();
    let document;
    try { document = this.validateDocument(language); } catch { throw this.report({ code: 'INVALID_DOCUMENT' }); }
    const { generation, expectedUserId } = this.beginWrite();
    const localId = document.id;
    const link = !asCopy && this.links.get(localId);
    const fingerprint = canonicalJSON({ document, asCopy, cloudId: link?.cloudId ?? null, version: link?.version ?? null });
    const key = `save:${localId}`;
    let pending = this.pending.get(key);
    this._state.conflict = null;
    try {
      if (pending?.fingerprint !== fingerprint) {
        pending = { fingerprint, request: { id: link ? link.cloudId : this.uuid(), document,
          expectedVersion: link ? link.version : null, mutationId: this.uuid() } };
        if (!isUUID(pending.request.id) || !isUUID(pending.request.mutationId)) invalidData();
        this.pending.set(key, pending);
      }
      const result = await this.service.save({ ...copy(pending.request), expectedUserId });
      if (!this.current(generation)) return null;
      const record = this.readRecord(result);
      if (record.id !== pending.request.id || record.deleted_at || record.version !== (pending.request.expectedVersion ?? 0) + 1
        || !sameDocument(record.document, document)) invalidData();
      this.readSequence++;
      this._state.loading = false;
      this.links.set(localId, { cloudId: record.id, version: record.version, savedDocument: document });
      this.upsert(record);
      this.persistLinks();
      this.pending.delete(key);
      return copy(record);
    } catch (error) {
      if (!this.current(generation)) return null;
      if (error?.code === 'CONFLICT') this._state.conflict = { localId, cloudId: pending.request.id };
      throw this.report(error);
    } finally {
      if (this.current(generation)) { this._state.busy = false; this.emit(); }
    }
  }

  async remove(value) {
    const record = this.readRecord(value);
    const { generation, expectedUserId } = this.beginWrite();
    const key = `remove:${record.id}`;
    let pending = this.pending.get(key);
    try {
      if (pending?.request.expectedVersion !== record.version) {
        pending = { request: { id: record.id, expectedVersion: record.version, mutationId: this.uuid() } };
        if (!isUUID(pending.request.mutationId)) invalidData();
        this.pending.set(key, pending);
      }
      const result = await this.service.remove({ ...copy(pending.request), expectedUserId });
      if (!this.current(generation)) return null;
      const deleted = this.readRecord(result);
      if (deleted.id !== record.id || !deleted.deleted_at || deleted.version !== record.version + 1) invalidData();
      this.readSequence++;
      this._state.loading = false;
      this._state.items = this._state.items.filter(item => item.id !== record.id);
      for (const [localId, link] of this.links) if (link.cloudId === record.id) this.links.delete(localId);
      this.persistLinks();
      this.pending.delete(key);
      return copy(deleted);
    } catch (error) {
      if (!this.current(generation)) return null;
      throw this.report(error);
    } finally {
      if (this.current(generation)) { this._state.busy = false; this.emit(); }
    }
  }

  async signOut() {
    this.authEpoch++;
    this.signingOut = true;
    this._state.signOutFailed = false;
    this.clearError();
    await this.acceptUser(null);
    const generation = this.generation;
    this._state.busy = true;
    this.emit();
    try {
      if (this._state.configured) await this.service.signOut();
      if (!this.current(generation)) return null;
      return this.state;
    } catch (error) {
      if (!this.current(generation)) return null;
      this._state.signOutFailed = true;
      throw this.report({ code: 'SIGNOUT_FAILED' });
    } finally {
      this.signingOut = false;
      if (this.current(generation)) { this._state.busy = false; this.emit(); }
    }
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.generation++;
    this.authEpoch++;
    this.unsubscribe?.();
    this.listeners.clear();
    this.links.clear();
    this.pending.clear();
    Object.assign(this._state, { user: null, items: [], loading: false, busy: false, conflict: null });
  }
}
