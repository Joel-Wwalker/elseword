import test from 'node:test';
import assert from 'node:assert/strict';
import { makeAmbienceSamples, AMBIENCE_SAMPLE_RATE } from '../src/scene-ambience.js';

test('room loops are distinct, deterministic, quiet and click-free at their seam', () => {
  const fingerprints = new Set();
  for (const room of ['bakery', 'busstop', 'rooftop']) {
    const samples = makeAmbienceSamples(room);
    assert.equal(samples.length, AMBIENCE_SAMPLE_RATE * 8);
    assert.deepEqual(samples, makeAmbienceSamples(room));
    assert.equal(samples[0], 0); assert.equal(samples.at(-1), 0);
    let energy = 0, peak = 0;
    for (const sample of samples) {
      assert.ok(Number.isFinite(sample)); energy += sample * sample;
      peak = Math.max(peak, Math.abs(sample));
    }
    assert.ok(peak <= 0.025);
    const rms = Math.sqrt(energy / samples.length);
    assert.ok(rms > 0.001 && rms < 0.007, `${room}: ${rms}`);
    fingerprints.add(samples.slice(1000, 1100).join(','));
  }
  assert.equal(fingerprints.size, 3);
  for (const room of ['library', 'missing', '__proto__']) assert.equal(makeAmbienceSamples(room).length, 0);
});
