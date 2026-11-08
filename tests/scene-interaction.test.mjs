import test from 'node:test';
import assert from 'node:assert/strict';
import { ScenePlayer } from '../src/scene-player.js';
import { createLanguage } from '../src/engine.js';
import { element } from './player-dom.mjs';

function fixture(t) {
  let player;
  t.after(() => player?.destroy());
  const document = element(); document.hidden = false;
  const motion = element(); motion.matches = false;
  class Observer { constructor(callback) { this.callback = callback; } observe() {} disconnect() {} }
  for (const [name, value] of Object.entries({ document, matchMedia: () => motion, ResizeObserver: Observer,
    IntersectionObserver: Observer, requestAnimationFrame: () => 1, cancelAnimationFrame() {} })) {
    const old = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    t.after(() => old ? Object.defineProperty(globalThis, name, old) : delete globalThis[name]);
  }
  const language = createLanguage({ name: 'Luma', seed: 'interactive-scenes', preset: 'soft' });
  const clicks = [];
  const audio = { enabled: false, supported: true, subscribe(fn) { fn(this); return () => {}; }, stop() {}, blip() {} };
  player = new ScenePlayer(element(), { getLanguage: () => language, textAudio: audio, onWordSelect: token => clicks.push(token) });
  player.visible = true;
  return { player, language, document, clicks, motion };
}

test('autoplay holds before a reply until a choice is explicitly selected', t => {
  const { player } = fixture(t);
  player.setScene('cafe', undefined, 'cold-tea');
  player.elapsed = player.dialogue[1].end - 20;
  player.lastTime = 1000;
  player.tick(1100);
  assert.equal(player.awaitingChoice, true);
  assert.equal(player.index, 1);
  assert.equal(player.paused, false, 'Waiting is separate from the playback preference');
  const held = player.elapsed;
  for (let i = 0; i < 20; i++) player.tick(1200 + i * 100);
  assert.equal(player.elapsed, held);
  player.chooseReply('wait');
  assert.equal(player.awaitingChoice, false);
  assert.equal(player.choiceId, 'wait');
  assert.equal(player.index, 2);
  assert.equal(player.current.english, 'I can wait.');
  assert.equal(player.paused, false);
});

test('next cannot skip the choice, paused selections remain paused, and English toggles choice glosses', t => {
  const { player } = fixture(t);
  player.setScene('library', undefined, 'lost-property');
  player.pause();
  player.next(); player.next();
  assert.equal(player.awaitingChoice, true);
  player.next();
  assert.equal(player.index, 0);
  player.setEnglish(false);
  assert.equal(player.choiceNodes[0].english.hidden, true);
  player.setEnglish(true);
  assert.equal(player.choiceNodes[0].english.hidden, false);
  player.chooseReply('claim');
  assert.equal(player.index, 1);
  assert.equal(player.paused, true);
});

test('word edits refresh the selected branch and replayLine retains it; replay and episode changes reset it', t => {
  const { player, language } = fixture(t);
  player.setScene('busstop', undefined, 'introductions');
  player.elapsed = player.dialogue[1].end;
  player.render();
  player.chooseReply('quiet-friend');
  const english = player.current.english;
  const key = player.current.tokens.find(token => token.kind === 'word').key;
  language.words.find(word => word.english === key).word = '𐐀test';
  player.refresh();
  assert.equal(player.choiceId, 'quiet-friend');
  assert.equal(player.current.english, english);
  assert.ok(player.current.text.includes('𐐀test'));
  player.replayLine();
  assert.equal(player.index, 2);
  assert.equal(player.elapsed, player.current.start);
  assert.equal(player.choiceId, 'quiet-friend');
  player.replay();
  assert.equal(player.choiceId, null);
  assert.equal(player.index, 0);
  player.setScene('bakery');
  assert.equal(player.awaitingChoice, false);
  assert.equal(player.el.choices.hidden, true);
});

test('completed words retain identity and exact token metadata; keyboard focus holds the timeline', t => {
  const { player, language, document, clicks } = fixture(t);
  language.words.find(word => word.english === 'bread').word = '𐐀loaf';
  player.refresh();
  const token = player.current.tokens.find(item => item.key === 'bread');
  player.elapsed = (token.end - 1) * 43;
  player.render();
  const part = player.textParts.find(item => item.token?.key === 'bread');
  const button = part.node;
  assert.equal(button.disabled, true);
  player.elapsed = token.end * 43;
  player.render();
  assert.equal(button.disabled, false);
  assert.equal(button.textContent, '𐐀loaf');
  button.dispatchEvent(new Event('click'));
  assert.deepEqual(clicks, [token]);
  button.focus();
  const time = player.elapsed;
  player.lastTime = 1000; player.tick(1100);
  assert.equal(player.elapsed, time);
  assert.equal(player.textParts.find(item => item.token?.key === 'bread').node, button);
  document.activeElement = null;
  player.tick(1200);
  assert.ok(player.elapsed > time);
});

test('a completed branch resets on automatic loop and invalid choices do not bypass the gate', t => {
  const { player, motion } = fixture(t);
  player.setScene('cafe', undefined, 'cold-tea');
  motion.matches = true;
  player.next(); player.next();
  player.next();
  assert.equal(player.awaitingChoice, true);
  player.chooseReply('invalid');
  assert.equal(player.awaitingChoice, true);
  player.chooseReply('wait');
  motion.matches = false;
  player.elapsed = player.duration - 1;
  player.lastTime = 1000; player.tick(1100);
  assert.equal(player.choiceId, null);
  assert.equal(player.index, 0);
});

test('the alternate ending changes the listener reaction without moving characters or props', t => {
  const { player } = fixture(t);
  player.setScene('cafe', undefined, 'cold-tea');
  player.elapsed = player.dialogue[1].end;
  player.render();
  player.chooseReply('cold-tea');
  player.elapsed = player.dialogue[3].start + 1000;
  player.render();
  const positions = player.sprites.map(sprite => [sprite.style.left, sprite.style.top]);
  const prop = [player.prop.style.left, player.prop.style.top];
  const ordinaryPose = player.sprites[0].style.backgroundPosition;
  player.replay();
  player.elapsed = player.dialogue[1].end;
  player.render();
  player.chooseReply('wait');
  player.elapsed = player.dialogue[3].start + 1000;
  player.render();
  assert.notEqual(player.sprites[0].style.backgroundPosition, ordinaryPose);
  assert.match(player.sprites[0].style.backgroundPosition, /^100%/);
  assert.deepEqual(player.sprites.map(sprite => [sprite.style.left, sprite.style.top]), positions);
  assert.deepEqual([player.prop.style.left, player.prop.style.top], prop);
});
