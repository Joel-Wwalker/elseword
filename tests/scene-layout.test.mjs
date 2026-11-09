import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENES, CHARACTERS } from '../src/scenes.js';
import { getSceneLayout, sampleSceneLayout, shouldFlipCharacter } from '../src/scene-layout.js';

const times = [...new Set([
  ...Array.from({ length: 301 }, (_, index) => index * 33),
  0, 70, 140, 300, 599, 600, 2600, 2726, 2775, 2984, 2985, 2986, 3069, 3174, 3300,
  7800, 7912, 8024, 8052, 8185, 8430, 20000,
])].sort((a, b) => a - b);
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-8, `${message}: ${actual} ≠ ${expected}`);
const propBounds = (layout, frame) => layout.prop.bounds.map((value, index) =>
  value * frame.prop.width / layout.prop.viewBox[0] + (index % 2 ? frame.prop.y : frame.prop.x));
const overlaps = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
const actorCorners = (actor, role) => {
  const angle = (actor.lean ?? 0) * Math.PI / 180, cosine = Math.cos(angle), sine = Math.sin(angle);
  return [[role ? 6 : 14, 0], [role ? 50 : 59, 0], [role ? 50 : 59, 63], [role ? 6 : 14, 63]]
    .map(([x, y]) => [actor.x + 32 + (x - 32) * cosine - (y - 64) * sine,
      actor.y + 64 + (x - 32) * sine + (y - 64) * cosine]);
};
const crossesRectangle = (polygon, [left, top, right, bottom]) => {
  const rectangle = [[left, top], [right, top], [right, bottom], [left, bottom]];
  const axes = [[1, 0], [0, 1], ...polygon.map((point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    return [point[1] - next[1], next[0] - point[0]];
  })];
  return axes.every(([x, y]) => {
    const first = polygon.map(point => point[0] * x + point[1] * y);
    const second = rectangle.map(point => point[0] * x + point[1] * y);
    return Math.max(...first) > Math.min(...second) && Math.max(...second) > Math.min(...first);
  });
};

// Room occupancy is independent of the sampled animation. These obstacles
// caught the old 43-pixel entrances placing feet inside tables and benches.
const floorObstacles = {
  bakery: [[92, 147, 127, 173]],
  library: [[104, 148, 138, 172]],
  cafe: [[84, 156, 125, 189]],
  rooftop: [[99, 166, 140, 190]],
  apothecary: [[86, 130, 131, 170]],
};
const counters = {
  bakery: [194, 94, 337], market: [191, 100, 336], library: [219, 106, 338],
  cafe: [215, 104, 338], tickets: [214, 104, 335], apothecary: [204, 105, 337],
};

test('every selectable cast faces its conversation partner in either role', () => {
  for (const character of CHARACTERS) for (const role of [0, 1]) {
    const originalDirection = character.row === 0 ? 1 : -1;
    const facing = originalDirection * (shouldFlipCharacter(character.row, role) ? -1 : 1);
    assert.equal(facing, role === 0 ? 1 : -1, `${character.id}, role ${role}`);
  }
});

test('all eight scenes keep entrance and reaction poses clear of furniture and room walls', () => {
  assert.equal(SCENES.length, 8);
  for (const scene of SCENES) for (const time of times) for (const reduced of [false, true]) {
    const frame = sampleSceneLayout(scene.id, { time, reduced });
    for (const character of CHARACTERS) for (const role of [0, 1]) {
      const actor = frame.characters[role];
      // Conservative alpha bounds after role-facing mirroring, covering every
      // measured pose in all four atlases (64×64 display cells).
      // Both renderers rotate around the feet, at the cell's (32, 64) point.
      const corners = actorCorners(actor, role);
      const bounds = [Math.min(...corners.map(point => point[0])), Math.min(...corners.map(point => point[1])),
        Math.max(...corners.map(point => point[0])), Math.max(...corners.map(point => point[1]))];
      assert.ok(bounds[0] >= 38 && bounds[2] <= 346 && bounds[1] >= 27 && bounds[3] <= 191,
        `${scene.id}/${character.id}/${role} leaves the room at ${time}`);
      if (role === 0) for (const obstacle of floorObstacles[scene.id] || []) {
        assert.ok(!crossesRectangle(corners, obstacle), `${scene.id}/${character.id} crosses furniture while leaning at ${time}`);
      }
    }
  }
});

test('counter deliveries stay supported except for the bounded bakery toss', () => {
  for (const [id, [left, surface, right]] of Object.entries(counters)) {
    const layout = getSceneLayout(id);
    for (const time of times) for (const reduced of [false, true]) {
      const frame = sampleSceneLayout(id, { time, reduced });
      const bounds = propBounds(layout, frame);
      if (id === 'bakery' && !reduced) {
        assert.ok(bounds[3] >= surface - 10 && bounds[3] <= surface, `${id} toss exceeds its ten-pixel clearance at ${time}`);
      } else close(bounds[3], surface, `${id} countertop contact at ${time}`);
      assert.ok(bounds[0] >= left && bounds[2] <= right, `${id} leaves its countertop`);
      assert.ok(frame.prop.zIndex > 4 && frame.prop.zIndex < 6, `${id} must sit above counter and behind customer`);
    }
  }
});

