import test from 'node:test';
import assert from 'node:assert/strict';

const { makeEffectSamples } = await import('../src/scene-sounds.js').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const effects = ['thud', 'tap', 'clink', 'slide', 'swish', 'step'];

test('contact sounds are distinct, deterministic PCM with bounded levels and smooth edges', () => {
  assert.equal(typeof makeEffectSamples, 'function');
  const signatures = new Set();
  for (const effect of effects) for (const rate of [22050, 48000]) {
    const samples = makeEffectSamples(effect, rate);
    assert.ok(samples instanceof Float32Array);
    assert.ok(samples.length / rate >= 0.05 && samples.length / rate <= 0.3, effect);
    assert.deepEqual(samples, makeEffectSamples(effect, rate), `${effect}: repeatable for preview and export`);
    assert.equal(samples[0], 0);
    assert.equal(samples.at(-1), 0);
    let peak = 0, energy = 0;
    for (const sample of samples) {
      assert.ok(Number.isFinite(sample));
      peak = Math.max(peak, Math.abs(sample)); energy += sample * sample;
    }
    assert.ok(peak > 0.01 && peak <= 0.2, `${effect}: audible without clipping`);
    assert.ok(energy / samples.length > 0.00001, `${effect}: nonzero energy`);
    const edge = Math.round(rate * 0.001);
    assert.ok(samples.slice(0, edge).every(sample => Math.abs(sample) < peak * 0.4), `${effect}: attack fades in`);
    assert.ok(samples.slice(-edge).every(sample => Math.abs(sample) < peak * 0.1), `${effect}: release fades out`);
    if (rate === 22050) signatures.add(Array.from(samples.slice(0, 150)).join(','));
  }
  assert.equal(signatures.size, effects.length);
});

test('unknown effects are silent and invalid sample rates use a bounded default', () => {
  assert.equal(typeof makeEffectSamples, 'function');
  for (const unknown of ['music', 'toString', '', null, undefined, ['tap'], { toString: () => 'tap' }]) {
    assert.equal(makeEffectSamples(unknown).length, 0);
  }
  for (const rate of [0, -1, NaN, Infinity, 1e12]) {
    assert.deepEqual(makeEffectSamples('tap', rate), makeEffectSamples('tap'));
  }
});
