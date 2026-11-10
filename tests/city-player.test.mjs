import test from 'node:test';
import assert from 'node:assert/strict';
import { createLanguage } from '../src/engine.js';
import { TextAudio } from '../src/text-audio.js';
import { browserBoundary, audioBoundary, BrowserElement } from './city-player-dom.mjs';

const api = await import('../src/world-preset-player.js').catch(error => ({ loadError: error.message }));
const presets = await import('../src/world-presets.js').catch(error => ({ loadError: error.message }));
function fixture(t, options = {}) {
  assert.equal(typeof api.WorldPresetPlayer, 'function', api.loadError || 'WorldPresetPlayer must implement the World lifecycle');
  let player;
  t.after(() => player?.destroy());
  const browser = browserBoundary(t, options), audio = options.audio || audioBoundary();
  let language = createLanguage({ name: 'City test', seed: 'city-player', preset: 'soft' });
  const selected = [];
  player = new api.WorldPresetPlayer(browser.host, { preset: options.preset || presets.getWorldPreset('city'), getLanguage: () => language, textAudio: audio,
    onWordSelect: token => selected.push(token) });
  player.intersection.callback([{ isIntersecting: true }]); browser.frame(0);
  return { ...browser, player, audio, language, selected, changeLanguage(value) { language = value; player.refresh(); } };
}

test('all four presets render their own cast and translated dialogue through one player', t => {
  assert.equal(typeof presets.getWorldPreset, 'function', presets.loadError);
  assert.deepEqual(presets.WORLD_PRESETS.map(preset => preset.id), ['city', 'apartments', 'nightmarket', 'train']);
  let active;
  t.after(() => active?.destroy());
  const { host, player, audio, language } = fixture(t);
  player.pause(); player.setEnglish(false);
  active = player;
  for (const preset of presets.WORLD_PRESETS.slice(1)) {
    const oldPause = active.el.pause, oldClock = active.backgroundTime;
    const paused = active.paused, english = active.english;
    active.destroy();
    active = new api.WorldPresetPlayer(host, { preset, getLanguage: () => language, textAudio: audio });
    active.setEnglish(english); if (paused) active.pause();
    assert.equal(host.querySelectorAll('.world-player').length, 1);
    assert.deepEqual([...active.actorNodes.keys()], preset.characters);
    assert.equal(active.el.stage.getAttribute('aria-label'), preset.description);
    assert.equal(active.el.location.textContent, preset.location.toUpperCase());
    active.next();
    assert.equal(active.el.translation.textContent, preset.lines[0].english);
    assert.equal(active.el.translation.hidden, true);
    assert.ok(active.el.text.querySelectorAll('button').length > 0);
    const stops = audio.stops;
    oldPause.dispatchEvent(new Event('click'));
    assert.equal(audio.stops, stops, 'Destroyed controls cannot change the shared audio');
    assert.equal(active.paused, true);
    assert.ok(Number.isFinite(oldClock));
  }
});

test('a sliding train bag keeps its SVG node while its position changes', t => {
  assert.equal(typeof presets.getWorldPreset, 'function', presets.loadError);
  const { player, advance } = fixture(t, { preset: presets.getWorldPreset('train') });
  for (let line = 0; line < 3; line++) { player.next(); player.next(); }
  const bag = player.el.props.children.find(element => element.dataset.prop === 'rolling-bag');
  assert.ok(bag, 'The carriage has luggage in its aisle');
  const left = bag.style.left, writes = bag.htmlWrites;
  advance(100);
  assert.equal(player.el.props.children.find(element => element.dataset.prop === 'rolling-bag'), bag);
  assert.notEqual(bag.style.left, left);
  assert.equal(bag.htmlWrites, writes, 'Movement alone cannot rebuild the SVG');
  player.pause(); const pausedLeft = bag.style.left; advance(100);
  assert.equal(bag.style.left, pausedLeft);
});

test('World controls retain references when the app moves toolbar labels outside the host', t => {
  const { player, host, advance } = fixture(t);
  assert.equal(host.querySelectorAll('.city-resident').length, 8);
  assert.equal(host.querySelectorAll('.city-bubble').length, 1);
  const toolbar = new BrowserElement(); toolbar.append(player.el.location, player.el.status);
  player.pause(); assert.match(player.el.status.textContent, /PAUSED/);
  const before = player.backgroundTime; advance(500); assert.equal(player.backgroundTime, before);
  player.play(); advance(300); assert.ok(player.backgroundTime > before);
  assert.equal(host.querySelector('.scene-next'), player.el.next);
});

