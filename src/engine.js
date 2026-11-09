import { CORE_VOCAB } from './vocabulary.js';
import { RUNE_GLYPHS } from './writing-presets.js';
import { clauseFromSelections, clauseSyntax, englishSentence, entryFor, pluralEntry } from './sentence-grammar.js';
import { literal, token, join, renderNode } from './sentence-syntax.js';
export { CORE_VOCAB };

const preset = (id, name, description, consonants, vowels, patterns, minSyllables = 1, maxSyllables = 3) => Object.freeze({
  id, name, description, sounds: Object.freeze({ consonants: Object.freeze(consonants.split(' ')), vowels: Object.freeze(vowels.split(' ')), patterns: Object.freeze(patterns.split(' ')), minSyllables, maxSyllables }),
});

export const PRESETS = Object.freeze([
  preset('soft', 'Soft', 'Open vowels and gentle, flowing consonants.', 'm n l r p s v', 'a e i o u', 'CV V', 2, 3),
  preset('crisp', 'Crisp', 'Short, clear syllables with sharp endings.', 'p t k b d g s z ch', 'a e i o', 'CVC CV VC', 1, 2),
  preset('earthy', 'Earthy', 'Low vowels, warm nasals and rolling sounds.', 'm n ng r l d g h w', 'a o u ə', 'CV CVC VC', 1, 3),
  preset('strange', 'Strange', 'Unfamiliar clusters and a wider vowel palette.', 'q x zh sh th v z ʔ', 'a i y ø æ', 'CCV CVC V', 1, 3),
]);

const DEFAULT_GRAMMAR = Object.freeze({ order: 'SVO', adjective: 'before', plural: 'en', past: 'ta', future: 'va', negative: 'no', question: 'ka' });
const DEFAULT_SCRIPT = Object.freeze({ style: 'latin', direction: 'ltr', glyphs: {} });
const VALID_PATTERNS = new Set(['CV', 'CVC', 'V', 'VC', 'CCV']);
const BAD_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const MAX_JSON = 1_000_000;
const MAX_WORDS = 2000;
const COMMON_PLURALS = Object.freeze({ books: 'book', tickets: 'ticket', coins: 'coin', stars: 'star', children: 'child', people: 'person', leaves: 'leaf' });
const COMMON_ALIASES = Object.freeze({ is: 'be', are: 'be', am: 'be', has: 'have', needs: 'need', coming: 'come', said: 'say', stops: 'stop', does: 'do', asked: 'ask' });
const soundWitnesses = new Map();
const clone = (value) => structuredClone(value);
const normalizeKey = (value) => String(value ?? '').normalize('NFC').trim().toLocaleLowerCase('en-US').replace(/\s+/gu, ' ');
const charLength = (value) => Array.from(value).length;

