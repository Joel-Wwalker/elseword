import test from 'node:test';
import assert from 'node:assert/strict';
import { createLanguage, validateLanguage, generateWord, regenerateLanguage, translateText, composeSentence, exportCSV } from '../src/engine.js';

const starter = () => createLanguage({ seed: 'language-tools-test' });
const find = (language, english) => language.words.find((entry) => entry.english === english);
const compact = () => ({ ...starter(), words: [
  { id: 'book', english: 'book', word: 'mala', pos: 'noun', category: 'Custom', locked: false, notes: '' },
  { id: 'books', english: 'books', word: 'old', pos: 'noun', category: 'Custom', locked: false, notes: '', family: { rootId: 'book', kind: 'plural' } },
  { id: 'sun', english: 'sun', word: 'sena', pos: 'noun', category: 'Custom', locked: false, notes: '' },
] });

test('version 1 imports upgrade without changing old dictionary spellings or inventing links', () => {
  const old = starter(); old.version = 1;
  old.words.forEach((entry) => { delete entry.family; });
  find(old, 'books').word = 'legacy';
  const next = validateLanguage(old);
  assert.equal(next.version, 2);
  assert.deepEqual(next.words, old.words);
  assert.deepEqual(next.phrases, []);
  next.words[0].word = 'detached';
  assert.notEqual(next.words[0].word, old.words[0].word);
});

test('new languages link common forms while preserving kept starter words', () => {
  const language = starter();
  assert.deepEqual(find(language, 'books').family, { rootId: 'book', kind: 'plural' });
  assert.equal(find(language, 'books').word, find(language, 'book').word + language.grammar.plural);
  assert.equal(find(language, 'is').word, find(language, 'be').word);
  assert.equal(find(language, 'bread').word, 'poma');
});

test('linked forms follow changed roots and markers but a kept linked form stays fixed', () => {
  const language = compact();
  language.grammar.plural = 'um';
  assert.equal(find(validateLanguage(language), 'books').word, 'malaum');
  language.words[0].word = 'tora';
  assert.equal(find(validateLanguage(language), 'books').word, 'toraum');
  language.words[1].locked = true;
  assert.equal(find(validateLanguage(language), 'books').word, 'old');
  language.words[1].locked = false;
  assert.equal(find(regenerateLanguage(language), 'books').word, find(regenerateLanguage(language), 'book').word + 'um');
});

test('family validation rejects missing roots, compound omissions, cycles and oversized derivations', () => {
  const missing = compact(); missing.words[1].family.rootId = 'absent';
  assert.throws(() => validateLanguage(missing), /root|reference|missing/i);
  const cycle = compact(); cycle.words[0].family = { rootId: 'books', kind: 'alias' };
  assert.throws(() => validateLanguage(cycle), /cycle|circular/i);
  const compound = compact(); compound.words[1].family.kind = 'compound';
  assert.throws(() => validateLanguage(compound), /other|compound/i);
  const long = compact(); long.words[0].word = 'a'.repeat(80);
  assert.throws(() => validateLanguage(long), /long|80/i);
});

test('saved phrase structures validate references and remain detached', () => {
  const language = starter();
  language.phrases = [{ id: 'greeting', name: 'Ask for books', options: { subject: 'i', verb: 'want', object: 'book', plural: true, question: true } }];
  const next = validateLanguage(language);
  assert.ok(Array.isArray(next.phrases));
  assert.equal(next.phrases[0].options.tense, 'present');
  assert.equal(next.phrases[0].options.negative, false);
  assert.match(composeSentence(next.phrases[0].options, next).text, /\?$/);
  language.phrases[0].options.object = 'missing';
  assert.throws(() => validateLanguage(language), /phrase|reference|missing/i);
  assert.throws(() => validateLanguage({ ...next, phrases: Array(51).fill(next.phrases[0]) }), /50|phrase/i);
});

test('empty advanced rules preserve legacy seeded generation', () => {
  const language = starter();
  const before = generateWord(language, 'stable');
  const regenerated = regenerateLanguage(language);
  language.sounds.rules = { initial: [], final: [], forbidden: [], weights: {} };
  assert.equal(generateWord(language, 'stable'), before);
  assert.deepEqual(regenerateLanguage(language).words, regenerated.words);
});