test('refresh preserves resident time and line identity while updated words remain literal inspectable text', t => {
  const { player, language, changeLanguage, selected, advance, audio } = fixture(t);
  advance(800); player.next(); player.next(); advance(350); player.pause();
  const index = player.index, worldTime = player.backgroundTime, calls = audio.calls.length;
  const key = player.current.tokens.find(token => token.kind === 'word').key;
  const edited = structuredClone(language);
  edited.words.find(word => word.english === key).word = '<img src=x onerror=boom>𐐀';
  edited.script.direction = 'rtl';
  changeLanguage(edited); player.next();
  assert.equal(player.index, index); assert.equal(player.backgroundTime, worldTime);
  assert.equal(audio.calls.length, calls, 'A language redraw cannot voice skipped characters');
  assert.equal(player.el.text.getAttribute('dir'), 'rtl');
  const word = player.el.text.querySelectorAll('button').find(node => node.textContent.includes('<img'));
  assert.ok(word, 'The edited word is present as literal text');
  assert.equal(word.innerHTML, ''); assert.equal(word.children.length, 0);
  word.dispatchEvent(new Event('click'));
  assert.equal(selected[0].key, key); assert.ok(selected[0].end > selected[0].start);
});

test('natural typewriting voices only new characters and live transcript changes once per line', t => {
  const { player, audio, advance } = fixture(t);
  const initialWrites = player.el.accessible.writes;
  const first = [...player.current.text][0];
  advance(43); assert.equal(player.el.text.textContent, first);
  assert.deepEqual(audio.calls, [[first, player.current.speaker]]);
  advance(129); assert.equal(player.el.accessible.writes, initialWrites);
  const calls = audio.calls.length; player.render(); player.resize.callback();
  assert.equal(audio.calls.length, calls);
  player.next(); assert.equal(player.el.text.textContent, player.current.text);
  player.next(); assert.equal(player.el.accessible.writes, initialWrites + 1);
});

test('paused, document-hidden, offscreen, page-blurred and word-focused scenes hold both clocks and stop audio', t => {
  const { player, audio, document, window, advance } = fixture(t);
  advance(129); player.next();
  const word = player.el.text.querySelector('button');
  for (const state of ['pause', 'hidden', 'offscreen', 'blur', 'word']) {
    const stops = audio.stops;
    if (state === 'pause') player.pause();
    if (state === 'hidden') { document.hidden = true; document.dispatchEvent(new Event('visibilitychange')); }
    if (state === 'offscreen') player.intersection.callback([{ isIntersecting: false }]);
    if (state === 'blur') window.dispatchEvent(new Event('blur'));
    if (state === 'word') word.focus();
    const time = player.backgroundTime, elapsed = player.elapsed, count = audio.calls.length;
    advance(1000);
    assert.equal(player.backgroundTime, time, state); assert.equal(player.elapsed, elapsed, state);
    assert.equal(audio.calls.length, count, state); assert.ok(audio.stops > stops, state);
    if (state === 'pause') player.play();
    if (state === 'hidden') { document.hidden = false; document.dispatchEvent(new Event('visibilitychange')); }
    if (state === 'offscreen') player.intersection.callback([{ isIntersecting: true }]);
    if (state === 'blur') window.dispatchEvent(new Event('focus'));
    if (state === 'word') player.el.next.focus();
    advance(86);
  }
});

test('muted, unsupported and locked audio never queues speech or backfills skipped text', t => {
  const { player, audio, advance } = fixture(t);
  for (const state of ['muted', 'unsupported', 'locked']) {
    player.replayLine();
    audio.setEnabled(state !== 'muted'); audio.supported = state !== 'unsupported'; audio.ready = state !== 'locked';
    advance(430); const count = audio.calls.length;
    assert.equal(count, 0, state); assert.equal(audio.bursts.length, 0, state);
    audio.setEnabled(true); audio.supported = true; audio.ready = true;
    player.render(); assert.equal(audio.calls.length, 0);
  }
  advance(43); assert.ok(audio.calls.length <= 1, 'Only a newly revealed character can sound');
});

test('negative timestamps and long suspension cannot rewind or jump through city life', t => {
  const { player, frame, advance } = fixture(t);
  advance(100); const before = player.backgroundTime;
  frame(-500); assert.equal(player.backgroundTime, before);
  frame(200000); assert.ok(player.backgroundTime >= before && player.backgroundTime <= before + 100);
  assert.equal(player.index, 0);
});

