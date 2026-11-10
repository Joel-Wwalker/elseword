const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

function keys(points, t) {
  for (let i = 1; i < points.length; i++) {
    const [end, value] = points[i], [start, previous] = points[i - 1];
    if (t <= end) return mix(previous, value, smooth((t - start) / (end - start)));
  }
  return points.at(-1)[1];
}

/** Timeline-only poses: anticipation, quick action, a held accent, then recovery. */
export function sampleAction(action, elapsed, { duration = 700, reduced = false } = {}) {
  const progress = clamp(elapsed / duration), active = elapsed >= 0 && elapsed < duration && action !== 'none';
  const contact = action === 'recoil' ? 0.32 : 0.55;
  const impactAge = elapsed - Math.round(duration * contact);
  const accented = ['pass', 'drop', 'recoil'].includes(action);
  const impact = !reduced && accented && impactAge >= 0 && impactAge < 180 ? 1 - impactAge / 180 : 0;
  const travel = reduced ? Number(elapsed >= 0) : smooth((progress - 0.18) / 0.37);
  const recoil = active && !reduced ? keys([[0, 0], [0.16, -0.18], [0.32, 1], [0.46, 1], [1, 0]], progress) : 0;
  const lean = active && !reduced ? keys([[0, 0], [0.18, -1.5], [0.36, 3], [0.55, 3], [1, 0]], progress) : 0;
  // The second small arc is a rebound; both contacts are exactly on the support.
  const lift = action === 'drop' && active && !reduced
    ? keys([[0, 0], [0.25, 10], [0.55, 0], [0.67, 2], [0.82, 0], [1, 0]], progress) : 0;
  return { active, progress, travel, lift, recoil, lean, impact, impactAge };
}

/** Small local pixel marks, never a screen flash or an accumulating particle system. */
export function sampleImpact({ x, y, age, reduced = false }) {
  if (reduced || age < 0 || age >= 240) return [];
  const progress = age / 240, spread = 3 + Math.floor(progress * 9);
  return [-1, 1].flatMap(side => [
    { x: Math.round(x + side * spread), y: Math.round(y - 3 - Math.sin(progress * Math.PI) * 5), width: 3, height: 2, color: '#d5c6a7', opacity: 1 - progress },
    { x: Math.round(x + side * (spread + 4)), y: Math.round(y - 1), width: 2, height: 1, color: '#96ac9a', opacity: (1 - progress) * 0.8 },
  ]);
}

/** One transform for the entire room keeps foreground occlusion and contacts intact. */
export function sampleCamera({ time = 0, speaker = 0, previousSpeaker = speaker, lineStart = 0, impact = 0, reduced = false } = {}) {
  if (reduced) return { scale: 1, x: 0, y: 0 };
  const entrance = smooth(time / 900);
  const pan = mix(previousSpeaker ? -4 : 4, speaker ? -4 : 4, smooth((time - lineStart) / 420));
  const scale = 1 + 0.12 * entrance;
  // Two diminishing pixel offsets emphasize contact without moving the caption box.
  const kick = impact ? Math.round(impact * 1.5) * (Math.floor(time / 45) % 2 ? -1 : 1) : 0;
  return { scale, x: Math.round(192 * (1 - scale) + pan * entrance + kick), y: Math.round(108 * (1 - scale) + impact) };
}

/** Room atmosphere follows the same scene clock in the World and recorded frames. */
export function sampleAtmosphere(id, time, { reduced = false } = {}) {
  return {
    opacity: reduced ? 0.35 : id === 'rooftop' ? 0.4 + Math.floor(time / 600) % 2 * 0.4 : 0.5,
  };
}

/** Each drop completes its fall before restarting above the visible street. */
export function sampleRain(time = 0, { reduced = false } = {}) {
  const clock = reduced || !Number.isFinite(time) ? 0 : Math.max(0, time);
  return Array.from({ length: 34 }, (_, index) => {
    const height = 4 + index % 3 * 2;
    const distance = 184 - 23 + height;
    const fall = (index * 37 + Math.floor(clock * (70 + index % 4 * 12) / 1000)) % distance;
    return { x: 31 + index * 73 % 330 - Math.floor(fall / 24), y: 23 - height + fall, width: 1, height };
  });
}
