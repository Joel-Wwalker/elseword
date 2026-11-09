export const SCENE_EXPRESSIONS = Object.freeze(['auto', 'neutral', 'curious', 'annoyed', 'pleased', 'worried', 'startled']);
const face = value => value !== 'auto' && SCENE_EXPRESSIONS.includes(value) ? value : 'neutral';

/** Facial cues are sampled from time, so seeking never leaves a stale reaction. */
export function sampleExpressions({ time = 0, start = 0, speaker = 0, expressions = [], expression = 'auto', reactionTimes = [[], []] } = {}) {
  return [0, 1].map(role => {
    if ((reactionTimes[role] ?? []).some(at => Number.isFinite(at) && time >= at && time < at + 650)) return 'startled';
    if (time < start + (role === speaker ? 0 : 220)) return 'neutral';
    return face(role === speaker && expression !== 'auto' ? expression : expressions[role]);
  });
}
