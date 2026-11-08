import test from 'node:test';
import assert from 'node:assert/strict';
import { createLanguage, validateLanguage } from '../src/engine.js';
import { renameCustomMeaning, deleteCustomWord, setWordsKept, parseSoundWeights, addSavedPhrase, wordReferences, updateWordDetails, serializePortableLanguage } from '../src/language-ui.js';

function fixture() {
  const language = createLanguage({ seed: 'tools-ui' });
  language.words.push({ id: 'custom-kite', english: 'kite', word: 'luma', pos: 'noun', category: 'Custom', notes: '', locked: true });
  return validateLanguage(language);
}

test('renaming a custom meaning updates phrase meaning references without changing IDs or family links', () => {
  const language = fixture();
  language.words.push({ id: 'custom-kites', english: 'kites', word: 'lumaen', pos: 'noun', category: 'Custom', notes: '', locked: false, family: { kind: 'plural', rootId: 'custom-kite' } });
  language.phrases = [{ id: 'phrase-kite', name: 'A kite', options: { subject: 'i', verb: 'see', object: 'kite', adjective: '', tense: 'present', plural: false, negative: false, question: false } }];
  const renamed = renameCustomMeaning(language, 'custom-kite', 'Paper kite');
  assert.equal(renamed.words.find(w => w.id === 'custom-kite').english, 'paper kite');
  assert.equal(renamed.phrases[0].options.object, 'paper kite');
  assert.equal(renamed.words.find(w => w.id === 'custom-kites').family.rootId, 'custom-kite');
  assert.equal(language.words.find(w => w.id === 'custom-kite').english, 'kite');
  assert.throws(() => renameCustomMeaning(language, 'custom-kite', 'moon'), /already exists/i);
  assert.throws(() => renameCustomMeaning(language, 'moon', 'other moon'), /built.in/i);
});

test('deletion rejects built-in and referenced words, preserves originals, and permits an unused custom word', () => {
  const language = fixture();
  assert.throws(() => deleteCustomWord(language, 'moon'), /built.in/i);
  const withPhrase = addSavedPhrase(language, 'Kite flight', { subject: 'i', verb: 'see', object: 'kite', adjective: '', tense: 'present', plural: false, negative: false, question: false }, 'phrase-kite');
  assert.equal(wordReferences(withPhrase, 'custom-kite').length, 1);
  assert.throws(() => deleteCustomWord(withPhrase, 'custom-kite'), /phrase/i);
  const withFamily = structuredClone(language);
  withFamily.words.push({ id: 'custom-kites', english: 'kites', word: 'lumaen', pos: 'noun', category: 'Custom', notes: '', locked: false, family: { kind: 'plural', rootId: 'custom-kite' } });
  assert.throws(() => deleteCustomWord(withFamily, 'custom-kite'), /related/i);
  assert.equal(deleteCustomWord(language, 'custom-kite').words.length, language.words.length - 1);
  assert.ok(language.words.some(w => w.id === 'custom-kite'));
});

test('bulk locks only selected entries and rejects stale selections before altering data', () => {
  const language = fixture();
  const next = setWordsKept(language, ['moon', 'sun'], true);
  assert.equal(next.words.find(w => w.id === 'moon').locked, true);
  assert.equal(next.words.find(w => w.id === 'sun').locked, true);
  assert.equal(language.words.find(w => w.id === 'moon').locked, false);
  assert.throws(() => setWordsKept(language, ['moon', 'missing'], true), /no longer/i);
  assert.throws(() => setWordsKept(language, [], true), /select/i);
});

test('releasing a kept related word resumes the current root and plural ending', () => {
  const language = fixture();
  language.words.push({ id: 'custom-kites', english: 'kites', word: 'kept-form', pos: 'noun', category: 'Custom', notes: '', locked: true, family: { kind: 'plural', rootId: 'custom-kite' } });
  language.grammar.plural = 'ra';
  const released = setWordsKept(language, ['custom-kites'], false);
  assert.equal(released.words.find(word => word.id === 'custom-kites').word, 'lumara');
  assert.equal(language.words.find(word => word.id === 'custom-kites').word, 'kept-form');
});

