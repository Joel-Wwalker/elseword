import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRESETS, CORE_VOCAB, createLanguage, generateWord, regenerateLanguage,
  translateText, composeSentence, validateLanguage, exportCSV,
  generateNames, applySoundChange, renderWriting,
} from '../src/engine.js';

const starter = () => createLanguage({ name: 'Luma', seed: 'test-seed', preset: 'soft' });
const word = (language, english) => language.words.find((entry) => entry.english === english);
function fixedLanguage() {
  const language = starter();
  const fixed = { i: 'mi', eat: 'et', bread: 'poma', big: 'dor', 'thank you': 'sali', you: 'tu', one: 'na', please: 'li' };
  for (const [english, value] of Object.entries(fixed)) word(language, english).word = value;
  return language;
}

test('same seed and sound settings produce stable roots and explicit related forms', () => {
  const a = starter();
  const b = starter();
  assert.deepEqual(a, b);
  assert.ok(CORE_VOCAB.length >= 220);
  assert.equal(a.words.length, CORE_VOCAB.length);
  const roots = a.words.filter((entry) => !entry.family);
  assert.equal(new Set(roots.map((entry) => entry.word)).size, roots.length);
  assert.equal(word(a, 'is').word, word(a, 'be').word);
  assert.equal(generateWord(a, 'coffee'), generateWord(b, 'coffee'));
  assert.notEqual(generateWord(a, 'coffee'), generateWord({ ...b, seed: 'other-seed' }, 'coffee'));
  assert.deepEqual(PRESETS.map((preset) => preset.id).sort(), ['crisp', 'earthy', 'soft', 'strange']);
  assert.equal(word(createLanguage('soft'), 'bread').word, 'poma');
});

test('custom Unicode sounds and selected syllable patterns govern generation', () => {
  const language = starter();
  language.sounds = { consonants: ['ʃ'], vowels: ['ø'], patterns: ['CVC'], minSyllables: 2, maxSyllables: 2 };
  assert.equal(generateWord(language, 'anything'), 'ʃøʃʃøʃ');
  language.sounds = { consonants: ['n'], vowels: ['é'], patterns: ['V'], minSyllables: 1, maxSyllables: 1 };
  assert.equal(generateWord(language, 'anything'), 'é');
});

test('regeneration changes unlocked vocabulary without mutating or losing locked entries', () => {
  const language = starter();
  word(language, 'coffee').locked = true;
  word(language, 'coffee').word = 'café';
  const snapshot = JSON.stringify(language);
  const changed = regenerateLanguage(language);
  assert.equal(JSON.stringify(language), snapshot);
  assert.equal(word(changed, 'coffee').word, 'café');
  assert.equal(word(changed, 'bread').word, 'poma');
  assert.equal(changed.words.length, language.words.length);
  assert.equal(changed.revision, language.revision + 1);
  assert.ok(changed.words.some((entry, i) => !entry.locked && entry.word !== language.words[i].word));
});

test('free text gloss preserves punctuation and marks unknowns rather than inventing words', () => {
  const result = translateText('One bread, please! Mystery?\n🦉', fixedLanguage());
  assert.equal(result.text, 'na poma, li! ⟦Mystery⟧?\n🦉');
  assert.deepEqual(result.unknown, ['Mystery']);
  assert.ok(result.tokens.some((token) => token.source === 'bread' && token.known && token.text === 'poma'));
  assert.equal(translateText('Thank you, YOU.', fixedLanguage()).text, 'sali, tu.');
});

test('multiword matching prefers the longest entry and does not consume punctuation', () => {
  const language = fixedLanguage();
  language.words.push({ id: 'thank-you-very-much', english: 'thank you very much', word: 'malo', pos: 'phrase', category: 'Essentials', locked: true, notes: '' });
  assert.equal(translateText('Thank you very much; thank you.', language).text, 'malo; sali.');
  assert.notEqual(translateText('thank, you', language).text, 'sali');
});

