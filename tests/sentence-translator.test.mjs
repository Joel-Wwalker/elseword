import test from 'node:test';
import assert from 'node:assert/strict';
import { createLanguage, validateLanguage, renderWriting } from '../src/engine.js';
import { translateSentence } from '../src/sentence-translator.js';
import { WRITING_PRESETS, applyWritingPreset } from '../src/writing-presets.js';

function literalLanguage() {
  const language = createLanguage({ seed: 'sentence-translator' });
  language.words.forEach(word => { word.word = word.english.replaceAll(' ', '-'); });
  language.grammar = { order: 'SVO', adjective: 'before', plural: 'PL', past: 'PAST', future: 'FUT', negative: 'NEG', question: 'Q' };
  return validateLanguage(language);
}

test('supported simple sentence forms use dictionary words and configured grammar', () => {
  const cases = [
    ['I want bread.', 'i want bread.'],
    ['She likes a small cat.', 'she like a small cat.'],
    ['The baker bought the big apple.', 'the baker PAST buy the big apple.'],
    ['We will see the moon!', 'we FUT see the moon!'],
    ["I don't want a book.", 'i NEG want a book.'],
    ['They did not eat rice.', 'they NEG PAST eat rice.'],
    ['Do you have bread?', 'you have bread Q?'],
    ['Will the teacher see the stars?', 'the teacher FUT see the starPL Q?'],
    ['Is she happy?', 'she be happy Q?'],
    ['The cat was not tired.', 'the cat NEG PAST be tired.'],
    ['Will she be happy?', 'she FUT be happy Q?'],
    ["They won't be tired.", 'they NEG FUT be tired.'],
    ['The cats sleep.', 'the catPL sleep.'],
    ['I see them.', 'i see they.'],
    ['I walked.', 'i PAST walk.'],
    ['Did you read the book?', 'you PAST read the book Q?'],
  ];
  for (const [english, expected] of cases) {
    const result = translateSentence(literalLanguage(), english);
    assert.equal(result.supported, true, `${english}: ${result.warnings}`);
    assert.equal(result.text, expected, english);
    assert.deepEqual(result.addedWords, [], english);
  }
});

test('all six orders and adjective positions apply to subject and object phrases', () => {
  for (const order of ['SVO', 'SOV', 'VSO', 'VOS', 'OSV', 'OVS']) {
    const language = literalLanguage();
    language.grammar.order = order; language.grammar.adjective = 'after';
    const slots = { S: 'the cat small', V: 'NEG PAST see', O: 'the dog big' };
    const result = translateSentence(language, 'The small cat did not see the big dog.');
    assert.equal(result.text, [...order].map(slot => slots[slot]).join(' ') + '.');
  }
});

test('new nouns and recognized adjectives get stable editable words without mutating the input', () => {
  const original = literalLanguage(), before = structuredClone(original);
  const first = translateSentence(original, 'The dragon wants a blue umbrella.');
  assert.equal(first.supported, true, first.warnings.join(' '));
  assert.deepEqual(original, before);
  assert.deepEqual(first.addedWords.map(word => word.english), ['dragon', 'umbrella', 'blue']);
  assert.ok(first.addedWords.every(word => !word.locked && word.id.startsWith('translated-')));
  assert.equal(first.language.revision, original.revision + 1);
  assert.deepEqual(first, translateSentence(original, 'The dragon wants a blue umbrella.'));
  const second = translateSentence(first.language, 'The dragon wants a blue umbrella.');
  assert.equal(second.text, first.text);
  assert.deepEqual(second.addedWords, []);
  assert.equal(second.language.revision, first.language.revision);
  const changed = structuredClone(first.language);
  changed.words.find(word => word.english === 'dragon').word = 'edited';
  assert.ok(translateSentence(changed, 'The dragon wants bread.').text.includes('edited'));
});

test('known irregular and linked plurals reuse roots and preserve kept inflections', () => {
  const language = literalLanguage();
  const books = language.words.find(word => word.english === 'books');
  books.word = 'keptbooks'; books.locked = true;
  assert.equal(translateSentence(language, 'I see books.').text, 'i see keptbooks.');
  assert.equal(translateSentence(language, 'I see children.').text, 'i see childPL.');
  const result = translateSentence(language, 'I see dragons.');
  assert.equal(result.supported, true);
  assert.deepEqual(result.addedWords.map(word => word.english), ['dragon']);
  assert.ok(result.warnings[0].includes('plural'));
});

