import { element } from './player-dom.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ScenePlayer } from '../src/scene-player.js';
import { createLanguage } from '../src/engine.js';
import { TextAudio } from '../src/text-audio.js';

// Substitute browser boundaries, retaining the real player, timeline and renderer.
function audioBoundary({ enabled = true, supported = true } = {}) {
  const listeners = new Set();
  return {
    enabled, supported, ready: true, calls: [], effects: [], stops: 0, destroys: 0, unlocks: 0,
    subscribe(callback) {
      listeners.add(callback);
      callback(this);
      return () => listeners.delete(callback);
    },
    setEnabled(value) { this.enabled = Boolean(value); for (const callback of listeners) callback(this); },
    async unlock() { this.unlocks++; },
    blip(character, voiceId) { this.calls.push([character, voiceId]); },
    effect(name) { if (this.ready) this.effects.push(name); },
    playText() {},
    stop() { this.stops++; },
    destroy() { this.destroys++; },
    get subscribers() { return listeners.size; },
  };
}

function fixture(t, audio = audioBoundary(), { reduced = false } = {}) {
  let player;
  t.after(() => { if (player && !player.destroyed) player.destroy(); });
  const document = element();
  document.hidden = false;
  const motion = element();
  motion.matches = reduced;
  class Observer {
    constructor(callback) { this.callback = callback; }
    observe() {}
    disconnect() {}
  }
  const globals = { document, matchMedia: () => motion, ResizeObserver: Observer,
    IntersectionObserver: Observer, requestAnimationFrame: () => 1, cancelAnimationFrame() {} };
  for (const [name, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    t.after(() => original ? Object.defineProperty(globalThis, name, original) : delete globalThis[name]);
  }
  const language = createLanguage({ name: 'Luma', seed: 'scene-audio', preset: 'soft' });
  player = new ScenePlayer(element(), { getLanguage: () => language, textAudio: audio });
  player.visible = true;
  player.lastTime = 1000;
  const line = text => {
    player.dialogue[0].text = text;
    player.elapsed = 0;
    player.previousIndex = -1;
    player.render();
    player.lastTime = 1000;
  };
  const advance = (milliseconds = 43) => player.tick(player.lastTime + milliseconds);
  return { player, audio, document, motion, language, line, advance };
}

test('contact cues play once at contact, remain silent during redraw and replay after restart', t => {
  const {player,audio} = fixture(t);
  const contact = player.timing.offerStart + 385;
  player.elapsed = contact - 10; player.render();
  player.elapsed = contact + 10; player.render({audible:true});
  assert.deepEqual(audio.effects, ['thud']);
  player.render({audible:true}); player.render();
  assert.deepEqual(audio.effects, ['thud']);
  player.replay();
  player.elapsed = contact - 10; player.render();
  player.elapsed = contact + 10; player.render({audible:true});
  assert.deepEqual(audio.effects, ['thud','thud']);
});

test('muted, hidden, paused and locked playback never backfills contacts when resumed', t => {
  const {player,audio,document} = fixture(t);
  const contact = player.timing.offerStart + 385;
  for (const state of ['muted','hidden','paused','locked']) {
    player.elapsed = contact - 10; player.render();
    audio.setEnabled(state !== 'muted'); document.hidden = state === 'hidden';
    player.paused = state === 'paused'; audio.ready = state !== 'locked';
    player.elapsed = contact + 10; player.render({audible:true});
    audio.setEnabled(true); document.hidden=false; player.paused=false; audio.ready=true;
    player.elapsed += 10; player.render({audible:true});
  }
  assert.deepEqual(audio.effects, []);
});

test('reduced motion suppresses footsteps but keeps the semantic contact cue', t => {
  const {player,audio} = fixture(t, audioBoundary(), {reduced:true});
  player.paused=false;
  player.elapsed=130; player.render(); player.elapsed=150; player.render({audible:true});
  const contact=player.timing.offerStart+385;
  player.elapsed=contact-10; player.render(); player.elapsed=contact+10; player.render({audible:true});
  assert.deepEqual(audio.effects,['thud']);
});

// Keep the real burst scheduler and PCM synthesis; substitute only Web Audio
// output and the clock so a source that is started and immediately stopped fails.
function realAudioFixture(t, { reduced = true } = {}) {
  let time = 1000, nextTimer = 0;
  const timers = new Map(), outputs = [];
  const later = (callback, delay) => {
    const id = ++nextTimer;
    timers.set(id, { callback, at: time + delay });
    return id;
  };
  class AudioContext extends EventTarget {
    state = 'running';
    sampleRate = 22050;
    destination = {};
    get currentTime() { return time / 1000; }
    async close() { this.state = 'closed'; }
    createBuffer(channels, length, sampleRate) {
      const samples = new Float32Array(length);
      return { duration: length / sampleRate, getChannelData: () => samples };
    }
    createBufferSource() {
      return {
        connect(destination) { this.destination = destination; },
        disconnect() {},
        start() {
          this.at = time;
          outputs.push(this);
          this.endTimer = later(() => this.onended?.(), this.buffer.duration * 1000);
        },
        stop() { this.stoppedAt = time; timers.delete(this.endTimer); },
      };
    }
  }
  const audio = new TextAudio({ AudioContext, document: null, window: null, storage: null,
    now: () => time, setTimeout: later, clearTimeout: id => timers.delete(id) });
  const f = fixture(t, audio, { reduced });
  t.after(() => audio.destroy());
  const advance = milliseconds => {
    const end = time + milliseconds;
    while (time < end) {
      const frame = Math.min(time + 16, end);
      for (;;) {
        const next = [...timers].filter(([, timer]) => timer.at <= frame).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        time = next[1].at; timers.delete(next[0]); next[1].callback();
      }
      time = frame;
      f.player.tick(time);
    }
  };
  return { ...f, outputs, advance };
}

test('natural reveals send audible Unicode characters and current voice to shared audio', t => {
  const { player, audio, line, advance } = fixture(t);
  line('A, 𐐀é!');
  for (let i = 0; i < 6; i++) advance();
  assert.deepEqual(audio.calls, [['A', 'moss'], ['𐐀', 'moss'], ['é', 'moss']]);
  assert.equal(player.el.text.textContent, '* A, 𐐀é!');
});

test('speed changes reveal every new character without resounding on redraw or after text ends', t => {
  const { player, audio, line, advance } = fixture(t);
  line('AB');
  player.setSpeed(2);
  advance();
  assert.deepEqual(audio.calls, [['A', 'moss'], ['B', 'moss']]);
  player.render();
  player.resize.callback();
  for (let i = 0; i < 10; i++) advance();
  assert.equal(audio.calls.length, 2, 'The completed line stays quiet while its scene time continues');
  assert.equal(player.visibleChars, 2, 'Reveal count cannot grow past the displayed text');
});

test('initial renders, manual redraws and enabling reduced motion are silent', t => {
  const { player, audio, line, advance, motion } = fixture(t);
  assert.deepEqual(audio.calls, []);
  line('ABC');
  player.elapsed = 86;
  player.render();
  assert.deepEqual(audio.calls, []);
  advance();
  assert.deepEqual(audio.calls, [['C', 'moss']]);
  audio.calls.length = 0;
  line('DEF');
  motion.matches = true;
  motion.dispatchEvent(new Event('change'));
  advance();
  assert.deepEqual(audio.calls, []);
  assert.equal(player.el.text.textContent, '* DEF');
});

test('explicit reduced-motion playback emits one bounded voice burst while text stays fully visible', async t => {
  const { player, audio, line, advance, outputs } = realAudioFixture(t);
  const text = 'A'.repeat(100);
  line(text);
  await audio.unlock();
  assert.equal(player.el.text.textContent, `* ${text}`);
  player.render(); player.resize.callback(); advance(160);
  assert.equal(outputs.length, 0, 'Initial display and paused redraws stay silent');

  player.el.pause.dispatchEvent(new Event('click'));
  advance(1500);
  assert.ok(outputs.length > 10 && outputs.length <= 30, 'One short burst reaches the real audio output');
  const started = outputs[0].at;
  for (const source of outputs) {
    assert.ok(source.at + source.buffer.duration * 1000 <= started + 1200);
    assert.equal(source.stoppedAt, undefined, 'Rendering must not truncate a blip');
    assert.ok(source.buffer.getChannelData(0).some(sample => Math.abs(sample) > 0.005));
  }
  const count = outputs.length;
  player.render(); player.resize.callback(); advance(1000);
  assert.equal(outputs.length, count, 'Frames and redraws do not restart the same line');
  assert.equal(player.el.text.textContent, `* ${text}`);
});

test('reduced-motion playback starts a new burst with the next speaker on a natural line transition', async t => {
  const { player, audio, line, advance, outputs } = realAudioFixture(t);
  line('AB'); player.dialogue[1].text = 'CDE';
  await audio.unlock(); player.play(); advance(160);
  assert.equal(outputs.length, 2);
  assert.ok(Math.abs(outputs[0].buffer.duration - 0.049) < 0.001, 'Moss speaks the first line');
  player.elapsed = player.dialogue[0].end - 1;
  player.render();
  advance(200);
  assert.equal(outputs.length, 5);
  assert.ok(Math.abs(outputs[2].buffer.duration - 0.054) < 0.001, 'Kiln speaks the next line');
  assert.equal(player.el.text.textContent, '* CDE');
});

test('pause and mute cancel reduced-motion bursts and an explicit resume can voice the current line', async t => {
  const { player, audio, line, advance, outputs } = realAudioFixture(t);
  line('A'.repeat(100));
  await audio.unlock(); player.play(); advance(200);
  assert.ok(outputs.length > 0);
  player.pause();
  const pausedCount = outputs.length;
  advance(500); player.render();
  assert.equal(outputs.length, pausedCount);
  assert.ok(outputs.some(source => source.stoppedAt !== undefined));
  player.play(); advance(200);
  assert.ok(outputs.length > pausedCount);
  audio.setEnabled(false);
  const mutedCount = outputs.length;
  advance(1500);
  assert.equal(outputs.length, mutedCount);
});

test('focusing a dialogue word cancels the reduced-motion burst while the timeline is held', async t => {
  const { player, audio, document, line, advance, outputs } = realAudioFixture(t);
  line('A'.repeat(100));
  await audio.unlock(); player.play(); advance(200);
  const count = outputs.length, elapsed = player.elapsed;
  assert.ok(count > 0);
  const word = player.el.text.querySelector('[data-scene-fragment="0"]');
  word.focus();
  // The minimal DOM boundary does not bubble focus events from descendants.
  player.el.text.dispatchEvent(new Event('focusin'));
  advance(400); player.render();
  assert.equal(player.elapsed, elapsed, 'Word inspection holds scene time');
  assert.equal(outputs.length, count, 'The held line cannot keep scheduling audio');
  assert.ok(outputs.some(source => source.stoppedAt !== undefined), 'Focus cancels the active blip as well as pending audio');
  document.activeElement = null;
  advance(100);
  assert.ok(player.elapsed > elapsed, 'Leaving the word resumes the timeline');
  assert.equal(outputs.length, count, 'Leaving focus does not restart the cancelled burst');
});

test('crossing a line boundary starts fresh with the new speaker', t => {
  const { player, audio, line, advance } = fixture(t);
  line('A');
  player.dialogue[1].text = 'é𐐀';
  player.elapsed = player.dialogue[0].end - 1;
  player.render();
  advance(44);
  assert.deepEqual(audio.calls, [['é', 'kiln']]);
  advance();
  assert.deepEqual(audio.calls, [['é', 'kiln'], ['𐐀', 'kiln']]);
});

test('reveal-all and next-line controls cancel pending audio without sounding skipped text', t => {
  const { player, audio, line, advance } = fixture(t);
  line('ABCD');
  advance();
  const stops = audio.stops;
  player.next();
  assert.equal(player.el.text.textContent, '* ABCD');
  assert.ok(audio.stops > stops);
  assert.deepEqual(audio.calls, [['A', 'moss']]);
  advance();
  player.next();
  assert.equal(player.index, 1);
  assert.deepEqual(audio.calls, [['A', 'moss']]);
});

test('pause, document hiding and leaving the viewport silence and cancel scene playback', t => {
  const { player, audio, line, advance, document } = fixture(t);
  line('ABC');
  const stops = audio.stops;
  player.pause();
  advance();
  assert.deepEqual(audio.calls, []);
  assert.ok(audio.stops > stops);
  player.play();
  player.lastTime = 1000;
  document.hidden = true;
  document.dispatchEvent(new Event('visibilitychange'));
  const hiddenStops = audio.stops;
  assert.ok(hiddenStops > stops + 1);
  advance();
  assert.deepEqual(audio.calls, []);
  document.hidden = false;
  player.intersection.callback([{ isIntersecting: false }]);
  assert.ok(audio.stops > hiddenStops);
  advance();
  assert.deepEqual(audio.calls, []);
});

test('refresh, replay, scene change and episode end cancel old audio without bursts', t => {
  const { player, audio, line } = fixture(t);
  line('ABC');
  player.elapsed = 86;
  player.render();
  let stops = audio.stops;
  player.refresh();
  assert.ok(audio.stops > stops);
  assert.deepEqual(audio.calls, []);
  stops = audio.stops;
  player.replay();
  assert.ok(audio.stops > stops);
  stops = audio.stops;
  player.setScene('library');
  assert.ok(audio.stops > stops);
  stops = audio.stops;
  player.elapsed = player.duration - 1;
  player.lastTime = 1000;
  player.tick(1090);
  assert.ok(audio.stops > stops);
  assert.deepEqual(audio.calls, []);
});

test('scene toggle reflects shared state and only enabling requests audio unlock', t => {
  const { player, audio } = fixture(t);
  assert.equal(player.el.sound.textContent, 'SFX ON');
  assert.equal(player.el.sound.attributes['aria-label'], 'Mute text sounds');
  assert.equal(player.el.sound.attributes['aria-pressed'], 'true');
  audio.setEnabled(false);
  assert.equal(player.sound, false);
  assert.equal(player.el.sound.textContent, 'SFX OFF');
  assert.equal(player.el.sound.attributes['aria-label'], 'Enable text sounds');
  player.el.sound.dispatchEvent(new Event('click'));
  assert.equal(audio.enabled, true);
  assert.equal(audio.unlocks, 1);
  player.el.sound.dispatchEvent(new Event('click'));
  assert.equal(audio.enabled, false);
  assert.equal(audio.unlocks, 1);
});

test('destroy unsubscribes and cancels audio without destroying the injected shared controller', t => {
  const { player, audio } = fixture(t);
  assert.equal(audio.subscribers, 1);
  const stops = audio.stops;
  player.destroy();
  assert.equal(audio.subscribers, 0);
  assert.ok(audio.stops > stops);
  assert.equal(audio.destroys, 0);
});

test('the scene sound button starts a waiting voice instead of muting it', t => {
  const audio = audioBoundary();
  audio.ready = false;
  const { player } = fixture(t, audio);
  assert.equal(player.el.sound.attributes['aria-pressed'], 'false');
  assert.equal(player.el.sound.attributes['aria-label'], 'Enable text sounds');
  player.el.sound.dispatchEvent(new Event('click'));
  assert.equal(audio.enabled, true);
  assert.equal(audio.unlocks, 1);
});

test('a standalone player destroys its owned controller and cannot reactivate it', t => {
  const { player } = fixture(t, null);
  const owned = player.textAudio;
  owned.setEnabled(false);
  player.destroy();
  owned.setEnabled(true);
  assert.equal(owned.enabled, false);
});

test('unavailable audio disables the scene toggle while dialogue remains usable', t => {
  const { player, audio, line, advance } = fixture(t, audioBoundary({ supported: false }));
  assert.equal(player.el.sound.disabled, true);
  assert.equal(player.el.sound.textContent, 'SFX OFF');
  line('A');
  advance();
  assert.equal(player.el.text.textContent, '* A');
  assert.deepEqual(audio.calls, []);
});
