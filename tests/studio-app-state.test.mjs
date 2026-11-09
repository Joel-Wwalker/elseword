import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createLanguage, composeSentence } from '../src/engine.js';
import { validateRulesEdit } from '../src/studio-usability.js';

const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
// Run the actual app functions with only their browser boundaries replaced.
// Keeping the import and animation startup out makes deferred loads controllable.
function section(start, end) {
  const from = app.indexOf(start), to = app.indexOf(end, from);
  assert.ok(from >= 0 && to > from, 'app function boundaries exist');
  return app.slice(from, to);
}
function node() {
  return { value: '', dataset: {}, checked: false, hidden: false, disabled: false, textContent: '',
    innerHTML: '', classList: { add() {}, remove() {}, toggle() {} },
    setAttribute() {}, removeAttribute() {}, focus() {}, querySelector: () => node() };
}

test('a correction after failed Apply survives another grammar change and tab rendering', () => {
  const nodes = new Map(), listeners = new Map();
  const get = id => { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); };
  const patterns = ['CV', 'CVC', 'V', 'VC', 'CCV'].map(value => ({ ...node(), value }));
  let current = createLanguage();
  const context = vm.createContext({
    $: get, language: () => current, rulesFormLanguageId: null, soundDraft: null, grammarDraft: {}, rulesErrors: { sounds: {}, grammar: {} },
    PRESETS: [], generateWord: () => 'na', escapeHTML: String, composeSentence, renderWriting: String,
    byEnglish: () => ({ word: 'na' }), clone: structuredClone, playGenerated() {},
    validateRulesEdit: (source, patch) => validateRulesEdit(source, structuredClone(patch)),
    commit(next) { current = next; return true; },
    document: {
      querySelectorAll: selector => selector.endsWith(':checked') ? patterns.filter(input => input.checked) : patterns,
      addEventListener(type, handler) { const handlers = listeners.get(type) ?? []; handlers.push(handler); listeners.set(type, handlers); },
    },
  });
  vm.runInContext(section('function renderRules()', 'function renderSentenceSelectors()'), context);
  vm.runInContext("displayRulesErrors = () => {}; if (typeof renderGenerationStatus === 'function') renderGenerationStatus = () => {}; renderRules();", context);
  vm.runInContext(section("document.addEventListener('change',event=>{", "$('language-switch').onchange"), context);
  get('vowels').value = '';
  vm.runInContext('applySounds();', context);
  assert.match(context.rulesErrors.sounds.vowels, /vowel/i);
  get('vowels').id = 'vowels'; get('vowels').value = 'e';
  for (const handler of listeners.get('input') ?? []) handler({ target: get('vowels') });
  patterns.forEach(input => { input.checked = input.value === 'CV'; });
  patterns[0].closest = () => ({});
  for (const handler of listeners.get('change') ?? []) handler({ target: patterns[0] });
  current.grammar.order = 'SOV';
  vm.runInContext('renderRules(); renderRules();', context);
  assert.equal(get('vowels').value, 'e');
  assert.deepEqual(patterns.filter(input => input.checked).map(input => input.value), ['CV']);
  vm.runInContext('applySounds();', context);
  assert.deepEqual(current.sounds.vowels, ['e']);
  assert.deepEqual(Object.keys(context.rulesErrors.sounds), []);
});

for (const routeChanged of [false, true]) test(routeChanged
  ? 'a cancelled editor load does not redirect a newer tab navigation'
  : 'changing languages during the first editor load cancels the stale scene and restores its route', async () => {
  let resolve;
  const pending = new Promise(done => { resolve = done; });
  const nodes = new Map(), get = id => { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); };
  let currentId = 'first', opened = 0;
  const routes = [];
  const context = vm.createContext({
    $: get, makerEpoch: 0, makerLoading: pending, sceneMaker: null, makerOpen: false, view: 'world',
    language: () => ({ id: currentId }), sceneId: 'bakery', episodeSelections: {},
    currentScene: () => ({ choice: false }), player: { pause() {}, choiceId: null }, textAudio: { stop() {} },
    document: { querySelector: () => node(), querySelectorAll: () => [] },
    showView(view, options) { routes.push({ view, options }); }, notify() {}, closeMakerView() {},
  });
  vm.runInContext(section('async function openMaker(', "$('remix-scene').onclick"), context);
  const opening = vm.runInContext('openMaker(true)', context);
  currentId = 'second';
  if (routeChanged) { context.makerEpoch++; context.view = 'words'; }
  resolve({ open() { opened++; } });
  await opening;
  assert.equal(opened, 0, 'a remix requested for the previous language must not open');
  assert.equal(context.makerOpen, false);
  assert.equal(routes.length, routeChanged ? 0 : 1);
  if (!routeChanged) {
    assert.equal(routes[0].view, 'world');
    assert.equal(routes[0].options.replace, true);
  }
});

test('opening and closing the scene editor restores focus to its navigation tab', async () => {
  let focused = '', opened = 0;
  const nodes = new Map(), get = id => {
    if (!nodes.has(id)) nodes.set(id, { ...node(), focus() { focused = id; } });
    return nodes.get(id);
  };
  const heading = node(), shell = node(), routes = [];
  get('view-world').querySelector = selector => selector === '.page-heading' ? heading : null;
  const context = vm.createContext({
    $: get, makerEpoch: 0, makerLoading: Promise.resolve({ open() { opened++; } }),
    sceneMaker: null, makerOpen: false, view: 'world', changingView: false,
    language: () => ({ id: 'first' }), sceneId: 'bakery', episodeSelections: {},
    currentScene: () => ({ choice: false }), player: { pause() {} }, textAudio: { stop() {} },
    worldPreviewAvailable: () => false, matchMedia: () => ({ matches: false }),
    document: { querySelector: selector => selector === '.shell' ? shell : null, querySelectorAll: () => [] },
    showView(view) { routes.push(view); }, notify(message) { assert.fail(message); },
  });
  vm.runInContext(section('function closeMakerView(', "$('remix-scene').onclick"), context);
  await vm.runInContext('openMaker()', context);
  assert.equal(opened, 1);
  assert.equal(heading.hidden, true);
  assert.equal(get('world-browser').hidden, true);
  vm.runInContext('closeMakerView()', context);
  assert.equal(heading.hidden, false);
  assert.equal(get('world-browser').hidden, false);
  assert.equal(focused, 'scene-editor-tab');
  assert.deepEqual(routes, ['world']);
});