test('structured grammar honors word order, adjective placement and morphology', () => {
  const language = fixedLanguage();
  language.grammar = { order: 'SOV', adjective: 'after', plural: 'en', past: 'ta', future: 'va', negative: 'no', question: 'ka' };
  const result = composeSentence({ subject: 'i', verb: 'eat', object: 'bread', adjective: 'big', tense: 'past', plural: true, negative: true, question: true }, language);
  assert.equal(result.text, 'mi pomaen dor no ta et ka?');
  language.grammar.order = 'VSO';
  language.grammar.adjective = 'before';
  assert.equal(composeSentence({ subject: 'i', verb: 'eat', object: 'bread', adjective: 'big', tense: 'future' }, language).text, 'va et mi dor poma.');
  assert.match(composeSentence({ subject: 'i', verb: 'teleport', object: 'bread' }, language).error, /dictionary/i);
});

test('writing maps longest Unicode tokens while preserving unmapped text', () => {
  const language = starter();
  language.script = { style: 'custom', direction: 'rtl', glyphs: { sh: '☽', s: '⋆', a: '△', é: '◇' } };
  assert.equal(renderWriting('Sha! café 🦉', language), '☽△! c△f◇ 🦉');
  language.script.style = 'latin';
  assert.equal(renderWriting('Sha!', language), 'Sha!');
  language.script.style = 'runes';
  assert.notEqual(renderWriting('hello', language), 'hello');
});

test('writing provenance maps composed Unicode and punctuation to original codepoint ranges', async () => {
  const { renderWritingWithSpans } = await import('../src/engine.js');
  assert.equal(typeof renderWritingWithSpans, 'function');
  const source = 'e\u0301 \u1100\u1161! 🦉';
  const language = { script: { style: 'custom', direction: 'rtl', glyphs: { 'é': '◇', '가!': '𐀀' } } };
  const rendered = renderWritingWithSpans(source, language);
  assert.equal(rendered.text, '◇ 𐀀 🦉');
  assert.equal(renderWriting(source, language), rendered.text);
  assert.deepEqual(rendered.spans, [
    { sourceStart: 0, sourceEnd: 2, start: 0, end: 1 },
    { sourceStart: 2, sourceEnd: 3, start: 1, end: 2 },
    { sourceStart: 3, sourceEnd: 6, start: 2, end: 3 },
    { sourceStart: 6, sourceEnd: 7, start: 3, end: 4 },
    { sourceStart: 7, sourceEnd: 8, start: 4, end: 5 },
  ]);
});

test('sound changes are literal Unicode replacements and honor locks', () => {
  const language = fixedLanguage();
  word(language, 'eat').word = 'shésh';
  word(language, 'eat').locked = false;
  word(language, 'bread').word = 'shé';
  const changed = applySoundChange(language, 'sh', 'ʃ');
  assert.equal(word(changed, 'eat').word, 'ʃéʃ');
  assert.equal(word(changed, 'bread').word, 'shé');
  assert.equal(word(language, 'eat').word, 'shésh');
  assert.throws(() => applySoundChange(language, '', 'x'), /sound|empty|from/i);
});

test('generated names are repeatable and use selected sounds', () => {
  const language = starter();
  language.sounds = { consonants: ['n', 'm'], vowels: ['a', 'u'], patterns: ['CV'], minSyllables: 2, maxSyllables: 3 };
  const names = generateNames(language, 8, 'place');
  assert.equal(names.length, 8);
  assert.equal(new Set(names).size, 8);
  assert.deepEqual(names, generateNames(language, 8, 'place'));
  assert.ok(names.every((name) => /^[NM][anum]+$/u.test(name)));
  assert.notDeepEqual(names, generateNames(language, 8, 'person'));
});

test('validated JSON round trips preserve Unicode, locks and glyphs', () => {
  const language = starter();
  language.name = 'Étoile 𐐀';
  word(language, 'bread').notes = 'café — chosen by me';
  language.script = { style: 'custom', direction: 'rtl', glyphs: { sh: '☽', a: '𐐀' } };
  assert.deepEqual(validateLanguage(JSON.stringify(language)), language);
  const normalized = validateLanguage({ ...language, unexpected: 'discard me' });
  assert.equal(Object.hasOwn(normalized, 'unexpected'), false);
  assert.notEqual(normalized.words, language.words);
});