test('unchanged artwork and the anchored bubble survive ordinary frames without replacement or layout reads', t => {
  const { player, host, advance } = fixture(t);
  const actors = host.querySelectorAll('.city-resident');
  const writes = actors.map(actor => actor.htmlWrites);
  const measurements = [player.el.stage.measurements, player.el.bubble.measurements];
  player.render(); player.render(); advance(86);
  assert.deepEqual(actors.map(actor => actor.htmlWrites), writes, 'SVG serialization must not invalidate the artwork cache');
  assert.deepEqual([player.el.stage.measurements, player.el.bubble.measurements], measurements, 'Fixed anchors need layout only when content or size changes');
});

test('narrow stages dock speech below the city and resizing back restores the anchored bubble', t => {
  const { player } = fixture(t);
  const wideBounds = player.el.stage.getBoundingClientRect.bind(player.el.stage);
  player.el.stage.getBoundingClientRect = () => ({ width: 390, height: 243.75 });
  player.resize.callback();
  assert.ok(player.el.bubble.parentNode === player.root);
  assert.match(player.el.bubble.className, /city-bubble-docked/);
  assert.equal(player.el.leader.hidden, true);
  const children = player.root.children;
  assert.ok(children.indexOf(player.el.stage) < children.indexOf(player.el.bubble));
  assert.ok(children.indexOf(player.el.bubble) < children.indexOf(player.el.accessible));
  player.el.next.dispatchEvent(new Event('click')); assert.equal(player.el.text.textContent, player.current.text);
  player.el.stage.getBoundingClientRect = wideBounds; player.resize.callback();
  assert.ok(player.el.bubble.parentNode === player.el.stage); assert.equal(player.el.leader.hidden, false);
  assert.equal(player.el.bubble.className.includes('city-bubble-docked'), false);
});

test('speech docks when its measured height would cover the current speaker', t => {
  const { player } = fixture(t);
  player.pause();
  player.el.stage.getBoundingClientRect = () => ({ width: 478, height: 298.75 });
  // This height fits above Moss, but not the baker's higher anchor.
  let measuredHeight = 90;
  player.el.bubble.getBoundingClientRect = () => ({ width: 334.6, height: measuredHeight });
  player.resize.callback();
  assert.equal(player.el.bubble.parentNode, player.el.stage, 'Speech fits above the initial speaker');
  player.next(); player.next();
  assert.equal(player.current.speaker, 'kiln');
  assert.equal(player.el.bubble.parentNode, player.root, 'Speech must move below the scene instead of hiding Kiln');
  assert.equal(player.el.leader.hidden, true);
  const line = player.index, time = player.backgroundTime;
  // The default Velka baker line measures this high at a 700px viewport.
  measuredHeight = 148.2; player.resize.callback();
  assert.equal(player.el.bubble.parentNode, player.root);
  measuredHeight = 72; player.resize.callback();
  assert.equal(player.el.bubble.parentNode, player.el.stage, 'A fitting line can return above its speaker');
  const bottom = Number.parseFloat(player.el.bubble.style.top) + measuredHeight;
  assert.ok(bottom < 107 / 512 * 478, 'The bubble must finish above the top of Kiln’s sprite');
  assert.equal(player.el.leader.hidden, false);
  assert.equal(player.index, line); assert.equal(player.backgroundTime, time);
});

test('a turning prop redraws its facing immediately without replacing its node', t => {
  const preset = { ...presets.getWorldPreset('nightmarket'), renderProp: prop => `<svg data-facing="${prop.direction}"></svg>` };
  const { player } = fixture(t, { preset });
  const prop = { id: 'cat', type: 'market-cat', x: 258, y: 160, frame: 3, direction: 1 };
  player.renderProps([prop]);
  const element = player.el.props.children[0];
  player.renderProps([{ ...prop, direction: -1 }]);
  assert.equal(player.el.props.children[0], element);
  assert.match(element.innerHTML, /data-facing="-1"/);
});

test('docked dialogue keeps playing when only the map scrolls away and stops when the entire player leaves view', t => {
  const { player, advance } = fixture(t);
  player.el.stage.getBoundingClientRect = () => ({ width: 390, height: 243.75 });
  player.resize.callback();
  // The browser reports intersection for the actual observed element. The map
  // is above the viewport while its docked speech and controls remain visible.
  const visibility = new Map([[player.el.stage, false], [player.root, true]]);
  player.intersection.callback([{ target: player.intersection.target,
    isIntersecting: visibility.get(player.intersection.target) }]);
  const before = player.visibleChars;
  advance(129);
  assert.ok(player.visibleChars > before, 'Visible docked dialogue must keep revealing text');
  const time = player.backgroundTime, chars = player.visibleChars;
  player.intersection.callback([{ target: player.intersection.target, isIntersecting: false }]);
  advance(129);
  assert.equal(player.backgroundTime, time); assert.equal(player.visibleChars, chars);
});

