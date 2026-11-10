export const AMBIENCE_SAMPLE_RATE = 22050;
export const AMBIENCE_SECONDS = 8;
const ROOMS = { bakery: 'oven', busstop: 'rain', rooftop: 'wind' };

/** Original, quiet room textures. Fixed-rate buffers keep memory bounded. */
export function makeAmbienceSamples(room) {
  if (!Object.hasOwn(ROOMS, room)) return new Float32Array(0);
  const kind = ROOMS[room], rate = AMBIENCE_SAMPLE_RATE;
  const samples = new Float32Array(rate * AMBIENCE_SECONDS);
  let seed = 91873, low = 0, crackle = 0;
  const noise = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2147483648 - 1; };
  for (let i = 0; i < samples.length; i++) {
    const time = i / rate, random = noise();
    low += (random - low) * (kind === 'rain' ? 0.16 : 0.025);
    const swell = 0.75 + 0.25 * Math.sin(2 * Math.PI * time / AMBIENCE_SECONDS);
    let value;
    if (kind === 'oven') {
      if (random > 0.9992) crackle = 0.012;
      crackle *= 0.97;
      value = low * 0.025 + Math.sin(2 * Math.PI * 65 * time) * 0.002 + random * crackle;
    } else value = low * (kind === 'rain' ? 0.025 : 0.055 * swell);
    const edge = Math.min(1, i / (rate * 0.08), (samples.length - 1 - i) / (rate * 0.08));
    samples[i] = Math.max(-0.024, Math.min(0.024, value)) * Math.sin(edge * Math.PI / 2) ** 2;
  }
  return samples;
}
