import { validateLanguage, generateWord, linkCommonInflections, composeSentence, renderWriting } from './engine.js';

const keyOf = (value) => String(value ?? '').normalize('NFC').trim().toLocaleLowerCase('en-US').replace(/\s+/gu, ' ');
const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/gu, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const bump = (language) => { language.revision++; return validateLanguage(language); };

function customId(english, used) {
  let hash = 2166136261;
  for (const char of english) { hash ^= char.codePointAt(0); hash = Math.imul(hash, 16777619); }
  const base = `custom-${(hash >>> 0).toString(36)}`;
  let id = base;
  for (let index = 2; used.has(id); index++) id = `${base}-${index}`;
  return id;
}

function csvRecords(text) {
  const records = [];
  let fields = [], field = '', quoted = false, closed = false;
  const endField = () => { fields.push(field); field = ''; closed = false; };
  const endRow = () => {
    endField();
    if (fields.some((value) => value.trim())) records.push(fields);
    fields = [];
    if (records.length > 2001) throw new Error('CSV contains more than 2000 dictionary rows.');
  };
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index++; }
      else if (char === '"') { quoted = false; closed = true; }
      else field += char;
    } else if (char === ',') endField();
    else if (char === '\r' || char === '\n') { endRow(); if (char === '\r' && text[index + 1] === '\n') index++; }
    else if (closed) throw new Error('Unexpected text after a closing CSV quote.');
    else if (char === '"') {
      if (field) throw new Error('A CSV quote must start at the beginning of a field.');
      quoted = true;
    } else field += char;
  }
  if (quoted) throw new Error('CSV contains an unfinished quoted field.');
  if (field || fields.length || closed) endRow();
  return records;
}

