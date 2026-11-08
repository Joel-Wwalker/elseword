import { element } from './player-dom.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ScenePlayer } from '../src/scene-player.js';
import { createLanguage } from '../src/engine.js';

// Substitute browser boundaries, retaining the real player, timeline and renderer.
function audioBoundary({ enabled = true, supported = true } = {}) {
  const listeners = new Set();
  return {
    enabled, supported, ready: true, calls: [], stops: 0, destroys: 0, unlocks: 0,
    subscribe(callback) {
      listeners.add(callback);
      callback(this);
      return () => listeners.delete(callback);
    },
    setEnabled(value) { this.enabled = Boolean(value); for (const callback of listeners) callback(this); },
    async unlock() { this.unlocks++; },
    blip(character, voiceId) { this.calls.push([character, voiceId]); },
    stop() { this.stops++; },
    destroy() { this.destroys++; },
    get subscribers() { return listeners.size; },
  };
}

function fixture(t, audio = audioBoundary()) {
  let player;
  t.after(() => { if (player && !player.destroyed) player.destroy(); });
  const document = element();
  document.hidden = false;
  const motion = element();
  motion.matches = false;
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

test('initial renders, manual redraws and reduced-motion reveals are silent', t => {
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
  advance();
  assert.deepEqual(audio.calls, []);
  assert.equal(player.el.text.textContent, '* DEF');
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
