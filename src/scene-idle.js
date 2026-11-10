// Period, phase, gesture length, lean and compression. Quiet gaps keep the
// residents from bobbing continuously or moving in unison.
const PROFILES = {
  moss: [8700, 1800, 1900, 0.55, 0.008],
  kiln: [10400, 2800, 1800, 0.35, 0.006],
  vesper: [7600, 1100, 1600, 0.65, 0.009],
  slate: [11200, 3300, 2100, 0.3, 0.004],
  rook: [9700, 2200, 1500, 0.4, 0.006],
  brine: [8200, 1600, 2000, 0.6, 0.008],
  shard: [10900, 2600, 1700, 0.3, 0.005],
  hush: [11800, 3700, 2200, 0.25, 0.004],
};

/** Absolute scene time makes seeking and exported frames reproduce the idle. */
export function sampleCharacterIdle(id, time, { quietSince = 0, reduced = false } = {}) {
  const neutral = { lean: 0, scaleY: 1 }, profile = Object.hasOwn(PROFILES, id) ? PROFILES[id] : null;
  if (!profile || reduced || !Number.isFinite(time) || time < quietSince + 600) return neutral;
  const [period, phase, length, lean, compression] = profile;
  const elapsed = (time - phase) % period;
  if (elapsed < 0 || elapsed >= length) return neutral;
  const pulse = Math.sin(Math.PI * elapsed / length) ** 2
    * Math.min(1, (time - quietSince - 600) / 400);
  return { lean: lean * pulse, scaleY: 1 - compression * pulse };
}
