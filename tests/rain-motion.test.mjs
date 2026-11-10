import test from 'node:test';
import assert from 'node:assert/strict';
import * as direction from '../src/scene-direction.js';
import { RAIN_CLIP_RECTS } from '../src/scene-player.js';

function rain(time, options) {
  assert.equal(typeof direction.sampleRain, 'function', 'Rain needs independently sampled drops');
  return direction.sampleRain(time, options);
}

test('falling drops never jump upward or sideways inside the visible weather area', () => {
  let previous = rain(0), wraps = 0;
  for (let time = 16; time <= 20000; time += 16) {
    const current = rain(time);
    assert.equal(current.length, previous.length, 'The particle count stays bounded');
    let wrappedThisFrame = 0;
    current.forEach((drop, index) => {
      const before = previous[index], dy = drop.y - before.y;
      assert.ok(Object.values(drop).every(Number.isInteger), 'Drops stay on the pixel grid');
      assert.ok(drop.y + drop.height >= 23 && drop.y < 184);
      if (dy < 0) {
        assert.ok(before.y >= 181 && drop.y + drop.height <= 26, 'Drops restart only across the outer boundaries');
        wraps++; wrappedThisFrame++;
      } else {
        assert.ok(dy <= 3, 'Rain falls at a steady speed');
        assert.ok(drop.x <= before.x && drop.x >= before.x - 1, 'Wind cannot snap a visible drop to the right');
      }
    });
    assert.ok(wrappedThisFrame < current.length / 2, 'The whole rain sheet must not reset together');
    previous = current;
  }
  assert.ok(wraps > 100, 'Exercise repeated fall cycles');
});

test('rain reaches both edges and the upper sky throughout the animation', () => {
  const drops = Array.from({ length: 100 }, (_, index) => rain(index * 97)).flat();
  assert.ok(drops.some(drop => drop.x >= 345 && drop.x < 357 && drop.y >= 23 && drop.y < 70));
  assert.ok(drops.some(drop => drop.x >= 27 && drop.x <= 40 && drop.y >= 23 && drop.y < 70));
  for (const time of [0, 400, 520, 1000, 1500, 3000, 8000]) {
    assert.ok(rain(time).some(drop => drop.y < 35 && drop.y + drop.height > 23), `Sky coverage at ${time}ms`);
  }
});

test('seeking is deterministic and reduced motion freezes the initial rain field', () => {
  const initial = rain(0), times = [520, 4000, 100, 16000];
  const frames = times.map(time => rain(time));
  for (const index of [3, 1, 0, 2]) assert.deepEqual(rain(times[index]), frames[index]);
  for (const time of times) assert.deepEqual(rain(time, { reduced: true }), initial);
  for (const time of [-1, NaN, Infinity, undefined]) assert.deepEqual(rain(time), initial);
});

test('the full shelter roof and its dry interior block rain while the pavement remains exposed', () => {
  const exposed = (x, y) => RAIN_CLIP_RECTS.some(([left, top, width, height]) => x >= left && x < left + width && y >= top && y < top + height);
  for (let x = 81; x < 305; x++) for (let y = 70; y < 169; y++) {
    assert.equal(exposed(x, y), false, `Sheltered pixel ${x},${y} must stay dry`);
  }
  for (const [x, y] of [[80, 90], [305, 90], [200, 69], [200, 176]]) assert.equal(exposed(x, y), true);
  assert.equal(exposed(10, 10), false);
});
