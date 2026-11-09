import test from 'node:test';
import assert from 'node:assert/strict';
import { createLanguage, validateLanguage } from '../src/engine.js';
import { createStarterLanguages, STARTER_SET_VERSION } from '../src/starter-languages.js';
import { loadProject, saveProject, STORAGE_KEY } from '../src/storage.js';

function storageFor(project) {
  const values = new Map(project ? [[STORAGE_KEY, JSON.stringify(project)]] : []);
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test('three distinct playable starters include unchanged Luma and independent documents', () => {
  const starters = createStarterLanguages();
  assert.deepEqual(starters.map(item => item.name), ['Luma', 'Velka', 'Oruni']);
  assert.deepEqual(starters[0], createLanguage());
  assert.equal(new Set(starters.map(item => item.id)).size, 3);
  assert.deepEqual(starters.map(item => item.grammar.order), ['SVO', 'SOV', 'VSO']);
  for (const item of starters) assert.deepEqual(validateLanguage(item), item);
  starters[1].words[0].word = 'edited';
  assert.notEqual(createStarterLanguages()[1].words[0].word, 'edited');
});

test('new projects receive all starters without storage writes', () => {
  const storage = storageFor();
  const project = loadProject(storage);
  assert.deepEqual(project.languages, createStarterLanguages());
  assert.equal(project.starterSetVersion, STARTER_SET_VERSION);
  assert.equal(project.activeId, project.languages[0].id);
  assert.equal(storage.getItem(STORAGE_KEY), null);
});

test('legacy projects gain starters without changing edits or the active language', () => {
  const mine = createLanguage({ name: 'My language', seed: 'kept' });
  mine.words[0].word = 'myword';
  const old = { version: 1, languages: [mine], activeId: mine.id };
  const storage = storageFor(old);
  const project = loadProject(storage);
  assert.deepEqual(project.languages[0], mine);
  assert.deepEqual(project.languages.slice(1).map(item => item.name), ['Velka', 'Oruni']);
  assert.equal(project.activeId, mine.id);
  assert.equal(storage.getItem(STORAGE_KEY), JSON.stringify(old));
  saveProject(storage, project);
  assert.equal(loadProject(storage).languages.length, 3);
});

test('a removed starter stays removed after saving and reloading', () => {
  const storage = storageFor();
  const project = loadProject(storage);
  project.languages = project.languages.filter(item => item.name !== 'Velka');
  saveProject(storage, project);
  assert.deepEqual(loadProject(storage).languages.map(item => item.name), ['Luma', 'Oruni']);
});

test('an existing edited starter is retained without a duplicate', () => {
  const velka = createStarterLanguages()[1];
  velka.name = 'Renamed Velka';
  velka.words[0].word = 'mine';
  const project = loadProject(storageFor({ version: 1, languages: [velka], activeId: velka.id }));
  assert.equal(project.languages.length, 2);
  assert.deepEqual(project.languages[0], velka);
  assert.equal(project.languages[1].name, 'Oruni');
});

test('starter migration respects the language limit and leaves a full project intact', () => {
  const languages = Array.from({ length: 50 }, (_, index) => createLanguage({ name: `Kept ${index}`, seed: String(index) }));
  const storage = storageFor({ version: 1, languages, activeId: languages[49].id });
  const project = loadProject(storage);
  assert.deepEqual(project.languages, languages);
  assert.equal(project.activeId, languages[49].id);
  saveProject(storage, project);
});