/** Append-only preview: duplicate meanings are reported separately and never overwritten. */
export function parseDictionaryCSV(text, language) {
  const preview = { rows: [], errors: [], duplicates: [] };
  let base, records;
  try {
    if (typeof text !== 'string' || text.length > 1_000_000) throw new Error('CSV must be text no larger than 1 MB.');
    base = validateLanguage(language);
    records = csvRecords(text.replace(/^\uFEFF/u, ''));
    if (!records.length) throw new Error('CSV needs a header and dictionary rows.');
  } catch (error) { preview.errors.push({ row: 1, message: error.message }); return preview; }
  const headers = records.shift().map(keyOf);
  const allowed = new Set(['id', 'english', 'word', 'pos', 'category', 'locked', 'notes']);
  if (!headers.includes('english') || headers.some((name) => !allowed.has(name)) || new Set(headers).size !== headers.length) {
    preview.errors.push({ row: 1, message: 'CSV needs a unique english column; optional columns are id, word, pos, category, locked and notes.' });
    return preview;
  }
  const meanings = new Map(base.words.map((entry) => [entry.english, entry.id]));
  const ids = new Set(base.words.map((entry) => entry.id));
  const unprotect = (value) => value.replace(/^'(?=[\s\uFEFF]*[=+@-]|[\t\r\n])/u, '');
  records.forEach((fields, index) => {
    const row = index + 2;
    try {
      if (fields.length !== headers.length) throw new Error('CSV row has a different number of fields than the header.');
      const input = Object.fromEntries(headers.map((name, column) => [name, unprotect(fields[column])]));
      const english = keyOf(input.english);
      if (meanings.has(english)) { preview.duplicates.push({ row, english, existingId: meanings.get(english) }); return; }
      if (base.words.length + preview.rows.length >= 2000) throw new Error('The dictionary supports at most 2000 entries.');
      const id = input.id?.trim() || customId(english, ids);
      if (ids.has(id)) throw new Error(`Duplicate word ID: ${id}.`);
      const hasSpelling = Boolean(input.word?.trim());
      const lock = input.locked?.trim().toLowerCase();
      if (lock && !['true', 'false'].includes(lock)) throw new Error('CSV locked values must be true or false.');
      const entry = { id, english, word: hasSpelling ? input.word : generateWord(base, english), pos: input.pos?.trim() || 'noun', category: input.category?.trim() || 'Custom', locked: lock ? lock === 'true' : hasSpelling, notes: input.notes ?? '' };
      const normalized = validateLanguage({ ...base, words: [entry], phrases: [] }).words[0];
      preview.rows.push(normalized);
      meanings.set(normalized.english, normalized.id);
      ids.add(normalized.id);
    } catch (error) { preview.errors.push({ row, message: error.message }); }
  });
  return preview;
}

export function importDictionaryCSV(language, preview) {
  const next = validateLanguage(language);
  if (!preview || !Array.isArray(preview.rows) || !Array.isArray(preview.errors) || preview.errors.length) throw new Error('Resolve all CSV preview errors before importing.');
  if (preview.rows.length > 2000) throw new Error('CSV contains too many rows.');
  next.words.push(...preview.rows);
  return bump(next);
}

export function linkInflections(language) {
  return bump(linkCommonInflections(validateLanguage(language)));
}

export function deriveWord(language, { rootId, kind, otherRootId, english } = {}) {
  const next = validateLanguage(language);
  const root = next.words.find((entry) => entry.id === rootId);
  if (!root) throw new Error('Choose an existing family root.');
  if (!['plural', 'alias', 'compound'].includes(kind)) throw new Error('Choose plural, alias or compound.');
  const meaning = keyOf(english);
  if (next.words.some((entry) => entry.english === meaning)) throw new Error('This English meaning already exists in the dictionary.');
  const family = { rootId, kind };
  if (kind === 'compound') family.otherRootId = otherRootId;
  const id = customId(meaning, new Set(next.words.map((entry) => entry.id)));
  next.words.push({ id, english: meaning, word: root.word, pos: root.pos, category: 'Custom', locked: false, notes: '', family });
  return bump(next);
}

function changeText(word, from, to, condition, vowels) {
  let result = '', cursor = 0;
  while (cursor < word.length) {
    const at = word.indexOf(from, cursor);
    if (at < 0) { result += word.slice(cursor); break; }
    const end = at + from.length;
    const matches = condition === 'anywhere' || (condition === 'start' && at === 0) || (condition === 'end' && end === word.length)
      || (condition === 'between-vowels' && vowels.some((vowel) => word.slice(0, at).endsWith(vowel)) && vowels.some((vowel) => word.slice(end).startsWith(vowel)));
    result += word.slice(cursor, at) + (matches ? to : from);
    cursor = end;
  }
  return result.normalize('NFC');
}

function prepareSoundChange(language, from, to, condition) {
  const before = validateLanguage(language);
  if (typeof from !== 'string' || !from.trim() || Array.from(from.trim()).length > 16 || /[\u0000-\u001F\u007F]/u.test(from)) throw new Error('Source sound must be nonempty text of at most 16 characters.');
  if (typeof to !== 'string' || Array.from(to.trim()).length > 16 || /[\u0000-\u001F\u007F]/u.test(to)) throw new Error('Replacement sound must be text of at most 16 characters.');
  if (!['anywhere', 'start', 'end', 'between-vowels'].includes(condition)) throw new Error('Choose a supported sound-change condition.');
  const search = from.normalize('NFC').trim(), replacement = to.normalize('NFC').trim();
  const next = structuredClone(before);
  // Family spellings follow changed roots; kept spellings and grammar markers are explicit choices.
  next.words = next.words.map((entry) => entry.locked || entry.family ? entry : { ...entry, word: changeText(entry.word, search, replacement, condition, next.sounds.vowels) });
  const changed = bump(next);
  const changes = changed.words.flatMap((entry, index) => entry.word === before.words[index].word ? [] : [{ id: entry.id, english: entry.english, before: before.words[index].word, after: entry.word }]);
  return { changed, preview: { from: search, to: replacement, condition, changes, skippedLocked: before.words.filter((entry) => entry.locked).length } };
}

export function previewSoundChange(language, from, to, condition = 'anywhere') {
  return prepareSoundChange(language, from, to, condition).preview;
}

export function changeSounds(language, from, to, condition = 'anywhere') {
  return prepareSoundChange(language, from, to, condition).changed;
}

/** Complete standalone document; all language-controlled content is escaped as text. */
export function languageReferenceHTML(language) {
  const doc = validateLanguage(language);
  const e = escapeHTML;
  const list = (items) => e(items.join(', ') || 'None');
  const rules = doc.sounds.rules;
  const phrases = doc.phrases.map((phrase) => {
    const composed = composeSentence(phrase.options, doc);
    return `<tr><th scope="row">${e(phrase.name)}</th><td>${e(composed.english)}</td><td dir="${doc.script.direction}">${e(renderWriting(composed.text, doc))}</td><td>${e(composed.text)}</td></tr>`;
  }).join('');
  const dictionary = [...doc.words].sort((a, b) => a.english.localeCompare(b.english, 'en')).map((entry) => `<tr><th scope="row">${e(entry.english)}</th><td dir="${doc.script.direction}">${e(renderWriting(entry.word, doc))}</td><td>${e(entry.word)}</td><td>${e(entry.pos)}</td><td>${e(entry.category)}</td><td>${e(entry.family ? `${entry.family.kind}: ${doc.words.find((root) => root.id === entry.family.rootId).english}${entry.family.otherRootId ? ` + ${doc.words.find((root) => root.id === entry.family.otherRootId).english}` : ''}` : '')}${entry.locked ? ' (kept)' : ''}</td><td>${e(entry.notes)}</td></tr>`).join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>${e(doc.name)} — language reference</title>
<style>body{font:16px/1.5 system-ui,sans-serif;color:#222;max-width:1100px;margin:3rem auto;padding:0 1.5rem}h1,h2{line-height:1.2}h2{margin-top:2rem}table{border-collapse:collapse;width:100%;table-layout:fixed;font-size:.85rem}th,td{text-align:left;vertical-align:top;border-bottom:1px solid #ccc;padding:.5rem;overflow-wrap:anywhere;white-space:pre-wrap}thead{display:table-header-group}dt{font-weight:600}dd{margin:0 0 .6rem}p{overflow-wrap:anywhere}@media print{body{margin:0;padding:0;font-size:11pt}h2{break-after:avoid}tr{break-inside:avoid}table{font-size:8pt}@page{margin:15mm}}</style></head><body>
<h1>${e(doc.name)}</h1><p>Language reference · ${doc.words.length} dictionary entries · revision ${doc.revision}</p>
<h2>Sounds</h2><dl><dt>Consonants</dt><dd>${list(doc.sounds.consonants)}</dd><dt>Vowels</dt><dd>${list(doc.sounds.vowels)}</dd><dt>Syllables</dt><dd>${list(doc.sounds.patterns)} · ${doc.sounds.minSyllables}–${doc.sounds.maxSyllables} per generated root</dd>${rules ? `<dt>Allowed beginnings</dt><dd>${list(rules.initial)}</dd><dt>Allowed endings</dt><dd>${list(rules.final)}</dd><dt>Forbidden sequences</dt><dd>${list(rules.forbidden)}</dd><dt>Sound weights</dt><dd>${list(Object.entries(rules.weights).map(([sound, weight]) => `${sound}: ${weight}`))}</dd>` : ''}</dl>
<h2>Grammar</h2><dl><dt>Word order</dt><dd>${e(doc.grammar.order)}</dd><dt>Adjectives</dt><dd>${e(doc.grammar.adjective)} the noun</dd>${['plural', 'past', 'future', 'negative', 'question'].map((name) => `<dt>${e(name)}</dt><dd>${e(doc.grammar[name] || '(none)')}</dd>`).join('')}</dl>
<h2>Writing</h2><p>${e(doc.script.style)} · ${doc.script.direction === 'rtl' ? 'Right to left' : 'Left to right'}</p>${Object.keys(doc.script.glyphs).length ? `<p>${e(Object.entries(doc.script.glyphs).map(([from, to]) => `${from} → ${to}`).join(' · '))}</p>` : ''}
<h2>Phrasebook</h2>${phrases ? `<table><thead><tr><th>Name</th><th>English</th><th>Writing</th><th>Spelling</th></tr></thead><tbody>${phrases}</tbody></table>` : '<p>No saved phrases.</p>'}
<h2>Dictionary</h2><table><thead><tr><th>English</th><th>Writing</th><th>Spelling</th><th>Type</th><th>Category</th><th>Family</th><th>Notes</th></tr></thead><tbody>${dictionary}</tbody></table>
</body></html>`;
}