test('reduced motion is initially paused, fixes resident positions and voices each explicitly played line once', t => {
  const { player, audio, advance, host } = fixture(t, { reduced: true });
  assert.equal(player.paused, true); assert.equal(player.el.text.textContent, player.current.text);
  const position = host.querySelectorAll('.city-resident').map(node => [node.style.left, node.style.top, node.innerHTML]);
  advance(500); assert.equal(audio.bursts.length, 0);
  player.play(); advance(200); assert.equal(audio.bursts.length, 1);
  assert.ok(audio.bursts[0].maxDuration > 0 && audio.bursts[0].maxDuration <= 1200);
  player.render(); player.resize.callback(); advance(300); assert.equal(audio.bursts.length, 1);
  assert.deepEqual(host.querySelectorAll('.city-resident').map(node => [node.style.left, node.style.top, node.innerHTML]), position);
  player.next(); advance(86); assert.equal(audio.bursts.length, 2);
  player.pause(); const count = audio.bursts.length; advance(500); assert.equal(audio.bursts.length, count);
});

test('long custom words stay complete and keyboard inspectable inside a measured scrollable bubble', t => {
  const { player, language, changeLanguage, host } = fixture(t, { reduced: true });
  const key = player.current.tokens.find(token => token.kind === 'word').key;
  const edited = structuredClone(language); edited.words.find(word => word.english === key).word = '𐐀'.repeat(600);
  changeLanguage(edited);
  const bubble = host.querySelector('.city-bubble'), word = player.el.text.querySelectorAll('button').find(node => [...node.textContent].length >= 600);
  assert.ok(word); assert.equal(word.disabled, false); assert.ok(player.el.text.textContent.includes('𐐀'.repeat(600)));
  word.focus(); assert.equal(player.hasWordFocus(), true);
  assert.ok(Number.parseFloat(bubble.style.maxHeight) <= 260);
  assert.equal(bubble.parentNode, player.root, 'Tall speech remains available below the scene');
  assert.equal(player.el.leader.hidden, true);
});

test('overflowing dialogue waits for Next after reveal while street activity continues', t => {
  const { player, language, changeLanguage, advance } = fixture(t);
  const key = player.current.tokens.find(token => token.kind === 'word').key;
  const edited = structuredClone(language); edited.words.find(word => word.english === key).word = '𐐀'.repeat(200);
  changeLanguage(edited);
  // Layout boundary: the real browser reports scroll overflow after wrapping.
  player.el.bubble.scrollHeight = 900; player.el.bubble.clientHeight = 160; player.resize.callback();
  const duration = player.current.duration;
  advance(duration + 3000);
  assert.equal(player.index, 0, 'A long line cannot vanish before the user has scrolled through it');
  assert.equal(player.el.text.textContent, player.current.text);
  assert.match(player.el.hint.textContent, /Scroll to read.*Next line to continue/);
  const time = player.backgroundTime, elapsed = player.elapsed;
  advance(1000); assert.ok(player.backgroundTime > time); assert.equal(player.elapsed, elapsed);
  player.next(); assert.equal(player.index, 1);
});

test('destroy releases observers, frame and listeners while preserving the shared audio controller', t => {
  const { player, audio, frames, document, window, motion, advance } = fixture(t);
  const oldPause = player.el.pause;
  advance(86); const stops = audio.stops;
  player.destroy(); player.destroy();
  assert.equal(frames.size, 0); assert.equal(audio.subscribers, 0); assert.equal(audio.destroys, 0);
  assert.ok(audio.stops > stops); assert.equal(player.intersection.disconnected, true); assert.equal(player.resize.disconnected, true);
  for (const target of [document, window, motion, oldPause]) {
    assert.equal([...target.listeners.values()].reduce((sum, listeners) => sum + listeners.size, 0), 0);
  }
  const count = audio.calls.length, destroyedStops = audio.stops;
  oldPause.dispatchEvent(new Event('click')); document.dispatchEvent(new Event('visibilitychange')); advance(500);
  assert.equal(audio.calls.length, count); assert.equal(audio.stops, destroyedStops);
});

test('a natural line transition keeps pedestrians moving while a replay restarts only the current speech', t => {
  const { player, advance } = fixture(t);
  const duration = player.current.duration;
  advance(duration + 86);
  assert.equal(player.index, 1);
  assert.equal(player.backgroundTime, duration + 86);
  assert.equal(player.elapsed, 86);
  const time = player.backgroundTime;
  player.replayLine();
  assert.equal(player.index, 1); assert.equal(player.elapsed, 0); assert.equal(player.backgroundTime, time);
  player.replay(); assert.equal(player.index, 0); assert.equal(player.backgroundTime, 0);
});

