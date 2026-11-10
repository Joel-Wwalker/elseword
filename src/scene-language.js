import { generateWord, renderWritingWithSpans } from './engine.js';
import { literal, token, join, renderNode } from './sentence-syntax.js';
import { SCENE_VOCAB_ADDITIONS } from './vocabulary.js';

const DEFAULT_GRAMMAR = Object.freeze({ order: 'SVO', adjective: 'before', plural: 'en', past: 'ta', future: 'va', negative: 'no', question: 'ka' });
// Keep the same bounds as the version-1 import format in engine.js.
const MAX_WORDS = 2000;
const MAX_JSON = 1_000_000;
const MAX_BACKUP_BYTES = 1_000_000;
const utf8 = new TextEncoder();
const keyFor = value => String(value ?? '').normalize('NFC').trim().toLocaleLowerCase('en-US').replace(/\s+/gu, ' ');

function syntaxFor(line) {
  if (!Array.isArray(line?.syntax) || !line.syntax.length) throw new Error('Scene lines require explicitly authored syntax.');
  return line.syntax;
}

/** Lexical keys actually rendered, for the context word editors. */
export function getSceneLineWords(line) {
  const words = new Set();
  for (const sentence of syntaxFor(line)) {
    renderNode(sentence, DEFAULT_GRAMMAR, key => { words.add(keyFor(key)); return literal(key); });
  }
  return [...words];
}

export function renderSceneLine(line, language) {
  const grammar = { ...DEFAULT_GRAMMAR, ...(language?.grammar ?? {}) };
  const dictionary = new Map((language?.words ?? []).map(entry => [keyFor(entry.english), entry]));
  const unknown = new Set();
  const lookup = key => {
    const normalized = keyFor(key);
    if (dictionary.has(normalized)) {
      const entry = dictionary.get(normalized);
      return token(entry.word, { kind: 'word', key: normalized, wordId: entry.id });
    }
    unknown.add(normalized);
    return token(`⟦${normalized}⟧`, { kind: 'word', key: normalized });
  };
  const rendered = join(syntaxFor(line).map(sentence => {
    const body = renderNode(sentence, grammar, lookup);
    // A question fragment still receives the user's question marker, while
    // clause questions already received it after their reordered constituents.
    const question = token(sentence.question && sentence.type !== 'clause' ? grammar.question : '', { kind: 'marker', marker: 'question' });
    return join([join([body, question]), literal(sentence.punctuation ?? (sentence.question ? '?' : '.'))], '');
  }));
  return { ...rendered, english: line.english, unknown: [...unknown] };
}

/** Apply the alphabet while keeping clickable words attached to their source entries. */
export function renderWrittenSceneLine(line, language) {
  const translated = renderSceneLine(line, language);
  const { text, spans } = renderWritingWithSpans(translated.text, language);
  const letters = [...text];
  const tokens = [];
  let previousOwner;
  for (const span of spans) {
    const owners = translated.tokens.filter(token => token.start < span.sourceEnd && token.end > span.sourceStart);
    // A glyph may consume punctuation beside a word. A glyph shared by two
    // words has no single inspection target, so keep that segment plain text.
    if (owners.length !== 1 || span.end <= span.start) { previousOwner = undefined; continue; }
    const owner = owners[0];
    const piece = letters.slice(span.start, span.end).join('');
    const previous = tokens.at(-1);
    if (previousOwner === owner && previous?.end === span.start) {
      previous.end = span.end;
      previous.text += piece;
    } else tokens.push({ ...owner, start: span.start, end: span.end, text: piece });
    previousOwner = owner;
  }
  return { ...translated, text, tokens };
}

/**
 * Add only this release's new vocabulary to an already validated language.
 * Existing words (including IDs, spellings, locks, notes and extra metadata)
 * are retained verbatim. A full dictionary remains full and renders unknowns.
 */
export function ensureSceneVocabulary(language) {
  const words = [...language.words];
  const english = new Set(words.map(entry => keyFor(entry.english)));
  const ids = new Set(words.map(entry => entry.id));
  const used = new Set(words.map(entry => keyFor(entry.word)));
  for (const entry of SCENE_VOCAB_ADDITIONS) {
    if (words.length >= MAX_WORDS) break;
    if (english.has(keyFor(entry.english))) continue;
    let id = entry.id;
    for (let suffix = 1; ids.has(id); suffix++) id = `scene-${entry.id}${suffix === 1 ? '' : `-${suffix}`}`;
    let word;
    for (let attempt = 0; attempt < 300; attempt++) {
      word = generateWord(language, entry.english, `${language.revision ?? 0}:${attempt}`);
      if (!used.has(keyFor(word))) break;
      word = undefined;
    }
    // Like the main generator, allow honest homonyms if the sound inventory
    // cannot supply enough forms; never alter a user's existing vocabulary.
    word ??= generateWord(language, entry.english, `${language.revision ?? 0}:homonym`);
    const added = { ...entry, id, word, locked: false, notes: '' };
    const candidate = { ...language, words: [...words, added] };
    if (JSON.stringify(candidate).length > MAX_JSON) break;
    // The app exports indented UTF-8 JSON and limits imported files by bytes.
    // Unicode notes can fit the engine's character bound but exceed that cap.
    if (utf8.encode(JSON.stringify(candidate, null, 2)).byteLength > MAX_BACKUP_BYTES) break;
    words.push(added);
    english.add(keyFor(entry.english));
    ids.add(id);
    used.add(keyFor(word));
  }
  return words.length === language.words.length ? language : { ...language, words };
}