function hash(value) {
  let result = 2166136261;
  for (const point of String(value)) {
    result ^= point.codePointAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function randomFor(value) {
  let state = hash(value);
  return () => {
    state += 0x6D2B79F5;
    let n = state;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

function textField(value, label, max, { fallback = '', empty = true, multiline = false } = {}) {
  const text = (value === undefined ? fallback : value);
  if (typeof text !== 'string') throw new Error(`${label} must be text.`);
  const normalized = text.normalize('NFC').trim();
  if (!empty && !normalized) throw new Error(`${label} cannot be empty.`);
  if (charLength(normalized) > max) throw new Error(`${label} is too long (maximum ${max} characters).`);
  const controls = multiline ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u : /[\u0000-\u001F\u007F]/u;
  if (controls.test(normalized)) throw new Error(`${label} contains control characters.`);
  return normalized;
}

function inventory(value, label, fallback) {
  const input = value === undefined ? fallback : value;
  if (!Array.isArray(input) || input.length > 40) throw new Error(`${label} must be an array of at most 40 sounds.`);
  return [...new Set(input.map((sound) => {
    const value = textField(sound, label, 8, { empty: false });
    if (!/^[\p{L}\p{M}'’]+$/u.test(value)) throw new Error(`${label} may contain letters and phonetic symbols only.`);
    return value;
  }))];
}

function normalizeSounds(value, fallback = PRESETS[0].sounds) {
  const source = value ?? fallback;
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('Sounds must be an object.');
  const consonants = inventory(source.consonants, 'Consonants', fallback.consonants);
  const vowels = inventory(source.vowels, 'Vowels', fallback.vowels);
  if (!vowels.length) throw new Error('At least one vowel is required.');
  const rawPatterns = source.patterns ?? fallback.patterns;
  if (!Array.isArray(rawPatterns) || !rawPatterns.length || rawPatterns.length > 20 || rawPatterns.some((pattern) => !VALID_PATTERNS.has(pattern))) throw new Error('Choose syllable patterns from CV, CVC, V, VC and CCV.');
  const patterns = [...new Set(rawPatterns)];
  if (patterns.some((pattern) => pattern.includes('C')) && !consonants.length) throw new Error('These syllable patterns need at least one consonant.');
  const minSyllables = source.minSyllables ?? fallback.minSyllables;
  const maxSyllables = source.maxSyllables ?? fallback.maxSyllables;
  if (!Number.isInteger(minSyllables) || !Number.isInteger(maxSyllables) || minSyllables < 1 || maxSyllables > 5 || maxSyllables < minSyllables) throw new Error('Syllable counts must be integers between 1 and 5, with minimum no greater than maximum.');
  const longestConsonant = Math.max(0, ...consonants.map(charLength));
  const longestVowel = Math.max(...vowels.map(charLength));
  const longestSyllable = Math.max(...patterns.map((pattern) => Array.from(pattern).reduce((total, slot) => total + (slot === 'C' ? longestConsonant : longestVowel), 0)));
  if (longestSyllable * maxSyllables > 80) throw new Error('These sounds and syllable counts can create words longer than 80 characters.');
  const normalized = { consonants, vowels, patterns, minSyllables, maxSyllables };
  if (source.rules !== undefined) {
    const rules = source.rules;
    if (!rules || typeof rules !== 'object' || Array.isArray(rules)) throw new Error('Sound rules must be an object.');
    const result = {};
    for (const name of ['initial', 'final', 'forbidden']) {
      const list = rules[name] ?? [];
      if (!Array.isArray(list) || list.length > 40) throw new Error(`${name} rules must contain at most 40 sequences.`);
      result[name] = [...new Set(list.map((item) => {
        const text = textField(item, `${name} rule`, 16, { empty: false });
        if (!/^[\p{L}\p{M}'’]+$/u.test(text)) throw new Error('Sound rules may contain letters and phonetic symbols only.');
        return text;
      }))];
    }
    const weights = rules.weights ?? {};
    if (!weights || typeof weights !== 'object' || Array.isArray(weights) || Object.keys(weights).length > 80) throw new Error('Sound weights must be a map of at most 80 entries.');
    result.weights = {};
    for (const [key, weight] of Object.entries(weights)) {
      if (BAD_KEYS.has(key) || ![...consonants, ...vowels].includes(key)) throw new Error('Each weighted sound must belong to the sound inventory.');
      if (typeof weight !== 'number' || !Number.isFinite(weight) || weight <= 0 || weight > 100) throw new Error('Sound weights must be numbers greater than 0 and at most 100.');
      result.weights[key] = weight;
    }
    normalized.rules = result;
  }
  return normalized;
}

/** Explicitly link only known forms. Kept entries and existing families are untouched. */
export function linkCommonInflections(language) {
  const byEnglish = new Map(language.words.map((entry) => [entry.english, entry]));
  for (const [kind, forms] of [['plural', COMMON_PLURALS], ['alias', COMMON_ALIASES]]) {
    for (const [english, root] of Object.entries(forms)) {
      const entry = byEnglish.get(english);
      const base = byEnglish.get(root);
      if (entry && base && !entry.locked && !entry.family) entry.family = { rootId: base.id, kind };
    }
  }
  return language;
}

function resolveFamilies(words, grammar) {
  const byId = new Map(words.map((entry) => [entry.id, entry]));
  const done = new Set();
  const active = new Set();
  const resolve = (entry) => {
    if (done.has(entry.id)) return entry.word;
    if (active.has(entry.id)) throw new Error('Word family contains a cycle.');
    active.add(entry.id);
    if (entry.family) {
      const { rootId, kind, otherRootId } = entry.family;
      const root = byId.get(rootId);
      if (!root) throw new Error(`Missing family root: ${rootId}.`);
      const first = resolve(root);
      let second = '';
      if (kind === 'compound') {
        const other = byId.get(otherRootId);
        if (!other) throw new Error(`Missing compound root: ${otherRootId}.`);
        second = resolve(other);
      }
      // Kept links still validate their references, but retain the chosen spelling.
      if (!entry.locked) entry.word = textField(first + (kind === 'plural' ? grammar.plural : second), 'Derived word', 80, { empty: false });
    }
    active.delete(entry.id);
    done.add(entry.id);
    return entry.word;
  };
  words.forEach(resolve);
  return words;
}

function grammarFor(language) {
  return { ...DEFAULT_GRAMMAR, ...(language?.grammar ?? {}) };
}

function ensureSafeTree(value, depth = 0, budget = { nodes: 0 }, seen = new WeakSet()) {
  if (depth > 12 || ++budget.nodes > 50000) throw new Error('Import exceeds the supported size or nesting limit.');
  if (value === null || typeof value !== 'object') return;
  if (seen.has(value)) throw new Error('Import must not contain circular references.');
  seen.add(value);
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) throw new Error('Import contains an unsafe object.');
  for (const key of Object.keys(value)) {
    if (BAD_KEYS.has(key)) throw new Error(`Unsafe import key: ${key}.`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor.get || descriptor.set) throw new Error('Import may not contain executable properties.');
    ensureSafeTree(value[key], depth + 1, budget, seen);
  }
  seen.delete(value);
}

/** Returns a normalized, detached version-2 backup. Version-1 spellings are preserved. */
export function validateLanguage(value) {
  if (typeof value === 'string') {
    if (value.length > MAX_JSON) throw new Error('Import is too large (maximum 1 MB).');
    try { value = JSON.parse(value); } catch { throw new Error('Import is not valid JSON.'); }
  }
  ensureSafeTree(value);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Import must contain a language object.');
  if (JSON.stringify(value).length > MAX_JSON) throw new Error('Import is too large (maximum 1 MB).');
  if (![1, 2].includes(value.version)) throw new Error('Unsupported language version; expected version 1 or 2.');
  if (!Array.isArray(value.words) || value.words.length > MAX_WORDS) throw new Error(`Words must be an array of at most ${MAX_WORDS} entries.`);
  const selected = PRESETS.find((entry) => entry.id === value.preset) ?? PRESETS[0];
  const seed = textField(typeof value.seed === 'number' && Number.isFinite(value.seed) ? String(value.seed) : value.seed, 'Seed', 128, { fallback: 'luma', empty: false });
  const name = textField(value.name, 'Language name', 60, { fallback: 'Luma', empty: false });
  const id = textField(value.id, 'Language ID', 80, { fallback: `lang-${hash(`${seed}|${name}`).toString(36)}`, empty: false });
  if (!/^[a-zA-Z0-9][\w-]*$/u.test(id)) throw new Error('Language ID may contain only letters, numbers, underscores and hyphens.');
  const sounds = normalizeSounds(value.sounds, selected.sounds);
  if (sounds.rules) soundWitness(sounds);
  const rawGrammar = value.grammar ?? {};
  if (typeof rawGrammar !== 'object' || Array.isArray(rawGrammar)) throw new Error('Grammar must be an object.');
  const order = rawGrammar.order ?? DEFAULT_GRAMMAR.order;
  if (!['SVO', 'SOV', 'VSO', 'VOS', 'OSV', 'OVS'].includes(order)) throw new Error('Choose a valid subject, verb and object order.');
  const adjective = rawGrammar.adjective ?? 'before';
  if (!['before', 'after'].includes(adjective)) throw new Error('Adjective position must be before or after.');
  const grammar = { order, adjective };
  for (const key of ['plural', 'past', 'future', 'negative', 'question']) grammar[key] = textField(rawGrammar[key], `${key} marker`, 20, { fallback: DEFAULT_GRAMMAR[key] });
  const rawScript = value.script ?? DEFAULT_SCRIPT;
  if (!rawScript || typeof rawScript !== 'object' || Array.isArray(rawScript)) throw new Error('Writing system must be an object.');
  const style = rawScript.style ?? 'latin';
  const direction = rawScript.direction ?? 'ltr';
  if (!['latin', 'runes', 'custom'].includes(style)) throw new Error('Writing style must be latin, runes or custom.');
  if (!['ltr', 'rtl'].includes(direction)) throw new Error('Writing direction must be ltr or rtl.');
  const rawGlyphs = rawScript.glyphs ?? {};
  if (!rawGlyphs || typeof rawGlyphs !== 'object' || Array.isArray(rawGlyphs) || Object.keys(rawGlyphs).length > 128) throw new Error('Glyphs must be a map of at most 128 entries.');
  const glyphs = {};
  for (const [from, to] of Object.entries(rawGlyphs)) {
    const key = textField(from, 'Glyph source', 8, { empty: false }).toLocaleLowerCase('en-US');
    if (BAD_KEYS.has(key)) throw new Error('Unsafe glyph key.');
    glyphs[key] = textField(to, 'Glyph', 16, { empty: false });
  }
  const ids = new Set();
  const englishKeys = new Set();
  const words = value.words.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`Word ${index + 1} must be an object.`);
    const id = textField(entry.id, 'Word ID', 80, { empty: false });
    if (!/^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u.test(id)) throw new Error(`Invalid word ID: ${id}.`);
    if (ids.has(id)) throw new Error(`Duplicate word ID: ${id}. IDs must be unique.`);
    ids.add(id);
    const english = normalizeKey(textField(entry.english, 'English word', 80, { empty: false }));
    if (englishKeys.has(english)) throw new Error(`Duplicate English entry: ${english}.`);
    englishKeys.add(english);
    if (entry.locked !== undefined && typeof entry.locked !== 'boolean') throw new Error('Word locks must be true or false.');
    const word = { id, english, word: textField(entry.word, 'Word', 80, { empty: false }), pos: textField(entry.pos, 'Part of speech', 30, { fallback: 'noun', empty: false }), category: textField(entry.category, 'Category', 60, { fallback: 'Custom', empty: false }), locked: entry.locked ?? false, notes: textField(entry.notes, 'Notes', 500, { multiline: true }) };
    if (entry.family !== undefined) {
      const family = entry.family;
      if (!family || typeof family !== 'object' || Array.isArray(family) || !['plural', 'alias', 'compound'].includes(family.kind)) throw new Error('Word family kind must be plural, alias or compound.');
      word.family = { rootId: textField(family.rootId, 'Family root', 80, { empty: false }), kind: family.kind };
      if (family.kind === 'compound') word.family.otherRootId = textField(family.otherRootId, 'Other compound root', 80, { empty: false });
      else if (family.otherRootId !== undefined) throw new Error('Only a compound family can have another root.');
    }
    return word;
  });
  resolveFamilies(words, grammar);
  const rawPhrases = value.phrases ?? [];
  if (!Array.isArray(rawPhrases) || rawPhrases.length > 50) throw new Error('Phrasebook must contain at most 50 phrases.');
  const phraseIds = new Set();
  const phrases = rawPhrases.map((phrase) => {
    if (!phrase || typeof phrase !== 'object' || Array.isArray(phrase)) throw new Error('Each saved phrase must be an object.');
    const phraseId = textField(phrase.id, 'Phrase ID', 80, { empty: false });
    if (!/^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u.test(phraseId) || phraseIds.has(phraseId)) throw new Error('Phrase IDs must be valid and unique.');
    phraseIds.add(phraseId);
    const name = textField(phrase.name, 'Phrase name', 80, { empty: false });
    const source = phrase.options;
    if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('Phrase options must be an object.');
    const options = {};
    for (const key of ['subject', 'verb', 'object', 'adjective']) {
      const reference = textField(source[key], `Phrase ${key}`, 80);
      if (reference && !ids.has(reference) && !englishKeys.has(normalizeKey(reference))) throw new Error(`Phrase ${key} refers to a missing word.`);
      options[key] = ids.has(reference) ? reference : normalizeKey(reference);
    }
    options.tense = source.tense ?? 'present';
    if (!['present', 'past', 'future'].includes(options.tense)) throw new Error('Phrase tense must be present, past or future.');
    for (const key of ['plural', 'negative', 'question']) {
      if (source[key] !== undefined && typeof source[key] !== 'boolean') throw new Error(`Phrase ${key} must be true or false.`);
      options[key] = source[key] ?? false;
    }
    return { id: phraseId, name, options };
  });
  const revision = value.revision ?? 0;
  if (!Number.isSafeInteger(revision) || revision < 0 || revision > 1_000_000) throw new Error('Revision must be a nonnegative integer up to 1000000.');
  return { version: 2, id, name, seed, preset: selected.id, sounds, grammar, script: { style, direction, glyphs }, words, phrases, revision };
}

function sampledWord(sounds, random) {
  const pick = (values, weighted = false) => {
    if (!weighted || !Object.keys(sounds.rules?.weights ?? {}).length) return values[Math.floor(random() * values.length)];
    const weights = values.map((value) => sounds.rules.weights[value] ?? 1);
    let threshold = random() * weights.reduce((sum, value) => sum + value, 0);
    for (let index = 0; index < values.length; index++) {
      threshold -= weights[index];
      if (threshold < 0) return values[index];
    }
    return values.at(-1);
  };
  const count = sounds.minSyllables + Math.floor(random() * (sounds.maxSyllables - sounds.minSyllables + 1));
  let result = '';
  for (let syllable = 0; syllable < count; syllable++) {
    for (const slot of pick(sounds.patterns)) result += pick(slot === 'C' ? sounds.consonants : sounds.vowels, true);
  }
  return result.normalize('NFC');
}

function matchesRules(word, rules) {
  return !rules || ((!rules.initial.length || rules.initial.some((value) => word.startsWith(value)))
    && (!rules.final.length || rules.final.some((value) => word.endsWith(value)))
    && !rules.forbidden.some((value) => word.includes(value)));
}

function soundWitness(sounds) {
  const rules = sounds.rules;
  if (!rules || ![...rules.initial, ...rules.final, ...rules.forbidden].length) return '';
  const signature = JSON.stringify(sounds);
  if (soundWitnesses.has(signature)) return soundWitnesses.get(signature);
  // Try without weights too, so a rare weighted sound cannot hide an otherwise valid form.
  const random = randomFor(`sound-rule-check|${signature}`);
  const unweighted = { ...sounds, rules: { ...rules, weights: {} } };
  for (let attempt = 0; attempt < 4096; attempt++) {
    const word = sampledWord(attempt % 2 ? sounds : unweighted, random);
    if (matchesRules(word, rules)) {
      if (soundWitnesses.size >= 32) soundWitnesses.delete(soundWitnesses.keys().next().value);
      soundWitnesses.set(signature, word);
      return word;
    }
  }
  throw new Error('No word matching these sound rules was found within the generation limit. Relax the restrictions or add sounds.');
}

export function generateWord(language, key, salt = 0) {
  const selected = PRESETS.find((entry) => entry.id === language?.preset) ?? PRESETS[0];
  const sounds = normalizeSounds(language?.sounds, selected.sounds);
  const activeRules = sounds.rules && ([...sounds.rules.initial, ...sounds.rules.final, ...sounds.rules.forbidden].length || Object.keys(sounds.rules.weights).length);
  const seedSounds = activeRules ? sounds : Object.fromEntries(Object.entries(sounds).filter(([key]) => key !== 'rules'));
  const random = randomFor(`${language?.seed ?? 'luma'}|${normalizeKey(key)}|${salt}|${JSON.stringify(seedSounds)}`);
  const fallback = soundWitness(sounds);
  for (let attempt = 0; attempt < 128; attempt++) {
    const candidate = sampledWord(sounds, random);
    if (matchesRules(candidate, sounds.rules)) return candidate;
  }
  return fallback;
}

function generateDistinct(language, key, salt, used) {
  const rules = language?.sounds?.rules;
  const constrained = ['initial', 'final', 'forbidden'].some(name => rules?.[name]?.length);
  const collisions = new Map();
  // Constrained generation already searches for a permitted form. Repeating
  // that expensive search hundreds of times cannot create variety when only a
  // few forms exist. Keep the original path and salts for unrestricted seeds.
  for (let attempt = 0; attempt < (constrained ? 32 : 300); attempt++) {
    const candidate = generateWord(language, key, `${salt}:${attempt}`);
    const normalized = normalizeKey(candidate);
    if (!used.has(normalized)) return candidate;
    if (constrained) {
      const repeats = (collisions.get(normalized) ?? 0) + 1;
      if (repeats >= 3) return candidate;
      collisions.set(normalized, repeats);
    }
  }
  // A one-sound inventory can have fewer possible forms than entries. Homonyms
  // are honest in that case; never append digits or violate chosen phonotactics.
  return generateWord(language, key, `${salt}:homonym`);
}

export function createLanguage(options = {}) {
  if (typeof options === 'string') options = { preset: options };
  const selected = PRESETS.find((entry) => entry.id === options.preset) ?? PRESETS[0];
  const name = textField(options.name, 'Language name', 60, { fallback: 'Luma', empty: false });
  const seed = textField(typeof options.seed === 'number' ? String(options.seed) : options.seed, 'Seed', 128, { fallback: 'luma', empty: false });
  const language = { version: 2, id: `lang-${hash(`${seed}|${name}|${selected.id}`).toString(36)}`, name, seed, preset: selected.id, sounds: clone(selected.sounds), grammar: clone(DEFAULT_GRAMMAR), script: clone(DEFAULT_SCRIPT), words: [], phrases: [], revision: 0 };
  const anchors = selected.id === 'soft' ? { one: 'na', bread: 'poma', please: 'li' } : {};
  const used = new Set(Object.values(anchors));
  language.words = CORE_VOCAB.map((entry) => {
    const value = anchors[entry.english] ?? generateDistinct(language, entry.english, 0, used);
    used.add(normalizeKey(value));
    return { ...entry, word: value, locked: Object.hasOwn(anchors, entry.english), notes: '' };
  });
  return validateLanguage(linkCommonInflections(language));
}

export function regenerateLanguage(language) {
  const next = validateLanguage(language);
  next.sounds = normalizeSounds(next.sounds);
  next.revision = (next.revision ?? 0) + 1;
  const used = new Set(next.words.filter((word) => word.locked).map((word) => normalizeKey(word.word)));
  next.words = next.words.map((entry) => {
    if (entry.locked || entry.family) return entry;
    const word = generateDistinct(next, entry.english, next.revision, used);
    used.add(normalizeKey(word));
    return { ...entry, word };
  });
  return validateLanguage(next);
}

const tokenize = (value) => String(value ?? '').normalize('NFC').match(/[\p{L}\p{M}\p{N}]+(?:['’\-][\p{L}\p{M}\p{N}]+)*|\s+|[^\p{L}\p{M}\p{N}\s]/gu) ?? [];
const isLexical = (value) => /^[\p{L}\p{M}\p{N}]/u.test(value);

/** Dictionary substitution only. No inferred syntax or unlisted inflections. */
export function translateText(text, language) {
  const source = String(text ?? '');
  if (source.length > 20000) throw new Error('Gloss input is too long (maximum 20000 characters).');
  const pieces = tokenize(source);
  const dictionary = new Map();
  for (const entry of language?.words ?? []) {
    const key = normalizeKey(entry.english);
    const parts = tokenize(key);
    if (!parts.length || !isLexical(parts[0])) continue;
    const first = normalizeKey(parts[0]);
    if (!dictionary.has(first)) dictionary.set(first, []);
    dictionary.get(first).push({ entry, parts });
  }
  for (const list of dictionary.values()) list.sort((a, b) => b.parts.length - a.parts.length);
  const tokens = [];
  const unknown = [];
  const unknownKeys = new Set();
  for (let index = 0; index < pieces.length;) {
    const piece = pieces[index];
    if (!isLexical(piece)) {
      tokens.push({ type: /^\s+$/u.test(piece) ? 'space' : 'punctuation', source: piece, text: piece, known: true });
      index++;
      continue;
    }
    const candidates = dictionary.get(normalizeKey(piece)) ?? [];
    const found = candidates.find(({ parts }) => parts.every((part, offset) => /^\s+$/u.test(part) ? /^\s+$/u.test(pieces[index + offset] ?? '') : normalizeKey(part) === normalizeKey(pieces[index + offset] ?? '')));
    if (found) {
      tokens.push({ type: 'word', source: pieces.slice(index, index + found.parts.length).join(''), text: found.entry.word, known: true, wordId: found.entry.id });
      index += found.parts.length;
    } else {
      tokens.push({ type: 'unknown', source: piece, text: `⟦${piece}⟧`, known: false });
      const key = normalizeKey(piece);
      if (!unknownKeys.has(key)) { unknownKeys.add(key); unknown.push(piece); }
      index++;
    }
  }
  return { text: tokens.map((token) => token.text).join(''), tokens, unknown };
}

/** Render a supported structured clause without changing the saved dictionary. */
export function composeSentence(options = {}, language) {
  try {
    const grammar = grammarFor(language), clause = clauseFromSelections(options, language), syntax = clauseSyntax(clause);
    const lookup = value => {
      const word = entryFor(language, value);
      return token(word?.word ?? `⟦${value}⟧`, { kind: 'word', key: value, wordId: word?.id, known: Boolean(word) });
    };
    const pluralLookup = node => {
      const word = pluralEntry(language, node.head.key, node.surface);
      return word ? token(word.word, { kind: 'word', key: node.head.key, wordId: word.id, known: true }) : null;
    };
    const rendered = renderNode(syntax, grammar, lookup, pluralLookup);
    const slots = {
      S: renderNode(syntax.subject, grammar, lookup, pluralLookup).text,
      V: join([literal(clause.negative ? grammar.negative : ''), literal(clause.tense === 'past' ? grammar.past : clause.tense === 'future' ? grammar.future : ''), lookup(clause.verb)]).text,
      O: renderNode(syntax.object, grammar, lookup, pluralLookup).text,
    };
    return { text: rendered.text + (clause.question ? '?' : '.'), english: englishSentence(clause), tokens: rendered.tokens, slots, error: '' };
  } catch (error) {
    return { text: '', english: '', tokens: [], slots: {}, error: error.message };
  }
}

export function renderWriting(text, language) {
  const source = String(text ?? '').normalize('NFC');
  const script = language?.script ?? DEFAULT_SCRIPT;
  if (script.style === 'latin' || !script.style) return source;
  const map = script.style === 'runes' ? { ...RUNE_GLYPHS, ...(script.glyphs ?? {}) } : script.glyphs ?? {};
  const keys = Object.keys(map).filter(Boolean).sort((a, b) => b.length - a.length);
  let result = '';
  for (let index = 0; index < source.length;) {
    const key = keys.find((key) => source.slice(index, index + key.length).toLocaleLowerCase('en-US') === key.toLocaleLowerCase('en-US'));
    if (key) { result += map[key]; index += key.length; }
    else { const char = String.fromCodePoint(source.codePointAt(index)); result += char; index += char.length; }
  }
  return result;
}

export function generateNames(language, count = 6, kind = 'person') {
  const total = Number.isFinite(Number(count)) ? Math.max(0, Math.min(50, Math.floor(Number(count)))) : 6;
  const result = [];
  const used = new Set();
  for (let index = 0; index < total; index++) {
    const word = generateDistinct(language, `name:${kind}:${index}`, language?.revision ?? 0, used);
    used.add(normalizeKey(word));
    const letters = Array.from(word);
    result.push(letters[0].toLocaleUpperCase('en-US') + letters.slice(1).join(''));
  }
  return result;
}

export function applySoundChange(language, from, to) {
  const search = textField(from, 'Source sound', 16, { empty: false });
  const replacement = textField(to, 'Replacement sound', 16);
  const next = clone(language);
  next.words = next.words.map((entry) => {
    if (entry.locked) return entry;
    const word = entry.word.split(search).join(replacement).normalize('NFC');
    if (!word || charLength(word) > 80) throw new Error('This sound change creates an empty or oversized word.');
    return { ...entry, word };
  });
  next.revision = (next.revision ?? 0) + 1;
  return next;
}

export function exportCSV(language) {
  const safe = (value) => {
    let text = String(value ?? '');
    if (/^[\s\uFEFF]*[=+@-]/u.test(text) || /^[\t\r\n]/u.test(text)) text = `'${text}`;
    return `"${text.replace(/"/gu, '""')}"`;
  };
  const columns = ['english', 'word', 'pos', 'category', 'locked', 'notes'];
  return [columns.map(safe).join(','), ...(language?.words ?? []).map((entry) => columns.map((key) => safe(entry[key])).join(','))].join('\r\n');
}