test('the loaf lands at its delivery endpoint before its small rebound and final rest', () => {
  const layout = getSceneLayout('bakery');
  for (const elapsed of [-1, 0, 385, 574, 700, 1400]) {
    close(propBounds(layout, sampleSceneLayout('bakery', { time: 2600 + elapsed }))[3], 94, `loaf contact at ${elapsed}`);
  }
  close(propBounds(layout, sampleSceneLayout('bakery', { time: 2775 }))[3], 84, 'loaf apex');
  close(propBounds(layout, sampleSceneLayout('bakery', { time: 3069 }))[3], 92, 'loaf rebound apex');
  const before = sampleSceneLayout('bakery', { time: 2984 });
  const contact = sampleSceneLayout('bakery', { time: 2985 });
  const after = sampleSceneLayout('bakery', { time: 2986 });
  assert.deepEqual(before.effects, []);
  assert.ok(contact.effects.length > 0 && after.effects.length > 0);
  close(contact.prop.x, layout.prop.x, 'horizontal travel ends at contact');
  close(after.prop.x, layout.prop.x, 'rebound stays over the landing point');
});

test('market basket and library book clear neighboring countertop objects throughout delivery', () => {
  const occupied = {
    market: [[261, 87, 286, 100], [293, 87, 318, 100]],
    library: [[275, 100, 295, 106], [306, 87, 325, 105]],
  };
  for (const [id, objects] of Object.entries(occupied)) for (const time of times) {
    const frame = sampleSceneLayout(id, { time });
    const bounds = propBounds(getSceneLayout(id), frame);
    for (const object of objects) assert.ok(!overlaps(bounds, object), `${id} prop overlaps counter decoration at ${time}`);
  }
});

test('delivery slides horizontally and fades in without an unsupported vertical lift', () => {
  const initial = sampleSceneLayout('library', { time: 2600 });
  const windup = sampleSceneLayout('library', { time: 2726 });
  const middle = sampleSceneLayout('library', { time: 2744 });
  const final = sampleSceneLayout('library', { time: 2985 });
  assert.equal(initial.prop.opacity, 0);
  assert.ok(middle.prop.opacity > 0 && middle.prop.opacity < 1);
  assert.equal(final.prop.opacity, 1);
  close(initial.prop.x, windup.prop.x, 'delivery holds during anticipation');
  assert.ok(initial.prop.x > middle.prop.x && middle.prop.x > final.prop.x);
  close(final.prop.x, getSceneLayout('library').prop.x, 'delivery reaches its endpoint at the impact cue');
  close(initial.prop.y, final.prop.y, 'delivery height');
});

test('custom dialogue timing controls the exact offer and reaction boundaries', () => {
  assert.equal(sampleSceneLayout('cafe', { time: 4999, offerStart: 5000 }).prop.opacity, 0);
  assert.equal(sampleSceneLayout('cafe', { time: 5160, offerStart: 5000 }).prop.opacity, 1);
  const before = sampleSceneLayout('cafe', { time: 6000, reactionStart: 7000 });
  const after = sampleSceneLayout('cafe', { time: 8000, reactionStart: 7000 });
  assert.ok(before.characters[0].x > after.characters[0].x);
  assert.deepEqual(before.characters[1], after.characters[1]);
});

test('reduced motion keeps actors and props stationary while retaining dialogue reveal timing', () => {
  for (const scene of SCENES) {
    const before = sampleSceneLayout(scene.id, { time: 0, reduced: true });
    const after = sampleSceneLayout(scene.id, { time: 20000, reduced: true });
    assert.deepEqual(before.characters, after.characters);
    close(before.prop.x, after.prop.x, `${scene.id} stationary prop x`);
    close(before.prop.y, after.prop.y, `${scene.id} stationary prop y`);
    assert.equal(before.walking, false);
    assert.equal(before.step, 0);
    assert.equal(after.prop.opacity, 1);
  }
});

test('umbrella remains grounded by the bus-stop post and clear of every actor', () => {
  const layout = getSceneLayout('busstop');
  for (const time of times) {
    const frame = sampleSceneLayout('busstop', { time });
    const bounds = propBounds(layout, frame);
    close(bounds[3], 175, 'umbrella ground contact');
    assert.ok(bounds[0] >= 27 && bounds[2] < frame.characters[0].x + 14);
    assert.equal(frame.prop.opacity, 1);
    assert.equal(frame.prop.zIndex, 3);
  }
});

test('rooftop star stays in open sky without crossing buildings or character heads', () => {
  const buildings = [[34, 62, 76, 153], [82, 43, 118, 153], [124, 76, 175, 154],
    [181, 57, 218, 154], [225, 36, 274, 154], [281, 69, 348, 154]];
  const layout = getSceneLayout('rooftop');
  const first = sampleSceneLayout('rooftop');
  for (const time of times) {
    const frame = sampleSceneLayout('rooftop', { time });
    const bounds = propBounds(layout, frame);
    assert.ok(bounds[0] >= 27 && bounds[2] <= 357 && bounds[1] >= 23);
    for (const building of buildings) assert.ok(!overlaps(bounds, building), `star overlaps building at ${time}`);
    assert.ok(bounds[3] < Math.min(...frame.characters.map(actor => actor.y)));
    assert.equal(frame.prop.x, first.prop.x);
    assert.equal(frame.prop.y, first.prop.y);
    assert.equal(frame.prop.zIndex, 1);
  }
});