test('grammar and expanded writing symbols reach word buttons with the correct inspection metadata', t => {
  const { player, language, changeLanguage, selected } = fixture(t, { reduced: true });
  const edited = structuredClone(language);
  edited.words = edited.words.map(word => ({ ...word, word: word.english }));
  edited.grammar = { order: 'SOV', adjective: 'before', plural: 'PL', past: 'PAST', future: 'FUT', question: 'Q', negative: 'NEG' };
  edited.script = { style: 'custom', direction: 'rtl', glyphs: { a: '𐐀◇' } };
  changeLanguage(edited);
  assert.equal(player.el.text.textContent, 'd𐐀◇mn, i my w𐐀◇llet P𐐀◇ST forget!');
  const wallet = player.el.text.querySelectorAll('button').find(word => word.textContent === 'w𐐀◇llet');
  wallet.dispatchEvent(new Event('click'));
  assert.equal(selected[0].key, 'wallet'); assert.equal(selected[0].wordId, 'wallet');
  assert.equal(selected[0].end - selected[0].start, 7);
});

// Real speech scheduling and PCM synthesis, substituting only Web Audio output
// and time. This catches sources started and immediately cancelled by redraws.
function realAudio(t) {
  let time = 1000, timerId = 0;
  const timers = new Map(), outputs = [];
  const later = (callback, delay) => { const id = ++timerId; timers.set(id, { callback, at: time + delay }); return id; };
  class AudioContext extends EventTarget {
    state = 'running'; sampleRate = 22050; destination = {};
    get currentTime() { return time / 1000; }
    async close() { this.state = 'closed'; }
    createBuffer(channels, length, rate) { const data = new Float32Array(length); return { duration: length / rate, getChannelData: () => data }; }
    createBufferSource() {
      return { connect() {}, disconnect() {},
        start() { outputs.push(this); this.timer = later(() => this.onended?.(), this.buffer.duration * 1000); },
        stop() { this.stopped = true; timers.delete(this.timer); } };
    }
  }
  const audio = new TextAudio({ AudioContext, document: null, window: null, storage: null,
    now: () => time, setTimeout: later, clearTimeout: id => timers.delete(id) });
  const f = fixture(t, { reduced: true, audio }); t.after(() => audio.destroy());
  return { ...f, outputs, advance(milliseconds) {
    const end = time + milliseconds;
    while (time < end) {
      const previous = time, nextFrame = Math.min(time + 16, end);
      for (;;) {
        const next = [...timers].filter(([, timer]) => timer.at <= nextFrame).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        time = next[1].at; timers.delete(next[0]); next[1].callback();
      }
      time = nextFrame; f.frame(nextFrame - previous);
    }
  } };
}

test('real reduced-motion speech survives redraws and cancels on focus, hiding and player replacement', async t => {
  const { player, audio, outputs, document, host, language, advance } = realAudio(t);
  await audio.unlock(); player.play(); advance(150);
  assert.ok(outputs.length >= 3);
  assert.ok(outputs[0].buffer.getChannelData(0).some(sample => Math.abs(sample) > 0.005));
  const first = outputs[0]; player.render(); player.resize.callback();
  assert.equal(first.stopped, undefined, 'A redraw must leave the line burst playing');
  player.el.text.querySelector('button').focus();
  let count = outputs.length; advance(300); assert.equal(outputs.length, count);
  assert.ok(outputs.some(source => source.stopped), 'Focused words cancel pending speech and live output');
  player.el.next.focus(); advance(200); assert.equal(outputs.length, count, 'Leaving focus cannot replay the burst');
  player.play(); advance(100); assert.ok(outputs.length > count);
  document.hidden = true; document.dispatchEvent(new Event('visibilitychange'));
  count = outputs.length; advance(200); assert.equal(outputs.length, count);
  document.hidden = false; document.dispatchEvent(new Event('visibilitychange'));
  player.play(); advance(100); player.destroy(); count = outputs.length;
  const next = new api.WorldPresetPlayer(host, { preset: presets.getWorldPreset('city'), getLanguage: () => language, textAudio: audio });
  try { advance(300); assert.equal(outputs.length, count, 'A new paused player cannot inherit pending speech'); }
  finally { next.destroy(); }
  assert.equal(audio._destroyed, false, 'Shared audio remains usable by subsequent players');
});