test('noun inference does not turn adjectives, adverbs or ambiguous plurals into meanings', () => {
  const language = literalLanguage();
  for (const english of ['I eat quickly.', 'I want happily.', 'I want beautiful.', 'I see news.', 'I see houses.', 'I see heroes.', 'I see clothes.', 'I see wolves.']) {
    const result = translateSentence(language, english);
    assert.equal(result.supported, false, english);
    assert.deepEqual(result.addedWords, [], english);
    assert.deepEqual(result.language, language, english);
  }
});

test('dictionary nouns disambiguate plurals with more than one possible ending', () => {
  const language = literalLanguage();
  for (const meaning of ['house', 'hero', 'wolf']) {
    language.words.push({ id: `noun-${meaning}`, english: meaning, word: meaning, pos: 'noun', category: 'Custom', locked: false, notes: '' });
  }
  assert.equal(translateSentence(language, 'I see houses.').text, 'i see housePL.');
  assert.equal(translateSentence(language, 'I see heroes.').text, 'i see heroPL.');
  assert.equal(translateSentence(language, 'I see wolves.').text, 'i see wolfPL.');
});

test('unsupported and ambiguous clauses do not produce plausible translations or partial additions', () => {
  const original = literalLanguage();
  for (const english of [
    'I want a dragon and a cat.', 'I want to eat bread.', 'I am eating rice.',
    'Where is the book?', 'I can see the moon.', 'The dragon sees the cat in the room.',
    'I see a dragon. I like it.', 'I see three cats.', 'I read books.',
    'Does she likes bread?', 'I want.', 'I am.', 'I not want bread.',
    'I see a cats.', 'I walk bread.', 'I see flying birds.', 'I see movies.',
    'She sees the book that is red.', 'I believe you sleep.', "He's happy.",
  ]) {
    const result = translateSentence(original, english);
    assert.equal(result.supported, false, english);
    assert.equal(result.text, '', english);
    assert.deepEqual(result.addedWords, [], english);
    assert.deepEqual(result.language, original, english);
    assert.ok(result.warnings.length, english);
  }
});

test('empty, oversized and non-text input is rejected without changing the language', () => {
  const original = literalLanguage();
  for (const value of ['', ' ', null, {}, 'I want ' + 'x'.repeat(2000)]) {
    const result = translateSentence(original, value);
    assert.equal(result.supported, false);
    assert.deepEqual(result.language, original);
  }
});

test('word limits and impossible sound inventories fail atomically', () => {
  const language = literalLanguage();
  while (language.words.length < 2000) {
    const n = language.words.length;
    language.words.push({ id: `custom-${n}`, english: `entry ${n}`, word: 'a', pos: 'noun', category: 'Custom', notes: '', locked: false });
  }
  const full = translateSentence(language, 'The dragon sees an umbrella.');
  assert.equal(full.supported, false);
  assert.match(full.warnings[0], /2,000/);
  assert.deepEqual(full.addedWords, []);
  const constrained = literalLanguage();
  constrained.sounds = { consonants: [], vowels: ['a'], patterns: ['V'], minSyllables: 1, maxSyllables: 1 };
  constrained.words[0].word = 'a';
  const impossible = translateSentence(constrained, 'I see a dragon.');
  assert.equal(impossible.supported, false);
  assert.match(impossible.warnings[0], /sound rules/);
});

test('translated text stays separate from the chosen writing style', () => {
  const language = literalLanguage();
  language.script = { style: 'custom', direction: 'rtl', glyphs: { i: '◇' } };
  const result = translateSentence(language, 'I want bread.');
  assert.equal(result.text, 'i want bread.');
  assert.equal(renderWriting(result.text, result.language), '◇ want bread.');
  assert.equal(result.language.script.direction, 'rtl');
});

test('every writing preset renders the entire translation without changing its words or grammar', () => {
  const original = literalLanguage();
  const plain = translateSentence(original, 'The cat did not see the moon.');
  assert.equal(plain.supported, true);
  for (const preset of WRITING_PRESETS) {
    for (const direction of ['ltr', 'rtl']) {
      const language = structuredClone(original);
      language.script = applyWritingPreset({ ...language.script, direction }, preset.id);
      const result = translateSentence(language, 'The cat did not see the moon.');
      assert.equal(result.supported, true, preset.id);
      assert.equal(result.text, plain.text, preset.id);
      assert.equal(result.language.script.direction, direction);
      assert.deepEqual(result.addedWords, []);
      const rendered = renderWriting(result.text, result.language);
      const expected = preset.id === 'latin' ? plain.text : Array.from(plain.text, character => preset.glyphs[character.toLowerCase()] ?? character).join('');
      assert.equal(rendered, expected, preset.id);
      assert.equal(Array.from(rendered).length, Array.from(plain.text).length, preset.id);
      assert.ok(rendered.endsWith('.'), preset.id);
      if (preset.id !== 'latin') assert.notEqual(rendered, plain.text, preset.id);
    }
  }
});

