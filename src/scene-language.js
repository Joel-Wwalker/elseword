import { generateWord } from './engine.js';
import { SCENE_VOCAB_ADDITIONS } from './vocabulary.js';

const DEFAULT_GRAMMAR = Object.freeze({ order: 'SVO', adjective: 'before', plural: 'en', past: 'ta', future: 'va', negative: 'no', question: 'ka' });
// Keep the same bounds as the version-1 import format in engine.js.
const MAX_WORDS = 2000;
const MAX_JSON = 1_000_000;
const MAX_BACKUP_BYTES = 1_000_000;
const utf8 = new TextEncoder();
const keyFor = value => String(value ?? '').normalize('NFC').trim().toLocaleLowerCase('en-US').replace(/\s+/gu, ' ');
const length = text => [...text].length;
const literal = (text = '') => ({ text, tokens: [] });
const token = (text, source) => ({ text, tokens: text ? [{ ...source, text, start: 0, end: length(text) }] : [] });

// Keep offsets beside the authored words while rearranging constituents. This
// avoids guessing a meaning from a generated spelling (which may be a homonym).
function join(parts, separator = ' ') {
  const present = parts.filter(part => part?.text);
  let text = '', offset = 0;
  const tokens = [];
  present.forEach((part, index) => {
    if (index) { text += separator; offset += length(separator); }
    tokens.push(...part.tokens.map(item => ({ ...item, start: item.start + offset, end: item.end + offset })));
    text += part.text;
    offset += length(part.text);
  });
  return { text, tokens };
}

function withSuffix(part, marker, text) {
  if (!text) return part;
  const end = length(part.text);
  const last = part.tokens.at(-1);
  if (last?.kind === 'word' && last.end === end) {
    return { text: part.text + text, tokens: [...part.tokens.slice(0, -1), {
      ...last, text: last.text + text, end: end + length(text),
      suffixes: [...(last.suffixes ?? []), { marker, text }],
    }] };
  }
  return join([part, token(text, { kind: 'marker', marker })], '');
}

/**
 * Authored syntax only: strings are exact dictionary keys, nouns have a head,
 * determiner/adjectives/plural/modifiers, clauses have S/V/O slots and markers,
 * and sequences/fragments retain their explicit phrase order. A clause can be
 * nested as another clause's object. English prose is never parsed or inferred.
 */
function renderNode(node, grammar, lookup) {
  if (!node) return literal();
  if (typeof node === 'string') return lookup(node);
  if (node.type === 'noun') {
    const head = withSuffix(renderNode(node.head, grammar, lookup), 'plural', node.plural ? grammar.plural : '');
    const adjectives = (node.adjectives ?? []).map(item => renderNode(item, grammar, lookup));
    const noun = grammar.adjective === 'after' ? [head, ...adjectives] : [...adjectives, head];
    return join([renderNode(node.determiner, grammar, lookup), ...noun, ...(node.modifiers ?? []).map(item => renderNode(item, grammar, lookup))]);
  }
  if (node.type === 'sequence' || node.type === 'fragment') {
    return join((node.items ?? []).map(item => renderNode(item, grammar, lookup)), node.separator ?? ' ');
  }
  if (node.type === 'clause') {
    const tense = token(node.tense === 'past' ? grammar.past : node.tense === 'future' ? grammar.future : '', { kind: 'marker', marker: node.tense });
    const slots = {
      S: renderNode(node.subject, grammar, lookup),
      V: join([token(node.negative ? grammar.negative : '', { kind: 'marker', marker: 'negative' }), tense, renderNode(node.modal, grammar, lookup), renderNode(node.verb, grammar, lookup)]),
      O: renderNode(node.object, grammar, lookup),
    };
    return join([
      renderNode(node.front, grammar, lookup),
      ...Array.from(grammar.order).map(slot => slots[slot]),
      renderNode(node.tail, grammar, lookup),
      token(node.question ? grammar.question : '', { kind: 'marker', marker: 'question' }),
    ]);
  }
  throw new Error(`Unsupported scene syntax node: ${node.type}.`);
}

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
