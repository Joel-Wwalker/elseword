import { sampleAction, sampleImpact } from './scene-direction.js';

/** All coordinates use the room's 384×216 grid; sprite cells are 64×64. */
const counterProp = (x, y, scale, bounds, supportY) => ({
  x, y, scale, bounds, supportY, mode: 'counter', viewBox: [66, 40], zIndex: 5,
});

export const SCENE_LAYOUTS = {
  bakery: {
    positions: [[154, 100], [247, 56]],
    prop: counterProp(194, 94 - 33 * 0.85, 0.85, [3, 3, 63, 33], 94),
  },
  market: {
    positions: [[132, 109], [243, 68]],
    prop: counterProp(187, 70.25, 0.85, [17, 3, 51, 35], 100),
  },
  busstop: {
    positions: [[115, 111], [215, 110]],
    prop: { x: 59, y: 105, scale: 1, bounds: [18, 4, 39, 70], supportY: 175,
      mode: 'ground', viewBox: [66, 76], zIndex: 3 },
  },
  library: {
    positions: [[144, 112], [244, 68]],
    prop: counterProp(208, 77.2, 0.8, [20, 8, 46, 36], 106),
  },
  cafe: {
    positions: [[141, 112], [240, 66]],
    prop: counterProp(207, 80.6, 0.65, [20, 12, 52, 36], 104),
  },
  tickets: {
    positions: [[145, 112], [241, 65]],
    prop: counterProp(220.3, 83.85, 0.65, [18, 14, 51, 31], 104),
  },
  rooftop: {
    positions: [[137, 112], [223, 112]],
    prop: { x: 130, y: 37, scale: 0.55, bounds: [22, 5, 44, 27],
      mode: 'sky', viewBox: [66, 40], zIndex: 1 },
  },
  apothecary: {
    positions: [[141, 112], [239, 67]],
    prop: counterProp(202, 82.25, 0.65, [21, 5, 44, 35], 105),
  },
};

export function getSceneLayout(id) {
  const layout = SCENE_LAYOUTS[id];
  if (!layout) throw new RangeError(`Unknown scene layout: ${id}`);
  return layout;
}

/** Atlas row zero looks right; row one looks left. */
export function shouldFlipCharacter(row, role) {
  return (row === 1 && role === 0) || (row === 0 && role === 1);
}

const clamp = value => Math.max(0, Math.min(1, value));
const ease = value => { const p = clamp(value); return p * p * (3 - 2 * p); };

/** Every cue follows the current rendered words, including edits that lengthen a line. */
export function getEpisodeTiming(scene, dialogue) {
  const animation = scene.animation || { type: 'original' };
  const line = index => dialogue[Math.max(0, Math.min(index, dialogue.length - 1))];
  return {
    episodeType: animation.type,
    offerStart: line(animation.offerLine ?? 1).start + (animation.type === 'original' ? 200 : 0),
    reactionStart: line(3).start,
    lookAwayStart: line(animation.lookAwayLine ?? 3).start,
    returnStart: line(animation.returnLine ?? 3).start,
    coolStart: line(animation.coolLine ?? 3).start,
    coolEnd: animation.coldLine === undefined ? dialogue.at(-1).end : line(animation.coldLine).start,
  };
}

/** Pure animation geometry shared by the live player and collision checks.
 * offerStart is the exact start supplied by the dialogue timeline.
 */
export function sampleSceneLayout(id, {
  time = 0, offerStart = 2600, reactionStart = 7800, reduced = false,
  episodeType = 'original', returnStart = 15000, lookAwayStart = 15000,
  coolStart = 15000, coolEnd = 20000,
} = {}) {
  const layout = getSceneLayout(id);
  const t = Math.max(0, time);
  const original = episodeType === 'original';
  const walking = original && !reduced && t < 600;
  const step = walking ? Math.floor(t / 140) % 2 : 0;
  const entrance = reduced || !original ? 0 : Math.round(-10 * (1 - clamp(t / 600)));
  const recoil = reduced || !original ? 0 : -Math.min(7, Math.max(0, Math.floor((t - reactionStart) / 90)));
  const characters = layout.positions.map(([x, y], role) => ({
    x: x + (role === 0 ? entrance + recoil : 0),
    y: y + (role === 0 ? step : 0),
  }));
  if (episodeType === 'introductions') characters.forEach((actor, role) => {
    actor.turnScale = role || reduced ? 1
      : t < lookAwayStart ? -1 + 2 * ease(t / 800) : 1 - 2 * ease((t - lookAwayStart) / 1600);
  });
  const { prop } = layout;
  const deliveryAction = original && prop.mode === 'counter'
    ? sampleAction(id === 'bakery' ? 'drop' : 'pass', t - offerStart, { reduced }) : null;
  const delivery = reduced ? 1 : deliveryAction ? deliveryAction.travel : clamp((t - offerStart) / 650);
  const present = episodeType === 'lost-property' || episodeType === 'cold-tea';
  const opacity = present || prop.mode === 'ground' ? 1
    : reduced ? Number(t >= offerStart) : clamp((t - offerStart) / 160);
  const slide = episodeType === 'lost-property'
    ? reduced ? 0 : 18 * ease((t - offerStart) / 1000) * (1 - ease((t - returnStart) / 1100))
    : episodeType === 'cold-tea' ? 0 : prop.mode === 'counter' ? 4 * (1 - delivery) : 0;
  const frame = {
    characters,
    prop: {
      x: prop.x + slide,
      y: prop.y,
      width: prop.viewBox[0] * prop.scale,
      height: prop.viewBox[1] * prop.scale,
      opacity,
      zIndex: prop.zIndex,
    },
    walking,
    step,
    effects: [],
    impact: 0,
  };
  if (deliveryAction) {
    const action = deliveryAction;
    frame.prop.y -= action.lift;
    frame.characters[1].lean = -action.lean;
    frame.impact = action.impact;
    frame.effects = sampleImpact({ x: frame.prop.x + (prop.bounds[0] + prop.bounds[2]) * prop.scale / 2,
      y: prop.supportY, age: action.impactAge, reduced });
    const reaction = sampleAction('recoil', action.impactAge - 100, { reduced });
    if (reaction.active) {
      frame.characters[0].lean = -reaction.lean;
      frame.characters[0].reacting = true;
    }
  }
  const reaction = sampleAction('recoil', t - reactionStart, { reduced });
  if (original && reaction.active) {
    frame.characters[0].lean = -reaction.lean;
    frame.characters[0].reacting = true;
    frame.characters[1].reacting = t - reactionStart > 150;
  }
  if (episodeType === 'cold-tea') {
    const cooling = clamp((t - coolStart) / Math.max(1, coolEnd - coolStart));
    frame.steam = {
      x: frame.prop.x + 25 * prop.scale,
      y: frame.prop.y + 12 * prop.scale - 12,
      width: 18 * prop.scale,
      height: 11,
      opacity: reduced ? Number(t < coolStart) : clamp(1 - cooling * 1.25),
    };
  }
  return frame;
}
