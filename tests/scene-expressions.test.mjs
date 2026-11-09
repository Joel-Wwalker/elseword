import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleSceneLayout } from '../src/scene-layout.js';

const expressions = await import('../src/scene-expressions.js').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const sample = options => {
  assert.equal(typeof expressions.sampleExpressions, 'function', 'Scenes need a shared expression sampler');
  return expressions.sampleExpressions(options);
};

test('the speaker responds immediately and the listener reacts after a short delay', () => {
  const cue = { start: 1000, speaker: 1, expressions: ['annoyed', 'pleased'] };
  assert.deepEqual(sample({ ...cue, time: 999 }), ['neutral', 'neutral']);
  assert.deepEqual(sample({ ...cue, time: 1000 }), ['neutral', 'pleased']);
  assert.deepEqual(sample({ ...cue, time: 1219 }), ['neutral', 'pleased']);
  assert.deepEqual(sample({ ...cue, time: 1220 }), ['annoyed', 'pleased']);
});

test('chosen expressions affect only the speaker and Automatic retains authored cues', () => {
  const cue = { start: 0, time: 500, speaker: 0, expressions: ['curious', 'annoyed'] };
  assert.deepEqual(sample({ ...cue, expression: 'worried' }), ['worried', 'annoyed']);
  assert.deepEqual(sample({ ...cue, expression: 'auto' }), ['curious', 'annoyed']);
  assert.deepEqual(sample({ ...cue, expression: 'neutral' }), ['neutral', 'annoyed']);
});

test('an impact overrides a face briefly then returns to the line expression', () => {
  const cue = { start: 0, speaker: 0, expressions: ['annoyed', 'pleased'], reactionTimes: [[400], [500]] };
  assert.deepEqual(sample({ ...cue, time: 399 }), ['annoyed', 'pleased']);
  assert.deepEqual(sample({ ...cue, time: 400 }), ['startled', 'pleased']);
  assert.deepEqual(sample({ ...cue, time: 500 }), ['startled', 'startled']);
  assert.deepEqual(sample({ ...cue, time: 1049 }), ['startled', 'startled']);
  assert.deepEqual(sample({ ...cue, time: 1050 }), ['annoyed', 'startled']);
  assert.deepEqual(sample({ ...cue, time: 1150 }), ['annoyed', 'pleased']);
});

test('seeking and reduced motion do not change expression state or mutate cues', () => {
  const cue = { start: 200, speaker: 1, expressions: ['worried', 'curious'], reactionTimes: [[800, 2500], [900]] };
  const original = structuredClone(cue);
  const expected = sample({ ...cue, time: 1050 });
  sample({ ...cue, time: 5000 });
  assert.deepEqual(sample({ ...cue, time: 1050 }), expected);
  assert.deepEqual(sample({ ...cue, time: 1050, reduced: true }), expected);
  assert.deepEqual(sample({ ...cue, time: 250 }), ['neutral', 'curious']);
  assert.deepEqual(cue, original);
});

test('unrecognized cue values and nonfinite reaction times cannot leak into rendering', () => {
  assert.deepEqual(sample({ time: 1000, start: 0, speaker: 0, expression: '<script>', expressions: ['broken', null], reactionTimes: [[NaN, Infinity], []] }), ['neutral', 'neutral']);
  assert.deepEqual(sample(), ['neutral', 'neutral']);
});

test('World reaction cues follow prop contact and the later exchange, including reduced motion', () => {
  const options = { offerStart: 4000, reactionStart: 12000 };
  const normal = sampleSceneLayout('bakery', { ...options, time: 4400 });
  assert.deepEqual(normal.reactionTimes, [[4485, 12000], [4385, 12150]]);
  const reduced = sampleSceneLayout('bakery', { ...options, time: 4400, reduced: true });
  assert.deepEqual(reduced.reactionTimes, normal.reactionTimes);
  const cue = { start: 4000, speaker: 1, expressions: ['curious', 'pleased'], reactionTimes: normal.reactionTimes };
  assert.deepEqual(sample({ ...cue, time: 4384 }), ['curious', 'pleased']);
  assert.deepEqual(sample({ ...cue, time: 4385 }), ['curious', 'startled']);
  assert.deepEqual(sample({ ...cue, time: 4485 }), ['startled', 'startled']);
  assert.deepEqual(sample({ ...cue, time: 5200 }), ['curious', 'pleased']);
  assert.deepEqual(sampleSceneLayout('cafe', { ...options, episodeType: 'cold-tea' }).reactionTimes, [[], []]);
});