test('imports reject dangerous keys, duplicate IDs and unreasonable data', () => {
  const language = starter();
  const duplicate = structuredClone(language);
  duplicate.words[1].id = duplicate.words[0].id;
  assert.throws(() => validateLanguage(duplicate), /duplicate|unique/i);
  assert.throws(() => validateLanguage('{"__proto__":{"polluted":true}}'), /unsafe|dangerous|key/i);
  assert.throws(() => validateLanguage({ ...language, version: 99 }), /version/i);
  assert.throws(() => validateLanguage({ ...language, sounds: { ...language.sounds, vowels: [] } }), /vowel/i);
  assert.throws(() => validateLanguage({ ...language, sounds: { ...language.sounds, patterns: ['C{999999}'] } }), /pattern/i);
  assert.throws(() => validateLanguage({ ...language, words: [...language.words, { ...language.words[0], id: 'oversized', english: 'oversized', word: 'x'.repeat(81) }] }), /length|long|80/i);
  assert.throws(() => validateLanguage(' '.repeat(1_000_001)), /large|size|limit/i);
});

test('CSV quotes content and neutralizes spreadsheet formula prefixes', () => {
  const language = starter();
  language.words = [{ id: 'custom', english: '=SUM(1,2)', word: '@payload', pos: 'noun', category: 'Test', locked: true, notes: 'line one\n"line two"' }];
  const csv = exportCSV(language);
  assert.match(csv, /"'=SUM\(1,2\)"/);
  assert.match(csv, /"'@payload"/);
  assert.match(csv, /"line one\n""line two"""/);
});

test('every published scene utterance has explicit dictionary coverage', () => {
  const language = starter();
  const lines = ['One bread, please.', 'This bread is big.', 'I need another bag.', 'How much is this apple?', 'Two coins.', 'It has a leaf.', 'The leaf is free.', 'I will take the leaf.', 'Is the bus late?', 'The bus is coming.', 'You said that before.', 'The rain is on time.', 'All books are quiet.', 'This one has a bell.', 'I will read outside.', 'It needs water.', 'I can wait for water.', 'One ticket to the sea.', 'The train stops here.', 'Very far from here.', 'Then two tickets, please.', 'The stars are bright.', 'And that star?', 'Another window.', 'I hope the moon is real.', 'I need a bottle of sleep.', 'Does it work?', 'The shop is closed.', 'That is a good sign.'];
  for (const line of lines) assert.deepEqual(translateText(line, language).unknown, [], line);
});

test('changed sound inventories regenerate only unlocked entries within their phonotactics', () => {
  const language = starter();
  language.sounds = { consonants: ['ʃ', 'n'], vowels: ['ø', 'a'], patterns: ['CV'], minSyllables: 2, maxSyllables: 3 };
  const changed = regenerateLanguage(language);
  assert.ok(changed.words.filter((entry) => !entry.locked && !entry.family).every((entry) => /^(?:[ʃn][øa]){2,3}$/u.test(entry.word)));
  assert.equal(word(changed, 'books').word, word(changed, 'book').word + changed.grammar.plural);
  assert.equal(word(changed, 'bread').word, 'poma');
  assert.deepEqual(validateLanguage(changed), changed);
});

test('import bounds prevent custom sounds from generating words larger than backup limits', () => {
  const language = starter();
  language.sounds = { consonants: ['abcdefgh'], vowels: ['ijklmnop'], patterns: ['CCV'], minSyllables: 5, maxSyllables: 5 };
  assert.throws(() => validateLanguage(language), /80|long|length/i);
});

test('structured English uses conventional negatives, questions, tense and irregular plurals', () => {
  const language = starter();
  const fixtures = [
    [{ subject: 'i', verb: 'see', object: 'child', plural: true, negative: true }, 'I do not see children.'],
    [{ subject: 'she', verb: 'eat', object: 'bread', question: true }, 'Does she eat bread?'],
    [{ subject: 'we', verb: 'take', object: 'leaf', plural: true, tense: 'past' }, 'We took leaves.'],
    [{ subject: 'you', verb: 'see', object: 'star', tense: 'past', negative: true, question: true }, 'Did you not see a star?'],
    [{ subject: 'he', verb: 'find', object: 'book', tense: 'future', question: true }, 'Will he find a book?'],
    [{ subject: 'i', verb: 'be', adjective: 'happy', negative: true }, 'I am not happy.'],
    [{ subject: 'they', verb: 'be', adjective: 'ready', tense: 'past', question: true }, 'Were they ready?'],
  ];
  for (const [options, english] of fixtures) assert.equal(composeSentence(options, language).english, english);
});
