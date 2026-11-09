import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENES, getSceneEpisode, resolveSceneChoice } from '../src/scenes.js';
import { createLanguage } from '../src/engine.js';
import { renderSceneLine } from '../src/scene-language.js';

const expressions = new Set(['neutral', 'curious', 'annoyed', 'pleased', 'worried', 'startled']);

test('every authored episode and reply line provides two supported resident expressions', () => {
  let episodeCount = 0, branchCount = 0;
  for (const room of SCENES) for (const episode of room.episodes) {
    episodeCount++;
    const groups = [episode, ...(episode.choice?.options ?? [])];
    branchCount += groups.length - 1;
    for (const group of groups) {
      for (const [index, line] of group.lines.entries()) {
        const label = `${room.id}/${episode.id}/${group.id}/${index}`;
        assert.ok(Array.isArray(line.expressions), `${label} has no authored cues`);
        assert.equal(line.expressions.length, 2, label);
        assert.ok(line.expressions.every(value => expressions.has(value)), label);
      }
      assert.ok(group.lines.some(line => line.expressions.some(value => value !== 'neutral')),
        `${room.id}/${episode.id}/${group.id} loses all its reactions`);
    }
  }
  assert.equal(episodeCount, 16);
  assert.equal(branchCount, 12);
});

test('the loaf surprises Moss while Kiln stays composed, and the late bus wears on Rook', () => {
  const bakery = getSceneEpisode('bakery');
  assert.deepEqual(bakery.lines[1].expressions, ['startled', 'neutral']);
  assert.deepEqual(bakery.lines[2].expressions, ['worried', 'neutral']);
  const bus = getSceneEpisode('busstop');
  assert.deepEqual(bus.lines[0].expressions, ['worried', 'neutral']);
  assert.deepEqual(bus.lines[2].expressions, ['annoyed', 'neutral']);
});

test('reply substitution carries its own reactions and preserves the opening cues', () => {
  for (const room of SCENES) for (const episode of room.episodes) {
    if (!episode.choice) continue;
    const scene = getSceneEpisode(room.id, episode.id), before = structuredClone(scene);
    const branches = scene.choice.options.map(option => resolveSceneChoice(scene, option.id));
    for (const [index, resolved] of branches.entries()) {
      const split = scene.choice.afterLine + 1;
      assert.deepEqual(resolved.lines.slice(0, split).map(line => line.expressions),
        scene.lines.slice(0, split).map(line => line.expressions));
      assert.deepEqual(resolved.lines.slice(split).map(line => line.expressions),
        scene.choice.options[index].lines.map(line => line.expressions));
    }
    assert.notDeepEqual(branches[0].lines.map(line => line.expressions),
      branches[1].lines.map(line => line.expressions), `${room.id} replies need distinct reactions`);
    assert.deepEqual(scene, before);
  }
  const cafe = getSceneEpisode('cafe', 'cold-tea');
  assert.deepEqual(resolveSceneChoice(cafe, 'cold-tea').lines[2].expressions, ['annoyed', 'neutral']);
  assert.deepEqual(resolveSceneChoice(cafe, 'wait').lines[2].expressions, ['neutral', 'pleased']);
});

test('original aliases retain cues and translation cannot infer or overwrite expressions', () => {
  const language = createLanguage({ seed: 'expression-cues' });
  for (const word of language.words) word.word = 'na';
  for (const room of SCENES) {
    const original = getSceneEpisode(room.id);
    assert.deepEqual(room.lines.map(line => line.expressions), original.lines.map(line => line.expressions));
    for (const episode of room.episodes) {
      for (const line of [...episode.lines, ...(episode.choice?.options.flatMap(option => option.lines) ?? [])]) {
        assert.ok(Array.isArray(line.expressions));
        const before = structuredClone(line);
        renderSceneLine(line, language);
        assert.deepEqual(line, before);
      }
    }
  }
});
