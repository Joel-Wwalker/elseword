import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createLanguage, generateWord, regenerateLanguage, restartVocabulary, validateLanguage, PRESETS } from '../src/engine.js';
import { createStarterLanguages } from '../src/starter-languages.js';
import { validateRulesEdit } from '../src/studio-usability.js';
import { loadProject, saveProject, STORAGE_KEY } from '../src/storage.js';
import { generationDiagnostics } from '../src/generator-diagnostics.js';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clean = language => {
  for (const word of language.words) assert.doesNotMatch(word.word, /[aeiouyøæə]{3}|(.)\1\1/iu, `${language.name}: ${word.english} = ${word.word}`);
};

test('new default words and linked plurals avoid long vowel runs and repeated letters', () => {
  for (const language of createStarterLanguages()) clean(language);
  for (const preset of PRESETS) for (let seed = 0; seed < 12; seed++) {
    const language = createLanguage({ preset: preset.id, seed: `quality-${seed}` });
    clean(language);
    assert.equal(language.words.find(word => word.english === 'stars').word,
      language.words.find(word => word.english === 'star').word + language.grammar.plural);
  }
});

test('legacy generation preserves the entire document and its seed restart behavior', () => {
  const language = createLanguage({ generationVersion: 1 });
  assert.equal(hash(language), '463d2f829e5456077f2608e84a46fe7266625a9136a2412f5a84004cdf637616');
  assert.equal(hash(regenerateLanguage(language)), '15bf7782c5cb583b56559c779e019dd466524d8a37091b9ec4b99fa1d13355ae');
  assert.equal(hash(restartVocabulary(language)), '92094bebe9a83af5813a2707310430caed17e6817d5ab538657bfaa2c929ffba');
  assert.equal(generateWord(language, 'quality-probe', 27), 'uma');
  assert.deepEqual(validateLanguage(JSON.stringify(language)), language);
  const stored = JSON.stringify({ version: 1, languages: [language], activeId: language.id, starterSetVersion: 1 });
  const loaded = loadProject({ getItem: key => key === STORAGE_KEY ? stored : null }).languages[0];
  assert.equal(hash(loaded), hash(language));
  assert.equal(loaded.generationVersion, undefined);
});

test('generation policy survives storage and import without rewriting existing spellings', () => {
  const language = createLanguage();
  language.words.find(word => word.english === 'bus').word = 'raaa';
  language.words.find(word => word.english === 'bus').locked = true;
  language.grammar.past = 'custom';
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  saveProject(storage, { languages: [language], activeId: language.id });
  const loaded = loadProject(storage).languages[0];
  assert.equal(loaded.generationVersion, 2);
  assert.deepEqual(loaded, language);
  assert.deepEqual(validateLanguage(JSON.parse(values.get(STORAGE_KEY)).languages[0]), language);
  const rerolled = regenerateLanguage(language);
  assert.equal(rerolled.words.find(word => word.english === 'bus').word, 'raaa');
  assert.equal(rerolled.grammar.past, 'custom');
  assert.deepEqual(restartVocabulary(rerolled).words, language.words);
});

test('custom sound edits opt out while a seed-only edit retains default generation', () => {
  const language = createLanguage();
  const custom = validateRulesEdit(language, { sounds: { consonants: [], vowels: ['i'], patterns: ['V'], minSyllables: 3, maxSyllables: 3 } }).language;
  assert.equal(custom.generationVersion, undefined);
  assert.equal(generateWord(custom, 'custom'), 'iii');
  assert.equal(validateRulesEdit(language, { seed: 'another-seed' }).language.generationVersion, 2);
  assert.equal(validateRulesEdit(language, { sounds: structuredClone(language.sounds) }).language.generationVersion, 2);
});

test('explicit rules and tiny custom inventories retain their requested spellings', () => {
  const language = createLanguage();
  language.sounds = { consonants: [], vowels: ['a'], patterns: ['V'], minSyllables: 3, maxSyllables: 3,
    rules: { initial: ['aaa'], final: [], forbidden: [], weights: { a: 10 } } };
  assert.equal(generateWord(language, 'custom'), 'aaa');
  delete language.sounds.rules;
  assert.equal(generateWord(language, 'tiny'), 'aaa');
  language.sounds = { consonants: ['p'], vowels: ['a'], patterns: ['CV'], minSyllables: 1, maxSyllables: 1 };
  assert.equal(generateWord(language, 'tiny'), 'pa');
  assert.equal(generateWord(language, 'tiny'), generateWord(language, 'tiny'));
  language.sounds.consonants = ['a']; language.sounds.minSyllables = 2; language.sounds.maxSyllables = 2;
  assert.equal(generateWord(language, 'impossible-quality'), 'aaaa');
  assert.equal(generationDiagnostics(language).capacity, 1);
  const weighted = createLanguage();
  weighted.sounds.rules = { initial: [], final: [], forbidden: ['mm'], weights: { a: 100, p: 0.001 } };
  const old = structuredClone(weighted); delete old.generationVersion;
  for (let salt = 0; salt < 20; salt++) assert.equal(generateWord(weighted, 'custom-weights', salt), generateWord(old, 'custom-weights', salt));
});

test('capacity accounts for default spelling preferences and the plural boundary', () => {
  const language = createLanguage();
  language.sounds = { consonants: ['m'], vowels: ['a'], patterns: ['CV', 'V'], minSyllables: 2, maxSyllables: 3 };
  language.grammar.plural = 'a';
  assert.equal(generationDiagnostics(language).capacity, 6);
  delete language.generationVersion;
  assert.equal(generationDiagnostics(language).capacity, 12);
});

test('invalid generator versions are rejected instead of silently changing semantics', () => {
  for (const version of [0, 1, 3, '2', null, {}, true]) {
    const language = createLanguage(); language.generationVersion = version;
    assert.throws(() => validateLanguage(language), /generation|generator/i);
  }
});
