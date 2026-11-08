import test from 'node:test';
import assert from 'node:assert/strict';
import { createLanguage } from '../src/engine.js';
import { STORAGE_KEY, loadProject, saveProject } from '../src/storage.js';
const RECOVERY_KEY = `${STORAGE_KEY}-recovery`;

function memoryStorage(initial) {
  const values = new Map(initial === undefined ? [] : [[STORAGE_KEY, initial]]);
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
}

test('missing storage starts a playable Luma without writing until the user saves', () => {
  const storage = memoryStorage();
  const loaded = loadProject(storage);
  assert.equal(loaded.languages[0].name, 'Luma');
  assert.equal(loaded.activeId, loaded.languages[0].id);
  assert.equal(loaded.warning, null);
  assert.equal(storage.getItem(STORAGE_KEY), null);
});

test('multiple languages round trip without mutating the caller or sharing object references', () => {
  const storage = memoryStorage();
  const languages = [createLanguage({ name: 'Luma', seed: 'one' }), createLanguage({ name: 'Second', seed: 'two', preset: 'crisp' })];
  const project = { languages, activeId: languages[1].id };
  const before = JSON.stringify(project);
  saveProject(storage, project);
  const loaded = loadProject(storage);
  assert.deepEqual(loaded.languages, languages);
  assert.equal(loaded.activeId, languages[1].id);
  assert.equal(loaded.warning, null);
  assert.equal(JSON.stringify(project), before);
  loaded.languages[0].name = 'Changed';
  assert.equal(loadProject(storage).languages[0].name, 'Luma');
  assert.equal(languages[0].name, 'Luma');
});

test('corrupt backups remain untouched while the interface receives a safe fallback and warning', () => {
  const corrupt = '{bad JSON but might be recoverable';
  const storage = memoryStorage(corrupt);
  const loaded = loadProject(storage);
  assert.equal(loaded.languages.length, 1);
  assert.ok(loaded.warning);
  assert.match(loaded.warning, /saved|recover|backup|damaged/i);
  assert.equal(storage.getItem(STORAGE_KEY), corrupt);
});

test('valid languages are recovered from a partially damaged project without overwriting it', () => {
  const valid = createLanguage({ name: 'Still here', seed: 'valid' });
  const corrupt = JSON.stringify({ version: 1, languages: [valid, { version: 99, name: 'Broken' }], activeId: valid.id });
  const storage = memoryStorage(corrupt);
  const loaded = loadProject(storage);
  assert.deepEqual(loaded.languages, [valid]);
  assert.equal(loaded.activeId, valid.id);
  assert.match(loaded.warning, /1|one/i);
  assert.equal(storage.getItem(STORAGE_KEY), corrupt);
});

test('a missing active ID opens the first valid saved language', () => {
  const valid = createLanguage({ name: 'First', seed: 'active-test' });
  const storage = memoryStorage(JSON.stringify({ version: 1, languages: [valid], activeId: 'missing' }));
  const loaded = loadProject(storage);
  assert.equal(loaded.activeId, valid.id);
  saveProject(storage, { languages: [valid], activeId: 'missing' });
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).activeId, valid.id);
});

test('quota and unavailable storage errors are actionable and preserve existing contents', () => {
  const project = loadProject(memoryStorage());
  const storage = memoryStorage('original');
  storage.setItem = () => { const error = new Error('Quota'); error.name = 'QuotaExceededError'; throw error; };
  assert.throws(() => saveProject(storage, project), /full|quota|space/i);
  assert.equal(storage.getItem(STORAGE_KEY), 'original');
  assert.throws(() => saveProject(undefined, project), /unavailable|storage/i);
  const unavailable = loadProject({ getItem: () => { throw new Error('blocked'); } });
  assert.ok(unavailable.warning);
  assert.equal(unavailable.languages.length, 1);
});

test('saving rejects invalid languages, duplicate IDs and projects above the language limit', () => {
  const storage = memoryStorage('keep');
  const language = createLanguage();
  assert.throws(() => saveProject(storage, { languages: [language, language], activeId: language.id }), /duplicate|unique/i);
  assert.throws(() => saveProject(storage, { languages: [{ version: 8 }], activeId: 'bad' }), /version/i);
  assert.throws(() => saveProject(storage, { languages: Array(51).fill(language), activeId: language.id }), /50|limit/i);
  assert.equal(storage.getItem(STORAGE_KEY), 'keep');
});

test('oversized, unsafe or entirely unusable saved projects fall back without writes', () => {
  for (const source of [JSON.stringify({ version: 1, languages: [], activeId: '' }), '{"version":1,"__proto__":{},"languages":[]}', JSON.stringify({ version: 2, languages: [] })]) {
    const storage = memoryStorage(source);
    const result = loadProject(storage);
    assert.ok(result.warning);
    assert.equal(result.languages[0].name, 'Luma');
    assert.equal(storage.getItem(STORAGE_KEY), source);
  }
});

test('editing a recovered corrupt save preserves its exact original before replacing the main save', () => {
  const raw = '{incomplete but valuable original';
  const storage = memoryStorage(raw);
  const project = loadProject(storage);
  assert.equal(project.recoveryRaw, raw);
  project.languages[0].name = 'My edited language';
  const saved = saveProject(storage, project);
  assert.equal(storage.getItem(RECOVERY_KEY), raw);
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).languages[0].name, 'My edited language');
  assert.equal(Object.hasOwn(JSON.parse(storage.getItem(STORAGE_KEY)), 'recoveryRaw'), false);
  assert.equal(saved.recoveryRaw, raw);
});

test('partially damaged projects keep skipped entries in the separate raw recovery save', () => {
  const valid = createLanguage({ name: 'Saved', seed: 'recover-partial' });
  const raw = JSON.stringify({ version: 1, languages: [valid, { version: 99, name: 'Unrecognized language data', extra: 'keep this' }], activeId: valid.id });
  const storage = memoryStorage(raw);
  const project = loadProject(storage);
  project.languages[0].name = 'Edited';
  saveProject(storage, project);
  assert.equal(storage.getItem(RECOVERY_KEY), raw);
  assert.equal(loadProject(storage).languages[0].name, 'Edited');
});

test('failure to preserve a recovery backup leaves the original main save untouched', () => {
  for (const name of ['QuotaExceededError', 'SecurityError']) {
    const raw = '{damaged original';
    const storage = memoryStorage(raw);
    const project = loadProject(storage);
    const originalSet = storage.setItem;
    storage.setItem = (key, value) => {
      if (key === RECOVERY_KEY) { const error = new Error('Blocked'); error.name = name; throw error; }
      originalSet(key, value);
    };
    assert.throws(() => saveProject(storage, project), /storage|backup|full|unavailable/i);
    assert.equal(storage.getItem(STORAGE_KEY), raw);
    assert.equal(storage.getItem(RECOVERY_KEY), null);
  }
});

test('later edits reuse the existing recovery copy instead of rewriting it', () => {
  const raw = '{original recovery';
  const storage = memoryStorage(raw);
  const project = loadProject(storage);
  saveProject(storage, project);
  const originalSet = storage.setItem;
  storage.setItem = (key, value) => {
    if (key === RECOVERY_KEY) throw new Error('Unnecessary recovery rewrite');
    originalSet(key, value);
  };
  project.languages[0].name = 'Another edit';
  saveProject(storage, project);
  assert.equal(storage.getItem(RECOVERY_KEY), raw);
  assert.equal(loadProject(storage).languages[0].name, 'Another edit');
});
