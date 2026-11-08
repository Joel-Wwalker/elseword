import test from 'node:test';
import assert from 'node:assert/strict';
import { renderSceneLine } from '../src/scene-language.js';
import { createLanguage } from '../src/engine.js';
import { SCENES, getSceneEpisodes } from '../src/scenes.js';

function checkSpans(rendered) {
  const chars = [...rendered.text];
  let previousEnd = 0;
  for (const token of rendered.tokens) {
    assert.ok(token.start >= previousEnd, 'Tokens are ordered and never overlap');
    assert.ok(token.end > token.start, 'No empty clickable token');
    assert.equal(chars.slice(token.start, token.end).join(''), token.text);
    previousEnd = token.end;
  }
}

test('tokens preserve exact keys through homonyms, repeated phrases, missing words and Unicode', () => {
  const language = { words: [
    { id: 'hello-id', english: 'hello', word: '𐀀é' },
    { id: 'goodbye-id', english: 'goodbye', word: '𐀀é' },
    { id: 'how-much-id', english: 'how much', word: 'na ka' },
  ] };
  const line = { english: 'A deliberately ambiguous sentence.', syntax: [
    { type: 'fragment', items: ['hello', 'goodbye', 'how much'], separator: ', ', punctuation: '!' },
    { type: 'fragment', items: ['hello', 'missing'] },
  ] };
  const rendered = renderSceneLine(line, language);
  assert.equal(rendered.text, '𐀀é, 𐀀é, na ka! 𐀀é ⟦missing⟧.');
  assert.deepEqual(rendered.tokens.map(({ key, wordId, start, end }) => ({ key, wordId, start, end })), [
    { key: 'hello', wordId: 'hello-id', start: 0, end: 2 },
    { key: 'goodbye', wordId: 'goodbye-id', start: 4, end: 6 },
    { key: 'how much', wordId: 'how-much-id', start: 8, end: 13 },
    { key: 'hello', wordId: 'hello-id', start: 15, end: 17 },
    { key: 'missing', wordId: undefined, start: 18, end: 27 },
  ]);
  assert.deepEqual(rendered.unknown, ['missing']);
  assert.ok(rendered.tokens.every(token => token.kind === 'word'));
  checkSpans(rendered);
});

test('reordered clauses keep lexical roots separate from tense, negation and inflection', () => {
  const language = createLanguage({ seed: 'clickable' });
  language.words = language.words.map(entry => ({ ...entry, word: entry.english }));
  language.grammar = { order: 'SOV', adjective: 'after', plural: '𐀀', past: 'P', future: 'F', negative: 'N', question: 'Q' };
  const line = { english: 'Did I not read the quiet books?', syntax: [{
    type: 'clause', subject: 'i', verb: 'read', tense: 'past', negative: true, question: true,
    object: { type: 'noun', head: 'book', determiner: 'the', adjectives: ['quiet'], plural: true },
  }] };
  const rendered = renderSceneLine(line, language);
  assert.equal(rendered.text, 'i the book𐀀 quiet N P read Q?');
  assert.deepEqual(rendered.tokens.map(token => token.key ?? token.marker), ['i', 'the', 'book', 'quiet', 'negative', 'past', 'read', 'question']);
  const book = rendered.tokens.find(token => token.key === 'book');
  assert.equal(book.text, 'book𐀀');
  assert.equal(book.wordId, language.words.find(entry => entry.english === 'book').id);
  assert.deepEqual(book.suffixes, [{ marker: 'plural', text: '𐀀' }]);
  assert.equal(book.end - book.start, 5);
  assert.ok(rendered.tokens.filter(token => token.kind === 'marker').every(token => !token.wordId && !token.key));
  checkSpans(rendered);
});

test('empty markers add no buttons and fragment questions retain marker provenance', () => {
  const language = { grammar: { plural: '', question: '' }, words: [{ id: 'b', english: 'book', word: 'b' }] };
  const line = { english: 'Books?', syntax: [{ type: 'fragment', items: [{ type: 'noun', head: 'book', plural: true }], question: true }] };
  const empty = renderSceneLine(line, language);
  assert.equal(empty.text, 'b?');
  assert.equal(empty.tokens.length, 1);
  checkSpans(empty);
  language.grammar.question = 'qq';
  const question = renderSceneLine(line, language);
  assert.deepEqual(question.tokens.at(-1), { kind: 'marker', marker: 'question', text: 'qq', start: 2, end: 4 });
  checkSpans(question);
});

test('all authored conversation tokens point to real roots across every word order', () => {
  const language = createLanguage({ seed: 'scene-token-coverage' });
  for (const order of ['SVO', 'SOV', 'VSO', 'VOS', 'OSV', 'OVS']) {
    language.grammar.order = order;
    for (const scene of SCENES) for (const episode of getSceneEpisodes(scene.id)) for (const line of episode.lines) {
      const rendered = renderSceneLine(line, language);
      checkSpans(rendered);
      for (const token of rendered.tokens.filter(token => token.kind === 'word')) {
        const entry = language.words.find(word => word.id === token.wordId);
        assert.equal(entry?.english, token.key);
        assert.equal(token.text, entry.word + (token.suffixes ?? []).map(suffix => suffix.text).join(''));
      }
    }
  }
});