test('a one-form constrained dictionary accepts valid homonyms within a deterministic generation work bound', () => {
  const language = starter();
  language.sounds = { consonants: ['m', 'n'], vowels: ['a', 'e'], patterns: ['CV'], minSyllables: 3, maxSyllables: 3,
    rules: { initial: ['mamama'], final: [], forbidden: [], weights: {} } };
  language.words = Array.from({ length: 2000 }, (_, index) => ({ id: `item-${index}`, english: `item ${index}`, word: 'old', pos: 'noun', category: 'Custom', locked: false, notes: '' }));
  // Count actual hash/random arithmetic, preserving every numeric result. A time
  // threshold would depend on the host; this bound catches excessive retry work.
  const multiply = Math.imul, workLimit = 20_000_000;
  let work = 0, next;
  Math.imul = (a, b) => {
    if (++work > workLimit) throw new Error('Generation exceeded its deterministic work bound.');
    return multiply(a, b);
  };
  try { next = regenerateLanguage(language); } finally { Math.imul = multiply; }
  assert.equal(next.words.length, 2000);
  assert.ok(next.words.every(entry => entry.word === 'mamama'));
  assert.ok(language.words.every(entry => entry.word === 'old'));
  assert.ok(work < workLimit);
});

test('sound rules constrain every generated word and reject impossible constraints before commit', () => {
  const language = starter();
  language.sounds = { consonants: ['m', 'n'], vowels: ['a', 'e'], patterns: ['CVC'], minSyllables: 1, maxSyllables: 2,
    rules: { initial: ['m'], final: ['n'], forbidden: ['ae'], weights: { m: 8, e: 0.5 } } };
  const normalized = validateLanguage(language);
  for (let i = 0; i < 100; i++) assert.match(generateWord(normalized, `word${i}`), /^m.*n$/u);
  language.sounds.rules.initial = ['z'];
  assert.throws(() => validateLanguage(language), /rules|restrictions|matching|constraints/i);
  language.sounds.rules.initial = ['m']; language.sounds.rules.weights.m = 0;
  assert.throws(() => validateLanguage(language), /weight/i);
});

const tools = await import('../src/language-tools.js').catch((error) => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return {};
});
const requireTool = (name) => { assert.equal(typeof tools[name], 'function', `${name} must be implemented`); return tools[name]; };

test('CSV preview handles escaped quotes, multiline notes, duplicate meanings and generated forms', () => {
  const parse = requireTool('parseDictionaryCSV');
  const language = compact();
  const preview = parse('english,word,pos,notes\r\nmoon,luna,noun,"first line\n""quoted"""\r\nbook,replacement,noun,ignored\r\nmoon,other,noun,duplicate\r\ncloud,,noun,generated', language);
  assert.equal(preview.errors.length, 0);
  assert.equal(preview.duplicates.length, 2);
  assert.equal(preview.duplicates[0].existingId, 'book');
  assert.equal(preview.rows.length, 2);
  assert.equal(preview.rows[0].notes, 'first line\n"quoted"');
  assert.equal(preview.rows[0].locked, true);
  assert.equal(preview.rows[1].locked, false);
  assert.ok(preview.rows[1].word);
  const next = requireTool('importDictionaryCSV')(language, preview);
  assert.equal(find(next, 'book').word, 'mala');
  assert.equal(find(next, 'moon').word, 'luna');
  assert.equal(next.words.length, 5);
  assert.equal(language.words.length, 3);
});

test('CSV rejects malformed quoting and oversized rows without partially importing', () => {
  const parse = requireTool('parseDictionaryCSV');
  const language = compact();
  for (const csv of ['english,word\nmoon,"unfinished', 'english,word\nmoon,"luna"garbage', `english,word\nmoon,${'x'.repeat(81)}`, 'english,word,locked\nmoon,luna,perhaps']) {
    const preview = parse(csv, language);
    assert.ok(preview.errors.length > 0, csv);
    assert.throws(() => requireTool('importDictionaryCSV')(language, preview), /CSV|preview|errors/i);
  }
  assert.ok(parse('x'.repeat(1_000_001), language).errors.length > 0);
});

