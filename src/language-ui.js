import { CORE_VOCAB, composeSentence, generateWord, renderWriting, validateLanguage } from './engine.js';
import { parseDictionaryCSV, importDictionaryCSV, linkInflections, deriveWord, previewSoundChange, changeSounds, languageReferenceHTML } from './language-tools.js';

const keyFor = value => String(value ?? '').normalize('NFC').trim().toLocaleLowerCase('en-US').replace(/\s+/gu, ' ');
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const phraseKeys = ['subject', 'verb', 'object', 'adjective'];
const coreIds = new Set(CORE_VOCAB.map(word => word.id));
const coreMeanings = new Set(CORE_VOCAB.map(word => keyFor(word.english)));
const uid = () => `phrase-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const mounts = new WeakMap();
const isBuiltIn = word => coreIds.has(word.id) || coreMeanings.has(keyFor(word.english));
const option = (value, label, selected = false) => `<option value="${escapeHTML(value)}"${selected ? ' selected' : ''}>${escapeHTML(label)}</option>`;
const resolveReference = (language, value) => language.words.find(word => word.id === value) ?? language.words.find(word => keyFor(word.english) === keyFor(value));

function findWord(language, id) {
  const word = language.words.find(entry => entry.id === id);
  if (!word) throw new Error('That word is no longer in this dictionary.');
  return word;
}

export function serializePortableLanguage(language) {
  const serialized = JSON.stringify(validateLanguage(language));
  if (new TextEncoder().encode(serialized).byteLength > 1_000_000) throw new Error('This language is over the 1 MB backup limit. Export the dictionary as CSV, or shorten your notes and try again.');
  return serialized;
}

export function updateWordDetails(language, id, details) {
  const next = structuredClone(language), word = findWord(next, id);
  const spelling = details.word ?? word.word;
  if (typeof spelling !== 'string') throw new Error('The word spelling must be text.');
  const changedSpelling = spelling.normalize('NFC').trim() !== word.word;
  for (const key of ['word', 'pos', 'category', 'notes']) if (details[key] !== undefined) word[key] = details[key];
  if (changedSpelling) { word.locked = true; delete word.family; }
  return validateLanguage(next);
}

export function wordReferences(language, id) {
  const word = findWord(language, id);
  const references = language.words.filter(entry => entry.family?.rootId === id || entry.family?.otherRootId === id).map(entry => `related word “${entry.english}”`);
  for (const phrase of language.phrases ?? []) {
    if (phraseKeys.some(key => resolveReference(language, phrase.options[key])?.id === id)) references.push(`saved phrase “${phrase.name}”`);
  }
  return references;
}

export function renameCustomMeaning(language, id, meaning) {
  const next = structuredClone(language), word = findWord(next, id);
  if (isBuiltIn(word)) throw new Error('Built-in meanings are used by the scenes. Their translations can still be edited.');
  const english = keyFor(meaning), oldEnglish = keyFor(word.english);
  if (!english) throw new Error('Give this word an English meaning.');
  if (next.words.some(entry => entry.id !== id && keyFor(entry.english) === english)) throw new Error('That meaning already exists in your dictionary.');
  word.english = english;
  for (const phrase of next.phrases ?? []) {
    for (const key of phraseKeys) {
      // ID references survive a rename without rewriting; older meaning refs migrate.
      if (phrase.options[key] !== id && !language.words.some(entry => entry.id === phrase.options[key]) && keyFor(phrase.options[key]) === oldEnglish) phrase.options[key] = english;
    }
  }
  return validateLanguage(next);
}

export function deleteCustomWord(language, id) {
  const word = findWord(language, id);
  if (isBuiltIn(word)) throw new Error('Built-in meanings are used by the scenes and cannot be deleted.');
  const references = wordReferences(language, id);
  if (references.length) throw new Error(`This word is used by ${references.join(', ')}. Remove those references first.`);
  const next = structuredClone(language);
  next.words = next.words.filter(entry => entry.id !== id);
  return validateLanguage(next);
}

export function setWordsKept(language, ids, locked) {
  const selected = new Set(ids);
  if (!selected.size) throw new Error('Select at least one word.');
  for (const id of selected) findWord(language, id);
  const next = structuredClone(language);
  for (const word of next.words) if (selected.has(word.id)) word.locked = Boolean(locked);
  return validateLanguage(next);
}

export function parseSoundWeights(text) {
  const weights = {};
  for (const token of String(text).trim().split(/[\s,]+/u).filter(Boolean)) {
    const match = /^([^=]+)=((?:\d+(?:\.\d+)?|\.\d+))$/u.exec(token);
    if (!match) throw new Error('Use sound=number for weights, such as m=3 a=1.5. Separate pairs with spaces.');
    const [, sound, raw] = match, weight = Number(raw);
    if (['__proto__', 'constructor', 'prototype'].includes(sound)) throw new Error('Choose a different sound for this weight.');
    if (Object.hasOwn(weights, sound)) throw new Error(`The sound “${sound}” has more than one weight.`);
    if (!(weight > 0 && weight <= 100)) throw new Error('Weights must be greater than 0 and no more than 100.');
    weights[sound] = weight;
  }
  return weights;
}

export function addSavedPhrase(language, name, options, id = uid()) {
  if (!String(name).trim()) throw new Error('Give your phrase a name.');
  const next = structuredClone(language), normalized = { ...options };
  for (const key of phraseKeys) {
    const value = options[key] ?? '';
    if (!value) { normalized[key] = ''; continue; }
    const word = next.words.find(entry => entry.id === value) ?? next.words.find(entry => keyFor(entry.english) === keyFor(value));
    if (!word) throw new Error(`The ${key} is no longer in your dictionary.`);
    normalized[key] = word.id;
  }
  next.phrases = [...(next.phrases ?? []), { id, name: String(name).trim(), options: normalized }];
  return validateLanguage(next);
}

/** Owns only the added drawers and sound-change controls. Re-mounts are idempotent. */
export function mountLanguageTools({ getLanguage, commit, openDialog, closeDialog, notify, playGenerated = () => {} }) {
  const doc = document, $ = id => doc.getElementById(id);
  mounts.get(doc)?.destroy();
  const events = new AbortController(), owned = [], timers = new Set();
  let disposed = false, languageId, rulesDirty = false, soundPreview = null;
  const listen = (node, type, handler) => node?.addEventListener(type, handler, { signal: events.signal });
  const error = cause => { const target = $('modal-error'); if (target && $('studio-dialog')?.open) target.textContent = cause.message; else notify(cause.message); };
  const attempt = handler => event => { try { handler(event); } catch (cause) { error(cause); } };
  const checkLanguage = id => { if (getLanguage().id !== id) throw new Error('The active language changed. Close this dialog and open the tool again.'); };
  const attach = (parent, html, before = null) => {
    const template = doc.createElement('template'); template.innerHTML = html.trim();
    const node = template.content.firstElementChild; parent.insertBefore(node, before); owned.push(node); return node;
  };
  const safeCommit = (next, message) => { if (commit(next, message) === false) return false; refresh(); return true; };
  const download = (content, name, type) => {
    const url = URL.createObjectURL(new Blob([content], { type })), anchor = doc.createElement('a');
    anchor.href = url; anchor.download = name; doc.body.append(anchor); anchor.click(); anchor.remove();
    const timer = setTimeout(() => { URL.revokeObjectURL(url); timers.delete(timer); }, 1000);
    timers.add(timer);
  };
  const filename = () => `${getLanguage().name.replace(/[^\p{L}\p{N}_-]/gu, '-').slice(0, 50) || 'language'}-reference.html`;
  const copy = async text => {
    try { await navigator.clipboard.writeText(text); if (!disposed) notify('Phrase copied.'); }
    catch { if (!disposed) openDialog('Copy your phrase', `<p class="small-note">Select the text below to copy it.</p><textarea aria-label="Phrase to copy" readonly rows="4">${escapeHTML(text)}</textarea>`); }
  };

  const wordsDrawer = attach($('view-words'), `<details class="tool-drawer language-tools"><summary>Dictionary tools <span>Import, link and organize words</span></summary><div class="drawer-body"><p class="small-note">Add words from a file or edit several words at once.</p><div class="language-tool-actions"><button class="secondary-button" id="lt-import">Import dictionary (CSV)</button><button class="secondary-button" id="lt-family">Add a related word</button><button class="secondary-button" id="lt-link">Link common forms</button><button class="secondary-button" id="lt-bulk">Keep or release words</button><button class="secondary-button" id="lt-manage">Edit custom meanings</button></div><p class="footnote">Linked words update when their roots or grammar change. Keep a word to preserve its spelling.</p></div></details>`);
  const phraseDrawer = attach($('view-writing'), `<details class="tool-drawer language-tools"><summary>Your phrasebook <span id="lt-phrase-count">Save sentences for later</span></summary><div class="drawer-body"><div class="lt-section-row"><p class="small-note">Save a sentence from the builder above. Saved phrases update when you change your language.</p><button class="secondary-button" id="lt-save-phrase">Save current sentence</button></div><div id="lt-phrase-list" class="lt-phrase-list"></div></div></details>`, $('view-writing').querySelector('.gloss-panel'));
  const referenceDrawer = attach($('view-writing'), `<details class="tool-drawer language-tools"><summary>Language reference <span>Printable grammar, alphabet &amp; dictionary</span></summary><div class="drawer-body"><p class="small-note">Download an HTML reference or print your grammar, alphabet, dictionary and saved phrases.</p><div class="language-tool-actions"><button class="secondary-button" id="lt-download-reference">Download reference</button><button class="secondary-button" id="lt-print-reference">Print reference</button></div></div></details>`);
  const rulesHost = $('apply-sounds').parentElement;
  const rulesDrawer = attach(rulesHost, `<details class="lt-sound-rules language-tools"><summary>Sound rules</summary><div class="lt-rule-fields"><p class="small-note">Set rules for new words. Separate entries with spaces; leave a field empty to allow any sound.</p><div class="form-grid"><label>Allowed beginnings<input id="lt-rule-initial" maxlength="680" placeholder="m n a"><span>Sounds a word may start with.</span></label><label>Allowed endings<input id="lt-rule-final" maxlength="680" placeholder="a e n"><span>Sounds a word may end with.</span></label></div><label>Forbidden sequences<input id="lt-rule-forbidden" maxlength="680" placeholder="mm nn"><span>Sound combinations to avoid in new words.</span></label><label>Sound weights<input id="lt-rule-weights" maxlength="1600" placeholder="m=3 a=2 sh=0.5"><span>Higher numbers make a sound more frequent. Unlisted sounds have weight 1.</span></label><div class="language-tool-actions"><button class="secondary-button" id="lt-apply-rules">Apply restrictions</button></div><p id="lt-rule-status" class="small-note" role="status"></p></div></details>`, $('apply-sounds'));
  const changeHost = $('apply-change').parentElement;
  const conditionLabel = attach(changeHost, `<label>Where<select id="lt-change-condition"><option value="anywhere">Anywhere</option><option value="start">Start of a word</option><option value="end">End of a word</option><option value="between-vowels">Between vowels</option></select></label>`, $('apply-change'));
  const previousChangeHandler = $('apply-change').onclick, previousChangeText = $('apply-change').textContent;
  $('apply-change').onclick = null;
  $('apply-change').textContent = 'Preview change';
  listen($('apply-change'), 'click', attempt(() => showSoundPreview()));

  function importDialog(initialText = '') {
    const id = getLanguage().id;
    openDialog('Import dictionary', `<p class="dialog-intro">Include an english column. You can also add word, pos, category, locked and notes columns. Missing translations are generated; existing meanings are skipped.</p><label>CSV file<input id="lt-csv-file" type="file" accept=".csv,text/csv"></label><label>Or paste CSV<textarea id="lt-csv-text" rows="7" maxlength="1000000" spellcheck="false" placeholder="english,word,pos,category&#10;kite,luma,noun,Custom">${escapeHTML(initialText)}</textarea></label><div id="lt-csv-preview" class="lt-csv-preview" aria-live="polite"></div>`, '<button class="secondary-button" id="lt-preview-csv">Preview import</button><button class="primary-button" id="lt-commit-csv" disabled>Import words</button>');
    let preview = null, source = '', signature = '';
    const textArea = $('lt-csv-text'), commitButton = $('lt-commit-csv');
    const invalidate = () => { preview = null; commitButton.disabled = true; $('lt-csv-preview').textContent = ''; };
    listen(textArea, 'input', invalidate);
    listen($('lt-csv-file'), 'change', async event => {
      const file = event.target.files?.[0]; if (!file) return;
      try {
        if (file.size > 1_000_000) throw new Error('Choose a CSV file smaller than 1 MB.');
        const contents = await file.text();
        if (disposed || !textArea.isConnected) return;
        checkLanguage(id); textArea.value = contents; invalidate(); previewImport();
      } catch (cause) { if (textArea.isConnected) error(cause); }
    });
    const previewImport = () => {
      checkLanguage(id); source = textArea.value; preview = null; commitButton.disabled = true;
      const result = parseDictionaryCSV(source, getLanguage());
      signature = JSON.stringify(getLanguage()); preview = result;
      const errors = result.errors.map(item => `<li>Row ${escapeHTML(item.row)}: ${escapeHTML(item.message)}</li>`).join('');
      const rows = result.rows.slice(0, 12).map(row => `<tr><td>${escapeHTML(row.english)}</td><td>${escapeHTML(row.word)}</td><td>${escapeHTML(row.pos)}</td></tr>`).join('');
      $('lt-csv-preview').innerHTML = `<p class="small-note">${result.rows.length} new words · ${result.duplicates.length} duplicate meanings skipped · ${result.errors.length} errors</p>${errors ? `<ul class="lt-errors">${errors}</ul><p class="small-note">Fix the errors and preview again before importing.</p>` : ''}${rows ? `<div class="table-scroll"><table class="lt-preview-table"><caption>Import preview${result.rows.length > 12 ? ': first 12 words' : ''}</caption><thead><tr><th>English</th><th>Your word</th><th>Type</th></tr></thead><tbody>${rows}</tbody></table></div>` : ''}`;
      commitButton.disabled = Boolean(result.errors.length || !result.rows.length);
      $('modal-error').textContent = '';
    };
    listen($('lt-preview-csv'), 'click', attempt(previewImport));
    listen(commitButton, 'click', attempt(() => {
      checkLanguage(id);
      if (!preview || preview.errors.length || !preview.rows.length) throw new Error('Preview a valid CSV before importing.');
      if (signature !== JSON.stringify(getLanguage()) || source !== textArea.value) { previewImport(); throw new Error('The dictionary changed. Review the updated preview, then import again.'); }
      const next = importDictionaryCSV(getLanguage(), preview);
      if (safeCommit(next, `${preview.rows.length} words imported. ${preview.duplicates.length} duplicate meanings skipped.`)) closeDialog();
    }));
  }

  function familyDialog() {
    const lang = getLanguage(), id = lang.id;
    const options = lang.words.map(word => option(word.id, `${word.english} · ${word.word}`)).join('');
    openDialog('Add a related word', `<p class="dialog-intro">Related words update with their roots. A plural adds your plural ending. An alias shares the root spelling, and a compound joins two roots.</p><div class="form-grid"><label>Root word<select id="lt-family-root">${options}</select></label><label>Relationship<select id="lt-family-kind"><option value="plural">Plural</option><option value="alias">Alias</option><option value="compound">Compound</option></select></label></div><label id="lt-family-other-label" hidden>Second root<select id="lt-family-other">${options}</select></label><label>English meaning<input id="lt-family-english" maxlength="80" placeholder="Give the new word a meaning"></label><p class="small-note lt-dialog-note">Keep a related word to preserve its spelling. Editing its spelling manually makes it independent.</p>`, '<button class="secondary-button" data-close>Cancel</button><button class="primary-button" id="lt-create-family">Add related word</button>');
    listen($('lt-family-kind'), 'change', () => { $('lt-family-other-label').hidden = $('lt-family-kind').value !== 'compound'; });
    listen($('lt-create-family'), 'click', attempt(() => {
      checkLanguage(id);
      const kind = $('lt-family-kind').value;
      const next = deriveWord(getLanguage(), { rootId: $('lt-family-root').value, kind, ...(kind === 'compound' ? { otherRootId: $('lt-family-other').value } : {}), english: $('lt-family-english').value });
      if (safeCommit(next, 'Related word added.')) { playGenerated(next.words.at(-1).word); closeDialog(); }
    }));
  }

  function linkDialog() {
    const id = getLanguage().id, before = getLanguage(), signature = JSON.stringify(before), next = linkInflections(before);
    const changes = next.words.filter(word => JSON.stringify(word.family) !== JSON.stringify(before.words.find(item => item.id === word.id)?.family));
    openDialog('Link common forms', `<p class="dialog-intro">Link common plural and verb forms already in your dictionary. Kept words keep their spelling and links.</p>${changes.length ? `<ul class="lt-link-list">${changes.map(word => `<li><strong>${escapeHTML(word.english)}</strong> → ${escapeHTML(next.words.find(root => root.id === word.family.rootId)?.english)} <small>${escapeHTML(word.family.kind)}</small></li>`).join('')}</ul>` : '<p class="small-note lt-dialog-note">There are no new forms to link. Common forms may already be linked or kept.</p>'}`, `<button class="secondary-button" data-close>Close</button>${changes.length ? '<button class="primary-button" id="lt-confirm-links">Link these forms</button>' : ''}`);
    listen($('lt-confirm-links'), 'click', attempt(() => {
      checkLanguage(id);
      if (signature !== JSON.stringify(getLanguage())) { linkDialog(); throw new Error('The dictionary changed. Review the updated links before applying them.'); }
      if (safeCommit(next, 'Common forms linked.')) closeDialog();
    }));
  }

  function bulkDialog(selected = new Set(), query = '') {
    const id = getLanguage().id;
    openDialog('Keep or release words', `<p class="dialog-intro">Keep selected spellings when you generate new words. Release them to let them change again.</p><label>Find words<input id="lt-bulk-search" type="search" value="${escapeHTML(query)}" placeholder="Search either language"></label><div class="lt-section-row"><button id="lt-bulk-select" class="text-button">Select matching words</button><button id="lt-bulk-clear" class="text-button">Clear selection</button><span id="lt-bulk-count" class="small-note" role="status"></span></div><div id="lt-bulk-list" class="lt-bulk-list"></div>`, '<button class="secondary-button" id="lt-release-selected">Release selected</button><button class="primary-button" id="lt-keep-selected">Keep selected</button>');
    const matching = () => { const query = keyFor($('lt-bulk-search').value); return getLanguage().words.filter(word => !query || keyFor(`${word.english} ${word.word} ${word.category}`).includes(query)); };
    const render = () => {
      $('lt-bulk-list').innerHTML = matching().map(word => `<label class="lt-word-check"><input type="checkbox" data-lt-select="${escapeHTML(word.id)}"${selected.has(word.id) ? ' checked' : ''}><span>${escapeHTML(word.english)}<small>${escapeHTML(word.word)}</small></span><span class="lt-keep-state">${word.locked ? 'Kept' : 'Free'}</span></label>`).join('') || '<p class="small-note">No matching words.</p>';
      count();
    };
    const count = () => { $('lt-bulk-count').textContent = `${selected.size} selected`; $('lt-release-selected').disabled = $('lt-keep-selected').disabled = !selected.size; };
    listen($('lt-bulk-list'), 'change', event => { const id = event.target.dataset.ltSelect; if (!id) return; if (event.target.checked) selected.add(id); else selected.delete(id); count(); });
    listen($('lt-bulk-search'), 'input', render);
    listen($('lt-bulk-select'), 'click', () => { matching().forEach(word => selected.add(word.id)); render(); });
    listen($('lt-bulk-clear'), 'click', () => { selected.clear(); render(); });
    for (const [button, locked] of [['lt-keep-selected', true], ['lt-release-selected', false]]) listen($(button), 'click', attempt(() => { checkLanguage(id); if (safeCommit(setWordsKept(getLanguage(), [...selected], locked), `${selected.size} words ${locked ? 'kept' : 'released'}.`)) closeDialog(); }));
    render();
  }

  function manageDialog(selectedId = '') {
    const languageId = getLanguage().id, custom = getLanguage().words.filter(word => !isBuiltIn(word));
    openDialog('Edit custom meanings', `<p class="dialog-intro">Rename the meanings of words you added. Their related words and saved phrases stay linked. Built-in meanings are used by the scenes.</p>${custom.length ? `<label>Custom word<select id="lt-custom-word">${custom.map(word => option(word.id, `${word.english} · ${word.word}`, word.id === selectedId)).join('')}</select></label><label>English meaning<input id="lt-custom-meaning" maxlength="80"></label><p id="lt-custom-references" class="small-note lt-dialog-note"></p>` : '<p class="small-note lt-dialog-note">Add or import a custom word first. You can change any existing translation directly in your dictionary.</p>'}`, custom.length ? '<button class="secondary-button danger-button" id="lt-delete-custom">Delete word</button><button class="primary-button" id="lt-rename-custom">Save meaning</button>' : '<button class="secondary-button" data-close>Close</button>');
    if (!custom.length) return;
    const render = () => {
      const id = $('lt-custom-word').value, word = findWord(getLanguage(), id), references = wordReferences(getLanguage(), id);
      $('lt-custom-meaning').value = word.english;
      $('lt-custom-references').textContent = references.length ? `Used by ${references.join(', ')}. These links stay when you rename the meaning. Remove them before deleting the word.` : 'No related words or saved phrases use this word.';
      $('lt-delete-custom').disabled = references.length > 0;
    };
    listen($('lt-custom-word'), 'change', attempt(render));
    listen($('lt-rename-custom'), 'click', attempt(() => { checkLanguage(languageId); if (safeCommit(renameCustomMeaning(getLanguage(), $('lt-custom-word').value, $('lt-custom-meaning').value), 'Meaning updated.')) closeDialog(); }));
    listen($('lt-delete-custom'), 'click', attempt(() => {
      checkLanguage(languageId); const id = $('lt-custom-word').value, word = findWord(getLanguage(), id);
      openDialog(`Delete “${word.english}”?`, '<p class="dialog-intro">This removes the custom word from this language. Undo will be available until you reload the studio.</p>', '<button class="secondary-button" data-close>Keep word</button><button class="primary-button" id="lt-confirm-delete">Delete word</button>');
      listen($('lt-confirm-delete'), 'click', attempt(() => { checkLanguage(languageId); if (safeCommit(deleteCustomWord(getLanguage(), id), 'Custom word deleted. Undo is available.')) closeDialog(); }));
    }));
    render();
  }

  function savePhraseDialog() {
    const id = getLanguage().id, options = Object.fromEntries(phraseKeys.map(key => [key, $(`sentence-${key}`).value]));
    options.tense = $('sentence-tense').value;
    for (const key of ['plural', 'negative', 'question']) options[key] = $(`sentence-${key}`).checked;
    const result = composeSentence(options, getLanguage());
    openDialog('Save phrase', `<p class="dialog-intro">${escapeHTML(result.english)}</p><label>Phrase name<input id="lt-phrase-name" maxlength="80" placeholder="For example, a greeting" autofocus></label><p class="small-note lt-dialog-note">This phrase updates when you change your language.</p>`, '<button class="secondary-button" data-close>Cancel</button><button class="primary-button" id="lt-confirm-phrase">Save phrase</button>');
    listen($('lt-confirm-phrase'), 'click', attempt(() => { checkLanguage(id); if (safeCommit(addSavedPhrase(getLanguage(), $('lt-phrase-name').value, options), 'Phrase saved.')) { phraseDrawer.open = true; closeDialog(); } }));
    listen($('lt-phrase-name'), 'keydown', event => { if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); $('lt-confirm-phrase').click(); } });
  }

  function renderPhrases() {
    const lang = getLanguage(), phrases = lang.phrases ?? [];
    $('lt-phrase-count').textContent = phrases.length ? `${phrases.length} saved ${phrases.length === 1 ? 'phrase' : 'phrases'}` : 'Save sentences for later';
    $('lt-save-phrase').disabled = phrases.length >= 50;
    const list = $('lt-phrase-list');
    const focused = list.contains(doc.activeElement) ? { id: doc.activeElement.dataset.phraseId, action: doc.activeElement.dataset.phraseAction } : null;
    list.innerHTML = phrases.map(phrase => {
      const result = composeSentence(phrase.options, lang), text = renderWriting(result.text, lang);
      return `<article class="lt-phrase"><div><h3>${escapeHTML(phrase.name)}</h3><p class="lt-phrase-text" dir="${lang.script.direction}">${escapeHTML(text)}</p><p class="small-note">${escapeHTML(result.english)}</p></div><div class="lt-phrase-actions"><button class="text-button" data-phrase-action="load" data-phrase-id="${escapeHTML(phrase.id)}" aria-label="Load ${escapeHTML(phrase.name)} in sentence builder">Use</button><button class="text-button" data-phrase-action="copy" data-phrase-id="${escapeHTML(phrase.id)}" aria-label="Copy ${escapeHTML(phrase.name)}">Copy</button><button class="text-button danger-button" data-phrase-action="remove" data-phrase-id="${escapeHTML(phrase.id)}" aria-label="Remove ${escapeHTML(phrase.name)}">Remove</button></div></article>`;
    }).join('') || '<p class="small-note lt-empty">Build a sentence above, then save it here.</p>';
    if (focused) [...list.querySelectorAll('button')].find(button => button.dataset.phraseId === focused.id && button.dataset.phraseAction === focused.action)?.focus({ preventScroll: true });
  }

  function showSoundPreview() {
    const lang = getLanguage(), from = $('sound-from').value, to = $('sound-to').value, condition = $('lt-change-condition').value;
    const result = previewSoundChange(lang, from, to, condition);
    soundPreview = { languageId: lang.id, signature: JSON.stringify(lang), from, to, condition };
    openDialog('Preview sound change', `<p class="dialog-intro">${result.changes.length} words will change. ${result.skippedLocked} kept words stay the same.</p>${result.changes.length ? `<div class="table-scroll lt-sound-preview"><table class="lt-preview-table"><caption>Sound change preview${result.changes.length > 40 ? ': first 40 words' : ''}</caption><thead><tr><th>Meaning</th><th>Before</th><th>After</th></tr></thead><tbody>${result.changes.slice(0, 40).map(change => `<tr><td>${escapeHTML(change.english)}</td><td>${escapeHTML(change.before)}</td><td>${escapeHTML(change.after)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="small-note lt-dialog-note">No words can change with these settings. Kept words are excluded. Try another sound or location.</p>'}`, `<button class="secondary-button" data-close>Close</button>${result.changes.length ? '<button class="primary-button" id="lt-confirm-change">Apply sound change</button>' : ''}`);
    listen($('lt-confirm-change'), 'click', attempt(() => {
      checkLanguage(soundPreview.languageId);
      if (soundPreview.signature !== JSON.stringify(getLanguage())) { showSoundPreview(); throw new Error('The language changed. Review the updated preview before applying it.'); }
      if (safeCommit(changeSounds(getLanguage(), soundPreview.from, soundPreview.to, soundPreview.condition), `${result.changes.length} word spellings updated.`)) closeDialog();
    }));
  }

  listen($('lt-import'), 'click', () => importDialog());
  listen($('lt-family'), 'click', familyDialog);
  listen($('lt-link'), 'click', attempt(linkDialog));
  listen($('lt-bulk'), 'click', () => bulkDialog());
  listen($('lt-manage'), 'click', () => manageDialog());
  listen($('lt-save-phrase'), 'click', attempt(savePhraseDialog));
  listen($('lt-phrase-list'), 'click', attempt(event => {
    const button = event.target.closest('button[data-phrase-action]'); if (!button) return;
    const lang = getLanguage(), phrase = (lang.phrases ?? []).find(item => item.id === button.dataset.phraseId); if (!phrase) return;
    if (button.dataset.phraseAction === 'copy') { void copy(renderWriting(composeSentence(phrase.options, lang).text, lang)); return; }
    if (button.dataset.phraseAction === 'remove') {
      const next = structuredClone(lang); next.phrases = next.phrases.filter(item => item.id !== phrase.id); safeCommit(validateLanguage(next), 'Phrase removed. Undo is available.'); return;
    }
    for (const key of phraseKeys) {
      const value = phrase.options[key] ?? '', control = $(`sentence-${key}`);
      const english = lang.words.find(word => word.id === value)?.english ?? value;
      // Imported phrases and later type edits can use a word outside the normal
      // suggestions. Keep that exact choice when restoring the saved structure.
      if (![...control.options].some(item => item.value === english)) {
        const savedOption = doc.createElement('option'); savedOption.value = english;
        savedOption.textContent = english ? `${english} (saved phrase)` : 'None (saved phrase)';
        control.append(savedOption);
      }
      control.value = english;
    }
    $('sentence-tense').value = phrase.options.tense ?? 'present';
    for (const key of ['plural', 'negative', 'question']) $(`sentence-${key}`).checked = Boolean(phrase.options[key]);
    $('sentence-subject').dispatchEvent(new Event('change', { bubbles: true }));
    $('sentence-subject').focus();
    notify('Phrase loaded in the sentence builder.');
  }));
  listen(rulesDrawer, 'input', () => { rulesDirty = true; $('lt-rule-status').dataset.state = 'unsaved'; $('lt-rule-status').textContent = 'Unsaved restrictions'; });
  listen($('lt-apply-rules'), 'click', () => {
    try {
      const next = structuredClone(getLanguage());
      const array = id => $(id).value.trim().split(/\s+/u).filter(Boolean);
      next.sounds.rules = { initial: array('lt-rule-initial'), final: array('lt-rule-final'), forbidden: array('lt-rule-forbidden'), weights: parseSoundWeights($('lt-rule-weights').value) };
      const valid = validateLanguage(next);
      // Detect incompatible restrictions before changing the saved language.
      const sample = generateWord(valid, 'restrictions-preview', valid.revision);
      if (safeCommit(valid, 'Sound restrictions saved. New words will follow them.')) { rulesDirty = false; $('lt-rule-status').dataset.state = 'saved'; $('lt-rule-status').textContent = `Saved. Example: ${sample}`; playGenerated(sample); }
    } catch (cause) { $('lt-rule-status').dataset.state = 'error'; $('lt-rule-status').textContent = cause.message; }
  });
  listen($('lt-download-reference'), 'click', attempt(() => { download(languageReferenceHTML(getLanguage()), filename(), 'text/html;charset=utf-8'); notify('Language reference downloaded.'); }));
  listen($('lt-print-reference'), 'click', attempt(() => {
    const html = languageReferenceHTML(getLanguage()), popup = window.open('', '_blank');
    if (!popup) throw new Error('Your browser blocked the print window. Allow popups for this studio or download the reference instead.');
    popup.opener = null;
    popup.document.open(); popup.document.write(html); popup.document.close();
    const timer = setTimeout(() => { timers.delete(timer); if (!disposed && !popup.closed) { popup.focus(); popup.print(); } }, 150);
    timers.add(timer);
  }));

  function refresh() {
    if (disposed) return;
    const lang = getLanguage(), changedLanguage = languageId !== lang.id;
    if (changedLanguage) { rulesDirty = false; languageId = lang.id; }
    if (changedLanguage || (!rulesDirty && !rulesDrawer.contains(doc.activeElement))) {
      const rules = lang.sounds.rules ?? {};
      for (const key of ['initial', 'final', 'forbidden']) $(`lt-rule-${key}`).value = (rules[key] ?? []).join(' ');
      $('lt-rule-weights').value = Object.entries(rules.weights ?? {}).map(([sound, value]) => `${sound}=${value}`).join(' ');
      if (changedLanguage) $('lt-rule-status').textContent = '';
    }
    renderPhrases();
  }
  function destroy() {
    if (disposed) return;
    disposed = true; events.abort(); owned.forEach(node => node.remove());
    // Download URLs still revoke themselves; cancelling their timers would leak them.
    const button = $('apply-change');
    if (button) { button.onclick = previousChangeHandler; button.textContent = previousChangeText; }
    mounts.delete(doc);
  }
  const api = { refresh, destroy }; mounts.set(doc, api); refresh(); return api;
}
