import test from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '../src/engine.js';
import { languageFromBlueprint } from '../src/language-generator.js';

const compatible = (text, sounds) => {
  const tokens = [...sounds.consonants, ...sounds.vowels];
  const reached = new Set([0]);
  for (let i = 0; i < text.length; i++) if (reached.has(i)) {
    for (const token of tokens) if (text.startsWith(token, i)) reached.add(i + token.length);
  }
  return reached.has(text.length);
};
const markers = ['plural', 'past', 'future', 'negative', 'question'];

test('new languages use their own inventory for every grammar marker', () => {
  for (const preset of engine.PRESETS) {
    const language = engine.createLanguage({ preset: preset.id });
    for (const key of markers) assert.ok(compatible(language.grammar[key], language.sounds), `${preset.id} ${key}: ${language.grammar[key]}`);
  }
});

test('new catalog languages repair incompatible markers without changing compatible ones', () => {
  const language = engine.createLanguage();
  const blueprint = { version: 1, name: 'Sample', seed: 'catalog', preset: 'soft', sounds: language.sounds,
    grammar: { ...language.grammar, past: 'ta', future: 'va' } };
  const before = structuredClone(blueprint);
  const result = languageFromBlueprint(blueprint);
  assert.ok(compatible(result.grammar.past, result.sounds));
  assert.equal(result.grammar.future, 'va');
  assert.deepEqual(blueprint, before);
});

test('repairing catalog markers reserves the compatible markers it keeps', () => {
  const blueprint = { version: 1, name: 'Sample', seed: 'oddtongue-catalog-v1-0042', preset: 'crisp',
    sounds: { consonants: ['p','t','k','b','d','g','s','z','ch'], vowels: ['e','i','u'], patterns: ['CV','V'], minSyllables: 2, maxSyllables: 3 },
    grammar: { order: 'SVO', adjective: 'before', plural: 'i', past: 'ke', future: 'pa', negative: 'zi', question: 'tu' } };
  const language = languageFromBlueprint(blueprint);
  assert.equal(language.grammar.past, 'ke');
  assert.equal(new Set(markers.map(key => language.grammar[key])).size, 5);
});

test('restart from seed restores starting roots and preserves kept words and document metadata', () => {
  const language = engine.createLanguage({ seed: 'restart' });
  language.name = 'My edited language';
  language.grammar.past = 'custom';
  language.words.find(word => word.english === 'coffee').locked = true;
  const rerolled = engine.regenerateLanguage(engine.regenerateLanguage(language));
  const before = structuredClone(rerolled);
  assert.equal(typeof engine.restartVocabulary, 'function');
  const restarted = engine.restartVocabulary(rerolled);
  assert.deepEqual(rerolled, before);
  assert.equal(restarted.id, language.id);
  assert.equal(restarted.name, language.name);
  assert.equal(restarted.grammar.past, 'custom');
  assert.equal(restarted.revision, rerolled.revision + 1);
  assert.deepEqual(restarted.words, language.words);
  assert.deepEqual(engine.restartVocabulary(restarted).words, restarted.words);
});

test('loading and rerolling never silently repair custom grammar markers', () => {
  const language = engine.createLanguage();
  language.grammar.past = 'custom';
  assert.equal(engine.validateLanguage(language).grammar.past, 'custom');
  assert.equal(engine.regenerateLanguage(language).grammar.past, 'custom');
  assert.equal(typeof engine.regenerateGrammarMarkers, 'function');
  const repaired = engine.regenerateGrammarMarkers(language);
  assert.ok(compatible(repaired.grammar.past, repaired.sounds));
  assert.deepEqual(repaired.words.filter(word => !word.family), language.words.filter(word => !word.family));
  assert.equal(language.grammar.past, 'custom');
});