test('CSV export and import preserve dangerous text as text and exported formulas stay neutralized', () => {
  const parse = requireTool('parseDictionaryCSV');
  const language = compact();
  language.words = [{ id: 'formula', english: '=sum(1,2)', word: '@payload', pos: 'noun', category: 'Custom', locked: true, notes: 'line\n"quote"' }];
  const preview = parse(exportCSV(language), { ...language, words: [] });
  assert.deepEqual(preview.errors, []);
  assert.equal(preview.rows[0].english, '=sum(1,2)');
  assert.equal(preview.rows[0].word, '@payload');
  const imported = requireTool('importDictionaryCSV')({ ...language, words: [] }, preview);
  assert.match(exportCSV(imported), /"'@payload"/);
});

test('explicit inflection linking preserves kept spellings and uses a detached document', () => {
  const language = starter();
  for (const entry of language.words) delete entry.family;
  find(language, 'books').locked = true; find(language, 'books').word = 'chosen';
  find(language, 'tickets').word = 'unrelated';
  const next = requireTool('linkInflections')(language);
  assert.equal(find(next, 'books').word, 'chosen');
  assert.equal(find(next, 'books').family, undefined);
  assert.equal(find(next, 'tickets').word, find(next, 'ticket').word + next.grammar.plural);
  assert.equal(find(language, 'tickets').word, 'unrelated');
});

test('derivations support compounds and aliases and reject duplicate meanings', () => {
  const derive = requireTool('deriveWord');
  const language = compact();
  const compound = derive(language, { rootId: 'book', otherRootId: 'sun', kind: 'compound', english: 'sunbook' });
  assert.equal(find(compound, 'sunbook').word, 'malasena');
  assert.deepEqual(find(compound, 'sunbook').family, { rootId: 'book', kind: 'compound', otherRootId: 'sun' });
  const alias = derive(compound, { rootId: find(compound, 'sunbook').id, kind: 'alias', english: 'story' });
  assert.equal(find(alias, 'story').word, 'malasena');
  assert.throws(() => derive(language, { rootId: 'book', kind: 'alias', english: 'sun' }), /duplicate|exists/i);
  assert.throws(() => derive(language, { rootId: 'missing', kind: 'alias', english: 'new' }), /root|missing/i);
});

test('conditional sound previews match commits, preserve kept forms and recompute families', () => {
  const preview = requireTool('previewSoundChange');
  const language = compact();
  language.words[0].word = 'mama'; language.words[2].word = 'mama'; language.words[2].locked = true;
  for (const [condition, expected] of [['anywhere', 'nana'], ['start', 'nama'], ['end', 'mama'], ['between-vowels', 'mana']]) {
    const before = JSON.stringify(language);
    const result = preview(language, 'm', 'n', condition);
    const next = requireTool('changeSounds')(language, 'm', 'n', condition);
    assert.equal(find(next, 'book').word, expected);
    assert.equal(find(next, 'books').word, expected + language.grammar.plural);
    assert.equal(find(next, 'sun').word, 'mama');
    assert.equal(JSON.stringify(language), before);
    for (const change of result.changes) assert.equal(next.words.find((entry) => entry.id === change.id).word, change.after);
  }
  assert.throws(() => preview(language, 'm', 'n', 'regex'), /condition/i);
  assert.throws(() => preview(language, 'mama', '', 'anywhere'), /empty/i);
});

test('between-vowel changes recognize multi-character Unicode vowel tokens', () => {
  const language = compact();
  language.sounds.vowels = ['aɪ', 'ø']; language.words[0].word = 'aɪtø';
  const result = requireTool('changeSounds')(language, 't', 'd', 'between-vowels');
  assert.equal(find(result, 'book').word, 'aɪdø');
});

test('printable reference escapes imported text and includes grammar, phrases and writing', () => {
  const language = starter();
  language.name = '<img src=x onerror=alert(1)>';
  find(language, 'book').notes = '<script>alert(1)</script>';
  language.phrases = [{ id: 'ask', name: 'Read & learn', options: { subject: 'i', verb: 'read', object: 'book' } }];
  const html = requireTool('languageReferenceHTML')(language);
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /@media print/);
  assert.match(html, /&lt;img/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script|<img\s/i);
  assert.match(html, /Read &amp; learn/);
  assert.match(html, /SVO/);
  assert.match(html, /Dictionary/);
});
