import test from 'node:test';
import assert from 'node:assert/strict';
import { createLanguage } from '../src/engine.js';
import * as diagnostics from '../src/generator-diagnostics.js';

test('sound compatibility finds a complete tokenization instead of a greedy prefix', () => {
  assert.equal(typeof diagnostics.usesSoundInventory, 'function');
  const sounds = { consonants: ['ab', 'a'], vowels: ['bc', 'é'] };
  assert.equal(diagnostics.usesSoundInventory('abc', sounds), true);
  assert.equal(diagnostics.usesSoundInventory('abe\u0301', sounds), true);
  assert.equal(diagnostics.usesSoundInventory('abx', sounds), false);
  assert.equal(diagnostics.usesSoundInventory('', sounds), true);
});

test('small sound spaces count distinct spellings and apply word restrictions', () => {
  assert.equal(typeof diagnostics.generationDiagnostics, 'function');
  const language = createLanguage();
  language.sounds = { consonants: ['s'], vowels: ['a'], patterns: ['CV', 'VC', 'CVC'], minSyllables: 1, maxSyllables: 1 };
  assert.equal(diagnostics.generationDiagnostics(language).capacity, 3);
  language.sounds.rules = { initial: ['s'], final: [], forbidden: ['sas'], weights: {} };
  assert.equal(diagnostics.generationDiagnostics(language).capacity, 1);
  language.sounds = { consonants: ['a'], vowels: ['aa'], patterns: ['CV', 'VC'], minSyllables: 1, maxSyllables: 2 };
  assert.equal(diagnostics.generationDiagnostics(language).capacity, 2);
});

test('large spaces return an unknown capacity and stay within the enumeration budget', () => {
  assert.equal(typeof diagnostics.generationDiagnostics, 'function');
  const language = createLanguage({ preset: 'strange' });
  const result = diagnostics.generationDiagnostics(language);
  assert.equal(result.capacity, null);
  assert.ok(result.combinationUpperBound > 10000);
});

test('collision groups include kept homonyms but exclude explicit aliases', () => {
  assert.equal(typeof diagnostics.generationDiagnostics, 'function');
  const language = createLanguage();
  const first = language.words.find(word => word.english === 'book');
  const second = language.words.find(word => word.english === 'moon');
  first.word = second.word = 'same'; first.locked = true;
  const result = diagnostics.generationDiagnostics(language);
  assert.deepEqual(result.collisions.find(group => group.word === 'same').meanings, ['book', 'moon']);
  assert.ok(!result.collisions.some(group => group.meanings.includes('am')));
});

test('combining sounds have the same compatibility and capacity as generated words', () => {
  const language = createLanguage();
  language.sounds = { consonants: ['e'], vowels: ['\u0301'], patterns: ['CV'], minSyllables: 1, maxSyllables: 1,
    rules: { initial: ['é'], final: [], forbidden: [], weights: {} } };
  assert.equal(diagnostics.usesSoundInventory('é', language.sounds), true);
  assert.equal(diagnostics.generationDiagnostics(language).capacity, 1);
  assert.equal(diagnostics.usesSoundInventory('ΑΣ', { consonants: ['Σ'], vowels: ['Α'] }), true);
});

test('kept aliases with their own spelling still report accidental homonyms', () => {
  const language = createLanguage();
  const alias = language.words.find(word => word.english === 'am');
  const moon = language.words.find(word => word.english === 'moon');
  alias.word = moon.word; alias.locked = true;
  assert.ok(diagnostics.generationDiagnostics(language).collisions.some(group => group.meanings.includes('am') && group.meanings.includes('moon')));
});