test('sound weights reject malformed, duplicate, zero and unsafe keys', () => {
  assert.deepEqual(parseSoundWeights('m=3 a=1.5\nsh=2'), { m: 3, a: 1.5, sh: 2 });
  for (const text of ['m=no', 'm=0', 'm=101', 'm=2 m=3', '__proto__=1', 'constructor=1', 'm:2']) assert.throws(() => parseSoundWeights(text));
  assert.deepEqual(parseSoundWeights(''), {});
});

test('saved phrases store stable IDs, are bounded and do not mutate the source', () => {
  const language = fixture();
  const saved = addSavedPhrase(language, 'Moon greeting', { subject: 'i', verb: 'see', object: 'moon', adjective: 'big', tense: 'present', plural: false, negative: false, question: true }, 'phrase-greeting');
  assert.equal(saved.phrases.at(-1).options.object, 'moon');
  assert.equal(language.phrases.length, 0);
  assert.throws(() => addSavedPhrase(language, '', { subject: 'i', verb: 'see' }), /name/i);
  assert.throws(() => addSavedPhrase(language, 'Unknown', { subject: 'i', verb: 'see', object: 'not a word' }), /dictionary/i);
  const customPhrase = addSavedPhrase(language, 'Kite', { subject: 'i', verb: 'see', object: 'kite' }, 'phrase-custom');
  assert.equal(customPhrase.phrases[0].options.object, 'custom-kite');
  assert.equal(renameCustomMeaning(customPhrase, 'custom-kite', 'flying kite').phrases[0].options.object, 'custom-kite');
  const full = structuredClone(language);
  full.phrases = Array.from({ length: 50 }, (_, index) => ({ ...saved.phrases[0], id: `phrase-${index}` }));
  assert.throws(() => addSavedPhrase(full, 'Another', { subject: 'i', verb: 'see' }), /50/i);
});

test('metadata edits preserve family and keep status while spelling edits make an independent kept word', () => {
  const language = fixture(), books = language.words.find(word => word.id === 'books');
  const metadata = updateWordDetails(language, books.id, { notes: 'A group of books', category: 'Reading' });
  const edited = metadata.words.find(word => word.id === 'books');
  assert.deepEqual(edited.family, books.family);
  assert.equal(edited.locked, false);
  const manual = updateWordDetails(metadata, books.id, { word: 'chosen-form', notes: 'My spelling' });
  assert.equal(manual.words.find(word => word.id === 'books').family, undefined);
  assert.equal(manual.words.find(word => word.id === 'books').locked, true);
  assert.deepEqual(language.words.find(word => word.id === 'books'), books);
  const kept = setWordsKept(language, ['books'], true);
  assert.equal(updateWordDetails(kept, 'books', { notes: 'Still kept' }).words.find(word => word.id === 'books').locked, true);
});

test('portable language backups use compact UTF-8 bounded JSON and preserve large dictionaries', () => {
  const language = fixture();
  language.words.push(...Array.from({ length: 1450 }, (_, index) => ({ id: `custom-${index}`, english: `extra ${index}`, word: 'na', pos: 'noun', category: 'Custom', notes: 'n'.repeat(500), locked: true })));
  assert.ok(new TextEncoder().encode(JSON.stringify(language, null, 2)).byteLength > 1_000_000);
  const serialized = serializePortableLanguage(language);
  assert.ok(new TextEncoder().encode(serialized).byteLength < 1_000_000);
  assert.deepEqual(validateLanguage(serialized), validateLanguage(language));
  for (const word of language.words.slice(-1450)) word.notes = '界'.repeat(500);
  assert.throws(() => serializePortableLanguage(language), /1 MB|UTF-8/i);
});
