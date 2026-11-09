import test from 'node:test';
import assert from 'node:assert/strict';
import { createLanguage, composeSentence, validateLanguage } from '../src/engine.js';
import { translateSentence } from '../src/sentence-translator.js';
import { renderSceneLine } from '../src/scene-language.js';

function language() {
  const result = createLanguage({ seed: 'sentence-consistency' });
  result.words.forEach(word => { word.word = word.english.replaceAll(' ', '-'); });
  result.grammar = { order: 'SVO', adjective: 'before', plural: '-PL', past: 'PAST', future: 'FUT', negative: 'NEG', question: 'Q' };
  return validateLanguage(result);
}

test('builder captions translate back to the same sentence in every grammar order', () => {
  const fixtures = [
    { subject: 'i', verb: 'see', object: 'moon', adjective: 'big' },
    { subject: 'cat', verb: 'see', object: 'book' },
    { subject: 'i', verb: 'see', object: 'books', plural: true },
    { subject: 'children', verb: 'be', adjective: 'happy' },
    { subject: 'we', verb: 'go', object: 'home' },
    { subject: 'he', verb: 'meet', object: 'friend' },
  ];
  for (const order of ['SVO', 'SOV', 'VSO', 'VOS', 'OSV', 'OVS']) {
    for (const adjective of ['before', 'after']) {
      for (const tense of ['present', 'past', 'future']) {
        for (const negative of [false, true]) {
          for (const question of [false, true]) {
            const lang = language();
            Object.assign(lang.grammar, { order, adjective });
            for (const fixture of fixtures) {
              const built = composeSentence({ ...fixture, tense, negative, question }, lang);
              const translated = translateSentence(lang, built.english);
              assert.equal(translated.supported, true, `${built.english}: ${translated.warnings}`);
              assert.equal(translated.text, built.text, `${built.english} (${order}, ${adjective})`);
            }
          }
        }
      }
    }
  }
});

test('builder normalizes inflected verbs and applies English agreement', () => {
  const lang = language();
  const fixtures = [
    [{ subject: 'he', verb: 'go' }, 'He goes.'],
    [{ subject: 'i', verb: 'meet', object: 'friend', tense: 'past' }, 'I met a friend.'],
    [{ subject: 'he', verb: 'asked', object: 'friend' }, 'He asks a friend.'],
    [{ subject: 'i', verb: 'asked', object: 'friend', tense: 'past' }, 'I asked a friend.'],
    [{ subject: 'he', verb: 'am', adjective: 'happy' }, 'He is happy.'],
    [{ subject: 'cat', verb: 'be', adjective: 'happy' }, 'The cat is happy.'],
    [{ subject: 'books', verb: 'be', adjective: 'old' }, 'Books are old.'],
    [{ subject: 'children', verb: 'be', adjective: 'happy', tense: 'past' }, 'Children were happy.'],
  ];
  for (const [options, expected] of fixtures) assert.equal(composeSentence(options, lang).english, expected);
});

test('both sentence tools preserve kept plurals without appending a second suffix', () => {
  const lang = language(), books = lang.words.find(word => word.english === 'books');
  books.word = 'special-books'; books.locked = true;
  const before = structuredClone(lang);
  for (const object of ['book', 'books']) {
    const built = composeSentence({ subject: 'i', verb: 'see', object, plural: true }, lang);
    assert.equal(built.text, 'i see special-books.');
    assert.equal(translateSentence(lang, built.english).text, built.text);
  }
  assert.deepEqual(lang, before);
});

test('simple omitted objects, directional home and greetings are supported', () => {
  const lang = language();
  for (const [english, expected] of [
    ['Dogs eat.', 'dog-PL eat.'], ['Did you eat?', 'you PAST eat Q?'],
    ['We went home.', 'we PAST go home.'], ['Hello!', 'hello!'],
    ['Thank you.', 'thank-you.'], ['Goodbye.', 'goodbye.'],
  ]) {
    const result = translateSentence(lang, english);
    assert.equal(result.supported, true, `${english}: ${result.warnings}`);
    assert.equal(result.text, expected);
  }
});

test('unchanged English plurals still receive the language plural marker', () => {
  const lang = language();
  lang.words.push({ id: 'sheep', english: 'sheep', word: 'sheep', pos: 'noun', category: 'Custom', locked: true, notes: '' });
  for (const object of ['fish', 'sheep']) {
    assert.equal(composeSentence({ subject: 'i', verb: 'see', object, plural: true }, lang).text, `i see ${object}-PL.`);
  }
});

test('sparse imported plural entries retain number and custom spelling without a singular root', () => {
  const lang = language(), books = lang.words.find(word => word.english === 'books');
  books.english = 'Books'; books.word = 'kept-volumes'; books.locked = true;
  delete books.family;
  lang.words = lang.words.filter(word => word.english !== 'book');
  const before = structuredClone(lang);
  for (const plural of [false, true]) {
    const result = composeSentence({ subject: 'i', verb: 'see', object: 'books', plural }, lang);
    assert.equal(result.english, 'I see books.');
    assert.equal(result.text, 'i see kept-volumes.');
  }
  const subject = composeSentence({ subject: 'books', verb: 'eat' }, lang);
  assert.equal(subject.english, 'Books eat.');
  assert.equal(subject.text, 'kept-volumes eat.');
  assert.equal(composeSentence({ subject: 'books', verb: 'be', adjective: 'old' }, lang).english, 'Books are old.');
  for (const [english, expected] of [['I see books.', 'i see kept-volumes.'], ['Books eat.', 'kept-volumes eat.']]) {
    const result = translateSentence(lang, english);
    assert.equal(result.supported, true, result.warnings.join(' '));
    assert.equal(result.text, expected);
    assert.deepEqual(result.addedWords, []);
    assert.deepEqual(result.language, validateLanguage(before));
  }
  assert.deepEqual(lang, before);
});

test('builder rejects missing objects and invalid adjective or motion complements', () => {
  for (const options of [
    { subject: 'i', verb: 'see', adjective: 'big' },
    { subject: 'i', verb: 'go', object: 'moon' },
    { subject: 'i', verb: 'want' }, { subject: 'i', verb: 'be' },
  ]) {
    const result = composeSentence(options, language());
    assert.equal(result.text, '');
    assert.ok(result.error);
  }
});

test('authored scene clauses and both writing tools share their article and marker order', () => {
  const lang = language();
  lang.grammar.order = 'OSV'; lang.grammar.adjective = 'after';
  const options = { subject: 'i', verb: 'see', object: 'moon', adjective: 'big', tense: 'past', negative: true, question: true };
  const scene = { english: 'Did I not see a big moon?', syntax: [{ type: 'clause', subject: 'i', verb: 'see', object: { type: 'noun', head: 'moon', determiner: 'a', adjectives: ['big'] }, tense: 'past', negative: true, question: true }] };
  const built = composeSentence(options, lang), rendered = renderSceneLine(scene, lang);
  assert.equal(built.text, rendered.text);
  assert.equal(translateSentence(lang, scene.english).text, rendered.text);
  assert.ok(rendered.tokens.every(token => [...rendered.text].slice(token.start, token.end).join('') === token.text));
});