test('common profanity is translated as ordinary editable vocabulary without censorship', () => {
  const original = literalLanguage();
  const cases = [
    ['You are a fucking idiot.', ['idiot', 'fucking']],
    ['This is bullshit.', ['bullshit']],
    ['That is a shitty book.', ['shitty']],
    ['I want the damn book.', ['damn']],
    ['I want a goddamn umbrella.', ['umbrella', 'goddamn']],
    ['The crappy dragon sleeps.', ['dragon', 'crappy']],
  ];
  for (const [english, additions] of cases) {
    const result = translateSentence(original, english);
    assert.equal(result.supported, true, `${english}: ${result.warnings}`);
    assert.deepEqual(result.addedWords.map(word => word.english), additions, english);
    assert.ok(result.addedWords.every(word => !word.locked));
    const repeat = translateSentence(result.language, english);
    assert.equal(repeat.text, result.text);
    assert.deepEqual(repeat.addedWords, []);
  }
  assert.equal(original.words.some(word => word.english === 'fucking'), false);
});

test('swear verbs support ordinary inflections, tense, questions and negation', () => {
  for (const [english, root, tense] of [
    ['I fuck.', 'fuck', 'present'], ['She fucks.', 'fuck', 'present'],
    ['They fucked.', 'fuck', 'past'], ['I shit.', 'shit', 'present'],
    ['He shits.', 'shit', 'present'], ['We shat.', 'shit', 'past'],
    ['I piss.', 'piss', 'present'], ['She pisses.', 'piss', 'present'],
    ['They pissed.', 'piss', 'past'], ['Did you fuck?', 'fuck', 'past'],
    ['I will not piss.', 'piss', 'future'],
  ]) {
    const result = translateSentence(literalLanguage(), english);
    assert.equal(result.supported, true, `${english}: ${result.warnings}`);
    assert.deepEqual(result.addedWords.map(word => word.english), [root]);
    assert.equal(result.addedWords[0].pos, 'verb');
    assert.equal(result.text.includes('PAST'), tense === 'past', english);
    assert.equal(result.text.includes('FUT'), tense === 'future', english);
    if (english.includes('not')) assert.ok(result.text.includes('NEG'));
    if (english.endsWith('?')) assert.ok(result.text.endsWith(' Q?'));
  }
});

test('standalone swear expressions coin one stable phrase rather than a false sentence parse', () => {
  for (const phrase of ['shit', 'fuck', 'fuck you', 'damn it', 'bullshit', 'holy shit']) {
    const original = literalLanguage();
    const result = translateSentence(original, `${phrase}!`);
    assert.equal(result.supported, true, `${phrase}: ${result.warnings}`);
    assert.deepEqual(result.addedWords.map(word => word.english), [phrase]);
    assert.equal(result.text, result.addedWords[0].word + '!');
    assert.equal(result.addedWords[0].id.includes(' '), false);
    const repeat = translateSentence(result.language, `${phrase}!`);
    assert.equal(repeat.text, result.text);
    assert.deepEqual(repeat.addedWords, []);
    result.language.words.find(word => word.english === phrase).word = 'edited';
    assert.equal(translateSentence(result.language, `${phrase}!`).text, 'edited!');
  }
});

test('dictionary case does not create duplicate meanings or discard user spellings', () => {
  const language = literalLanguage();
  for (const [english, word, pos] of [['Dragon', 'drako', 'noun'], ['Fuck', 'fuko', 'verb'], ['Fuck You', 'fukoyu', 'particle']]) {
    language.words.push({ id: `case-${english.replaceAll(' ', '-')}`, english, word, pos, category: 'Custom', locked: true, notes: '' });
  }
  const sentence = translateSentence(language, 'The dragon fucked.');
  assert.equal(sentence.supported, true, sentence.warnings.join(' '));
  assert.equal(sentence.text, 'the drako PAST fuko.');
  assert.deepEqual(sentence.addedWords, []);
  const expression = translateSentence(language, 'FUCK YOU!');
  assert.equal(expression.text, 'fukoyu!');
  assert.deepEqual(expression.addedWords, []);
});

test('profanity does not bypass clause limits or permit partial dictionary writes', () => {
  const language = literalLanguage();
  for (const english of ['Fuck you and the dragon!', 'You are a fucking idiot because you sleep.', 'I see the dragon that shits.', 'This is bullshit and I hate it.', 'I am fucking a dragon.', 'Fuck you! Shit!']) {
    const result = translateSentence(language, english);
    assert.equal(result.supported, false, english);
    assert.deepEqual(result.addedWords, []);
    assert.deepEqual(result.language, language);
    assert.equal(result.text, '');
  }
});
