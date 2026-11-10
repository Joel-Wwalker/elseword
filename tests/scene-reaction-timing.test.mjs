import test from 'node:test';
import assert from 'node:assert/strict';
import { createLanguage } from '../src/engine.js';
import { SCENES, getSceneEpisode, resolveSceneChoice } from '../src/scenes.js';
import { buildDialogue } from '../src/scene-player.js';
import { createSceneProject, validateSceneProject, compileSceneProject } from '../src/scene-project.js';

const withoutHolds = scene => ({ ...scene, lines: scene.lines.map(({ reactionPauseMs, ...line }) => line) });

test('authored reaction holds are sparse, bounded, and stay with the selected setup or punchline', () => {
  const lines = SCENES.flatMap(room => room.episodes.flatMap(episode =>
    [...episode.lines, ...(episode.choice?.options.flatMap(option => option.lines) ?? [])]));
  const held = lines.filter(line => line.reactionPauseMs !== undefined);
  assert.ok(held.length > 0);
  assert.ok(held.length < lines.length / 3, 'Most lines retain their existing pace');
  assert.ok(held.every(line => Number.isInteger(line.reactionPauseMs) && line.reactionPauseMs >= 250 && line.reactionPauseMs <= 650));
  const bakery = getSceneEpisode('bakery');
  assert.equal(bakery.lines[1].english, 'One bread.');
  assert.equal(bakery.lines[1].reactionPauseMs, 400);
  assert.equal(bakery.lines[3].reactionPauseMs, 450);
  assert.equal(bakery.lines[0].reactionPauseMs, undefined);
  assert.equal(SCENES.find(room => room.id === 'bakery').lines[1].reactionPauseMs, 400);
  assert.equal(getSceneEpisode('busstop').lines[4].reactionPauseMs, 500);
});

test('World adds the same authored hold after short or long translated dialogue', () => {
  for (const length of [2, 60]) {
    const language = createLanguage({ seed: 'reaction-timing' });
    for (const word of language.words) word.word = 'n'.repeat(length);
    for (const scene of [getSceneEpisode('bakery'), resolveSceneChoice(getSceneEpisode('cafe', 'cold-tea'), 'cold-tea')]) {
      const actual = buildDialogue(scene, language), baseline = buildDialogue(withoutHolds(scene), language);
      let cumulativeHold = 0;
      for (const [index, entry] of actual.entries()) {
        const hold = scene.lines[index].reactionPauseMs ?? 0;
        assert.equal(entry.start, baseline[index].start + cumulativeHold);
        assert.equal(entry.duration, baseline[index].duration + hold);
        assert.deepEqual([entry.text, entry.english, entry.tokens, entry.unknown],
          [baseline[index].text, baseline[index].english, baseline[index].tokens, baseline[index].unknown]);
        cumulativeHold += hold;
        assert.equal(entry.end, baseline[index].end + cumulativeHold);
      }
      assert.ok(cumulativeHold > 0);
    }
  }
});

test('reply holds follow their own continuation without leaking into another branch', () => {
  const bakery = getSceneEpisode('bakery', 'substitution'), before = structuredClone(bakery);
  const take = resolveSceneChoice(bakery, 'take-bread');
  const wait = resolveSceneChoice(bakery, 'wait-for-cake');
  assert.equal(wait.lines[3].english, 'Then I can eat the bread.');
  assert.equal(wait.lines[3].reactionPauseMs, 500);
  assert.equal(take.lines[3].reactionPauseMs, undefined);
  assert.equal(bakery.lines[3].reactionPauseMs, undefined);
  assert.deepEqual(bakery, before);
  const cafe = getSceneEpisode('cafe', 'cold-tea');
  assert.equal(resolveSceneChoice(cafe, 'cold-tea').lines[3].reactionPauseMs, 450);
  assert.equal(resolveSceneChoice(cafe, 'wait').lines[3].reactionPauseMs, 350);
});

test('remixing bakes a hold into existing pauses exactly once and retains authored overrides', () => {
  const language = createLanguage({ seed: 'reaction-remix' });
  const bakery = createSceneProject(language, { room: 'bakery', episodeId: 'original' });
  assert.deepEqual(bakery.beats.map(beat => beat.pauseMs), [600, 1000, 600, 1050, 600]);
  const restored = validateSceneProject(JSON.stringify(bakery));
  assert.deepEqual(restored, bakery);
  assert.ok(restored.beats.every(beat => !Object.hasOwn(beat, 'reactionPauseMs')));
  const baseline = structuredClone(restored);
  baseline.beats.forEach(beat => { beat.pauseMs = 600; });
  const compiled = compileSceneProject(restored);
  assert.equal(compiled.duration - compileSceneProject(baseline).duration, 850);
  assert.equal(compileSceneProject(validateSceneProject(JSON.stringify(compiled.project))).duration, compiled.duration);
  const rooftop = createSceneProject(language, { room: 'rooftop', episodeId: 'uncertainty', choiceId: 'hope-for-star' });
  assert.equal(rooftop.beats[3].pauseMs, 1600);

  const actions = getSceneEpisode('bakery').makerActions, prior = actions[1];
  try {
    actions[1] = { ...prior, pauseMs: 1200 };
    assert.equal(createSceneProject(language, { room: 'bakery', episodeId: 'original' }).beats[1].pauseMs, 1600);
  } finally { actions[1] = prior; }
});

test('uncued lines keep their existing pace and excessive runtime hold metadata is bounded', () => {
  const language = createLanguage(), source = getSceneEpisode('bakery').lines[0];
  const scene = { lines: [{ ...source }] };
  const baseline = buildDialogue(scene, language)[0].duration;
  for (const [value, expected] of [[undefined, 0], [NaN, 0], [Infinity, 0], [-10, 0], ['500', 0], [9999, 650]]) {
    scene.lines[0] = { ...source, reactionPauseMs: value };
    assert.equal(buildDialogue(scene, language)[0].duration - baseline, expected);
  }
});
