// Original contact sounds made from damped tones and deterministic noise.
// The same PCM generator serves live playback and video export.
const DURATIONS = { thud: 0.14, tap: 0.07, clink: 0.23, slide: 0.18, swish: 0.20, step: 0.10 };

export function makeEffectSamples(effect, sampleRate = 22050) {
  if (typeof effect !== 'string' || !Object.hasOwn(DURATIONS, effect)) return new Float32Array(0);
  const rate = Number.isFinite(sampleRate) && sampleRate >= 8000 && sampleRate <= 192000 ? sampleRate : 22050;
  const duration = DURATIONS[effect];
  const samples = new Float32Array(Math.round(rate * duration));
  let seed = 0x51f15e, low = 0;
  const smoothing = 1 - Math.exp(-2 * Math.PI * 900 / rate);
  for (let i = 1; i < samples.length - 1; i++) {
    const time = i / rate, progress = i / (samples.length - 1);
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1;
    low += smoothing * (noise - low);
    const tone = frequency => Math.sin(2 * Math.PI * frequency * time);
    let signal;
    switch (effect) {
      case 'thud': signal = (0.8 * tone(110 - 35 * progress) + 0.35 * low) * Math.exp(-5 * progress); break;
      case 'tap': signal = (0.5 * tone(650) + 0.25 * tone(1330) + 0.3 * noise) * Math.exp(-7 * progress); break;
      case 'clink': signal = (0.5 * tone(1720) + 0.3 * tone(2513) + 0.15 * tone(3941)) * Math.exp(-5 * progress); break;
      case 'slide': signal = (0.8 * low + 0.15 * tone(190)) * (0.7 + 0.3 * tone(37)) * Math.sin(Math.PI * progress); break;
      case 'swish': signal = (noise - low) * Math.sin(Math.PI * progress) ** 2 * 0.65; break;
      case 'step': signal = (0.6 * low + 0.4 * tone(95) + 0.2 * tone(210)) * Math.exp(-6 * progress); break;
    }
    const attack = Math.sin(Math.min(1, time / 0.004) * Math.PI / 2) ** 2;
    const release = Math.sin(Math.min(1, (samples.length - 1 - i) / rate / 0.015) * Math.PI / 2) ** 2;
    samples[i] = signal * attack * release * 0.14;
  }
  return samples;
}
