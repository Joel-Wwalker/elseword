import { element } from './player-dom.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as geometry from '../src/scene-layout.js';
import { buildDialogue, ScenePlayer } from '../src/scene-player.js';
import { createLanguage } from '../src/engine.js';
import { SCENES } from '../src/scenes.js';
import { sampleRain } from '../src/scene-direction.js';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≠ ${expected}`);
const bookBounds = frame => [
  frame.prop.x + 16, frame.prop.y + 6.4,
  frame.prop.x + 36.8, frame.prop.y + 28.8,
];
const timeline = [
  { start: 0, end: 7000, duration: 7000 },
  { start: 7000, end: 12000, duration: 5000 },
  { start: 12000, end: 25000, duration: 13000 },
  { start: 25000, end: 31000, duration: 6000 },
];

test('episode cues follow the actual rendered dialogue boundaries, including long lines', () => {
  assert.equal(typeof geometry.getEpisodeTiming, 'function', 'Episode cues need a timeline-derived timing helper');
  const intro = geometry.getEpisodeTiming({ animation: { type: 'introductions', lookAwayLine: 3 } }, timeline);
  const library = geometry.getEpisodeTiming({ animation: { type: 'lost-property', offerLine: 0, returnLine: 3 } }, timeline);
  const cafe = geometry.getEpisodeTiming({ animation: { type: 'cold-tea', coolLine: 3 } }, timeline);
  assert.equal(intro.lookAwayStart, 25000);
  assert.equal(library.offerStart, 0);
  assert.equal(library.returnStart, 25000);
  assert.equal(cafe.coolStart, 25000);
  assert.equal(cafe.coolEnd, 31000);
});

test('the lost book slides toward the librarian and returns without leaving its clear counter space', () => {
  const options = { episodeType: 'lost-property', offerStart: 0, returnStart: 15000 };
  const initial = geometry.sampleSceneLayout('library', { ...options, time: 0 });
  const offered = geometry.sampleSceneLayout('library', { ...options, time: 14000 });
  const returning = geometry.sampleSceneLayout('library', { ...options, time: 15400 });
  const returned = geometry.sampleSceneLayout('library', { ...options, time: 17000 });
  assert.ok(offered.prop.x > initial.prop.x, 'The reader slides the book toward the librarian');
  assert.ok(returning.prop.x < offered.prop.x && returning.prop.x > returned.prop.x);
  close(returned.prop.x, initial.prop.x);
  for (let time = 0; time <= 22000; time += 31) {
    const frame = geometry.sampleSceneLayout('library', { ...options, time });
    const bounds = bookBounds(frame);
    close(bounds[3], 106);
    assert.ok(bounds[0] >= 219 && bounds[2] < 275, 'Book stays on the counter and clear of its other books');
    assert.equal(frame.prop.opacity, 1);
    assert.equal(frame.prop.zIndex, 5);
  }
});

test('the hot cup is present from the start and its steam fades above its rim during the wait', () => {
  const options = { episodeType: 'cold-tea', coolStart: 15000, coolEnd: 20000 };
  const hot = geometry.sampleSceneLayout('cafe', { ...options, time: 0 });
  assert.equal(hot.prop.opacity, 1, 'The wrong tea is already on the counter');
  assert.equal(hot.steam?.opacity, 1);
  const waiting = geometry.sampleSceneLayout('cafe', { ...options, time: 17000 });
  const cold = geometry.sampleSceneLayout('cafe', { ...options, time: 19999 });
  assert.ok(waiting.steam.opacity > 0 && waiting.steam.opacity < 1);
  assert.equal(cold.steam.opacity, 0);
  for (let time = 0; time < 21000; time += 37) {
    const frame = geometry.sampleSceneLayout('cafe', { ...options, time });
    const rim = frame.prop.y + 12 * 0.65;
    assert.ok(frame.steam.x >= frame.prop.x + 23 * 0.65);
    assert.ok(frame.steam.x + frame.steam.width <= frame.prop.x + 45 * 0.65);
    assert.ok(frame.steam.y + frame.steam.height <= rim);
    assert.ok(frame.steam.y >= rim - 14);
    assert.deepEqual(frame.characters, hot.characters, 'The two actors hold their stare');
    close(frame.prop.y + 36 * 0.65, 104);
  }
});

test('the greeting turns toward the partner, then slowly looks away only at the snark reply', () => {
  const options = { episodeType: 'introductions', lookAwayStart: 25000 };
  const start = geometry.sampleSceneLayout('busstop', { ...options, time: 0 });
  const greeting = geometry.sampleSceneLayout('busstop', { ...options, time: 2000 });
  const before = geometry.sampleSceneLayout('busstop', { ...options, time: 24999 });
  const turning = geometry.sampleSceneLayout('busstop', { ...options, time: 25500 });
  const after = geometry.sampleSceneLayout('busstop', { ...options, time: 28000 });
  assert.equal(start.characters[0].turnScale, -1);
  assert.equal(greeting.characters[0].turnScale, 1);
  assert.equal(before.characters[0].turnScale, 1);
  assert.ok(turning.characters[0].turnScale < 1 && turning.characters[0].turnScale > -1);
  assert.equal(after.characters[0].turnScale, -1);
  for (const frame of [start, greeting, before, turning, after]) {
    assert.deepEqual(frame.characters.map(({ x, y }) => [x, y]), [[115, 111], [215, 110]]);
    assert.equal(frame.walking, false);
    assert.equal(frame.characters[1].turnScale, 1);
  }
});

test('reduced motion removes episode travel and turning while retaining the cold-tea state change', () => {
  for (const [id, episodeType] of [['busstop', 'introductions'], ['library', 'lost-property'], ['cafe', 'cold-tea']]) {
    const options = { episodeType, offerStart: 0, returnStart: 15000, lookAwayStart: 15000,
      coolStart: 15000, coolEnd: 20000, reduced: true };
    const before = geometry.sampleSceneLayout(id, { ...options, time: 0 });
    const after = geometry.sampleSceneLayout(id, { ...options, time: 19000 });
    assert.deepEqual(before.characters, after.characters);
    assert.equal(before.walking, false);
    close(before.prop.x, after.prop.x);
    close(before.prop.y, after.prop.y);
    if (id === 'cafe') {
      assert.equal(before.steam?.opacity, 1);
      assert.equal(after.steam?.opacity, 0);
    }
  }
});

test('short new conversations last at least twenty seconds and long custom words extend the cue timing', () => {
  const source = SCENES.find(scene => scene.id === 'bakery');
  const scene = { ...source, episodeId: 'introductions', animation: { type: 'introductions', lookAwayLine: 3 }, lines: source.lines.slice(0, 4) };
  const language = createLanguage({ name: 'Luma', seed: 'episode-timing', preset: 'soft' });
  const short = buildDialogue(scene, language);
  assert.ok(short.at(-1).end >= 20000);
  language.words.find(word => word.english.toLowerCase() === 'bread').word = 'a'.repeat(180);
  const long = buildDialogue(scene, language);
  assert.ok(long[0].duration >= [...long[0].text].length * 43 + 1000);
  assert.equal(long[0].english, 'One bread, please.');
  assert.ok(long[3].start > short[3].start);
  assert.equal(geometry.getEpisodeTiming(scene, long).lookAwayStart, long[3].start);
});

// Only the browser-owned element boundary is substituted; scene selection,
// cast resolution, dialogue rebuilding, layout and render all execute normally.
function playerFixture() {
  const language = createLanguage({ name: 'Luma', seed: 'episode-player', preset: 'soft' });
  const player = Object.create(ScenePlayer.prototype);
  Object.assign(player, {
    container: element(), getLanguage: () => language, motion: { matches: false },
    onLine: () => {}, onEnd: () => {}, onEpisodeChange: () => {},
    paused: true, speed: 1.5, english: false, sound: true, lastTime: 99,
    el: Object.fromEntries(['viewport', 'location', 'conversation', 'episode', 'episodeNext', 'speaker', 'text', 'translation',
      'accessible', 'next', 'progress', 'pause', 'status', 'sound'].map(name => [name, element()])),
  });
  return player;
}

test('switching an episode while paused resets the line and retains cast and playback preferences', () => {
  const player = playerFixture();
  player.setScene('busstop', ['hush', 'kiln']);
  player.elapsed = 9999;
  player.setScene('busstop', undefined, 'introductions');
  assert.equal(player.scene.episodeId, 'introductions');
  assert.equal(player.elapsed, 0);
  assert.equal(player.index, 0);
  assert.equal(player.lastTime, 0);
  assert.deepEqual(player.cast.map(character => character.id), ['hush', 'kiln']);
  assert.equal(player.paused, true);
  assert.equal(player.speed, 1.5);
  assert.equal(player.english, false);
  assert.equal(player.sound, true);
  assert.equal(player.el.episodeNext.hidden, false);
  assert.equal(player.el.conversation.hidden, false);
  assert.match(player.el.episode.textContent, /2\s*\/\s*2/);
});

test('Next conversation cycles episodes and reports the selected context without adding locations', () => {
  const player = playerFixture();
  const changes = [];
  player.onEpisodeChange = selection => changes.push(selection);
  player.setScene('library', ['moss', 'slate']);
  assert.equal(typeof player.nextEpisode, 'function', 'The player needs episode navigation');
  player.nextEpisode();
  assert.equal(player.scene.episodeId, 'lost-property');
  assert.equal(player.current.english, player.scene.lines[0].english);
  assert.deepEqual(changes, [{ sceneId: 'library', episodeId: 'lost-property' }]);
  player.nextEpisode();
  assert.equal(player.scene.episodeId, 'original');
  assert.deepEqual(player.cast.map(character => character.id), ['moss', 'slate']);
  player.setScene('bakery');
  assert.equal(player.el.episodeNext.hidden, false);
  assert.equal(player.el.conversation.hidden, false, 'The bakery now offers its substitution conversation');
  player.nextEpisode();
  assert.equal(player.scene.episodeId, 'substitution');
});

test('World facial cues follow dialogue and contacts without sticking after a replay', () => {
  const player = playerFixture();
  player.setScene('bakery');
  const first = player.scene.lines[0];
  player.elapsed = 500; player.render();
  assert.equal(player.sprites[0].dataset.expression, first.expressions[0]);
  const contact = player.timing.offerStart + 385;
  player.elapsed = contact + 100; player.render();
  assert.deepEqual(player.sprites.map(sprite => sprite.dataset.expression), ['startled', 'startled']);
  player.motion.matches = true; player.render();
  assert.deepEqual(player.sprites.map(sprite => sprite.dataset.expression), ['startled', 'startled']);
  player.elapsed = 500; player.render();
  assert.equal(player.sprites[0].dataset.expression, first.expressions[0]);
  assert.notEqual(player.sprites[0].dataset.expression, 'startled');
});

test('World rain and rooftop stars retain the same sampled atmosphere during seeks and reduced motion', () => {
  const player = playerFixture();
  player.setScene('busstop');
  const rainNode = player.rainDrops;
  for (const [time, reduced, opacity] of [[400, false, '0.5'], [520, false, '0.5'], [1080, false, '0.5'], [1080, true, '0.35'], [400, false, '0.5']]) {
    player.elapsed = time; player.motion.matches = reduced; player.render();
    assert.equal(player.rainDrops, rainNode, 'Rain updates one persistent path');
    const rectangles = [...rainNode.attributes.d.matchAll(/M(-?\d+) (-?\d+)h(\d+)v(\d+)h-\d+Z/gu)].map(match => match.slice(1).map(Number));
    assert.deepEqual(rectangles, sampleRain(time, { reduced }).map(({ x, y, width, height }) => [x, y, width, height]));
    assert.equal(rainNode.attributes.transform, undefined, 'The rain field and shelter mask never translate');
    assert.equal(player.ambient.style.opacity, opacity);
  }
  player.setScene('rooftop');
  for (const [time, reduced, opacity] of [[1000, false, '0.8'], [1200, false, '0.4'], [1200, true, '0.35']]) {
    player.elapsed = time; player.motion.matches = reduced; player.render();
    assert.equal(player.ambient.style.opacity, opacity);
  }
});
