import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleSceneLayout } from '../src/scene-layout.js';
import { sampleAction, sampleCamera, sampleImpact } from '../src/scene-direction.js';
import { SCENES } from '../src/scenes.js';

const actions = ['none', 'walk', 'turn', 'gesture', 'recoil', 'pass', 'drop'];

test('a counter delivery has one short contact accent that clears after it settles', () => {
  const contact = sampleSceneLayout('bakery', { time: 2600 + 385 });
  assert.ok(Array.isArray(contact.effects), 'The delivery needs sampled impact geometry');
  assert.ok(contact.effects.length > 0);
  assert.deepEqual(sampleSceneLayout('bakery', { time: 4000 }).effects, []);
  assert.deepEqual(sampleSceneLayout('bakery', { time: 2600 }).effects, []);
});

test('reduced motion removes cinematic effects and character lean', () => {
  const frame = sampleSceneLayout('bakery', { time: 2985, reduced: true });
  assert.deepEqual(frame.effects, []);
  assert.ok(frame.characters.every(actor => !actor.lean));
});

test('delivery anticipation ends in a stationary contact accent', () => {
  for (const action of ['pass', 'drop']) {
    assert.equal(sampleAction(action, 126).travel, 0);
    assert.equal(sampleAction(action, 384).impact, 0);
    assert.equal(sampleAction(action, 385).travel, 1);
    assert.equal(sampleAction(action, 385).impact, 1);
    assert.equal(sampleAction(action, 565).impact, 0);
    assert.equal(sampleAction(action, 700).active, false);
  }
  assert.equal(sampleAction('drop', 385).lift, 0);
  assert.equal(sampleAction('recoil', 223).impact, 0);
  assert.equal(sampleAction('recoil', 224).impact, 1);
});

test('action profiles remain inside the room clearance budget and stop after recovery', () => {
  for (const action of actions) for (let time = -20; time <= 1500; time += 5) {
    const frame = sampleAction(action, time);
    for (const key of ['progress', 'travel', 'impact']) assert.ok(frame[key] >= 0 && frame[key] <= 1, `${action}/${key}/${time}`);
    assert.ok(frame.lift >= 0 && frame.lift <= 10);
    assert.ok(frame.lean >= -1.5 && frame.lean <= 3);
    assert.ok(frame.recoil >= -0.18 && frame.recoil <= 1);
    if (time < 0 || time >= 700 || action === 'none') {
      assert.equal(frame.active, false);
      assert.equal(frame.lean, 0);
      assert.equal(frame.lift, 0);
      assert.equal(frame.recoil, 0);
      assert.equal(frame.impact, 0);
    }
  }
});

test('seeking through impacts and actions in either direction does not retain prior frames', () => {
  const times = [0, 126, 175, 224, 385, 469, 574, 700, 900];
  const snapshots = times.map(time => ({ action: sampleAction('drop', time),
    impact: sampleImpact({ x: 220, y: 94, age: time - 385 }),
    camera: sampleCamera({ time: 2600 + time, speaker: 1, previousSpeaker: 0, lineStart: 2600, impact: sampleAction('drop', time).impact }),
    layout: sampleSceneLayout('bakery', { time: 2600 + time }) }));
  for (const index of [8, 3, 0, 7, 4, 1, 6, 2, 5, 4]) {
    const time = times[index];
    assert.deepEqual({ action: sampleAction('drop', time), impact: sampleImpact({ x: 220, y: 94, age: time - 385 }),
      camera: sampleCamera({ time: 2600 + time, speaker: 1, previousSpeaker: 0, lineStart: 2600, impact: sampleAction('drop', time).impact }),
      layout: sampleSceneLayout('bakery', { time: 2600 + time }) }, snapshots[index]);
  }
});

test('pixel impact marks are local, finite and disappear after their last frame', () => {
  assert.deepEqual(sampleImpact({ x: 220, y: 94, age: -1 }), []);
  for (let age = 0; age < 240; age++) {
    const marks = sampleImpact({ x: 220, y: 94, age });
    assert.equal(marks.length, 4);
    for (const mark of marks) {
      assert.ok(Number.isInteger(mark.x) && Number.isInteger(mark.y));
      assert.ok(mark.x >= 204 && mark.x + mark.width <= 238);
      assert.ok(mark.y >= 86 && mark.y + mark.height <= 94);
      assert.ok(mark.opacity > 0 && mark.opacity <= 1);
    }
  }
  assert.deepEqual(sampleImpact({ x: 220, y: 94, age: 240 }), []);
  assert.deepEqual(sampleImpact({ x: 220, y: 94, age: 10000 }), []);
});

test('reduced motion suppresses travel accents, lean, particles and camera movement', () => {
  for (const action of actions) for (const time of [-1, 0, 175, 224, 385, 574, 700]) {
    const frame = sampleAction(action, time, { reduced: true });
    for (const key of ['lean', 'recoil', 'lift', 'impact']) assert.equal(frame[key], 0);
    assert.equal(frame.travel, Number(time >= 0));
    assert.deepEqual(sampleImpact({ x: 220, y: 94, age: time, reduced: true }), []);
    assert.deepEqual(sampleCamera({ time, speaker: 1, previousSpeaker: 0, impact: 1, reduced: true }), { scale: 1, x: 0, y: 0 });
  }
});

test('camera moves keep the full actor cells visible, including their feet-pivot lean', () => {
  for (const scene of SCENES) for (let time = 0; time <= 10000; time += 17) {
    const layout = sampleSceneLayout(scene.id, { time });
    for (const speaker of [0, 1]) {
      const camera = sampleCamera({ time, speaker, previousSpeaker: 1 - speaker, lineStart: Math.floor(time / 2600) * 2600, impact: layout.impact });
      for (const actor of layout.characters) for (const x of [0, 64]) for (const y of [0, 64]) {
        const angle = (actor.lean ?? 0) * Math.PI / 180;
        const worldX = actor.x + 32 + (x - 32) * Math.cos(angle) - (y - 64) * Math.sin(angle);
        const worldY = actor.y + 64 + (x - 32) * Math.sin(angle) + (y - 64) * Math.cos(angle);
        const screenX = camera.x + worldX * camera.scale, screenY = camera.y + worldY * camera.scale;
        assert.ok(screenX >= 0 && screenX <= 384 && screenY >= 0 && screenY <= 216,
          `${scene.id} actor clipped by camera at ${time}`);
      }
    }
  }
});
