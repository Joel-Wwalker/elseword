import { getSceneLineWords } from './scene-language.js';

const noun = (head, determiner) => ({ type: 'noun', head, determiner });
const clause = (subject, verb, object, options = {}) => ({ type: 'clause', subject, verb, object, ...options });
const fragment = word => ({ type: 'fragment', items: [word] });

function scene(metadata, lines) {
  return { ...metadata, lines, words: [...new Set(lines.flatMap(getSceneLineWords))] };
}

export const APARTMENTS = scene({
  id: 'apartments', name: 'The apartments', location: 'Upstairs, downstairs', category: 'Neighbors', tag: 'Thin walls',
  description: 'Soup on the stove, a dropped pan, and a pipe that needs attention.',
  characters: ['kiln', 'brine', 'hush', 'moss'],
}, [
  { id: 'pan-1', speaker: 'kiln', incident: 'pan', english: 'The soup is ready.', syntax: [clause(noun('soup', 'the'), 'be', 'ready')] },
  { id: 'pan-2', speaker: 'hush', incident: 'pan', english: 'What was that?', syntax: [clause('what', 'be', 'that', { tense: 'past', question: true })] },
  { id: 'pan-3', speaker: 'kiln', incident: 'pan', english: 'I dropped the pan.', syntax: [clause('i', 'drop', noun('pan', 'the'), { tense: 'past' })] },
  { id: 'pipe-1', speaker: 'brine', incident: 'pipe', english: 'The water is cold.', syntax: [clause(noun('water', 'the'), 'be', 'cold')] },
  { id: 'pipe-2', speaker: 'moss', incident: 'pipe', english: 'The pipe is broken.', syntax: [clause(noun('pipe', 'the'), 'be', 'broken')] },
  { id: 'pipe-3', speaker: 'brine', incident: 'pipe', english: 'I will fix it.', syntax: [clause('i', 'fix', 'it', { tense: 'future' })] },
]);

export const NIGHT_MARKET = scene({
  id: 'nightmarket', name: 'The night market', location: 'Dinner after dark', category: 'Street food', tag: 'One hungry visitor',
  description: 'Hot soup, patient customers, and a cat with dinner plans.',
  characters: ['kiln', 'shard', 'moss', 'vesper', 'brine', 'slate'],
}, [
  { id: 'snack-1', speaker: 'moss', incident: 'snack', english: 'I want the soup.', syntax: [clause('i', 'want', noun('soup', 'the'))] },
  { id: 'snack-2', speaker: 'kiln', incident: 'snack', english: 'The bowl is hot.', syntax: [clause(noun('bowl', 'the'), 'be', 'hot')] },
  { id: 'snack-3', speaker: 'moss', incident: 'snack', english: 'I will wait.', syntax: [clause('i', 'wait', undefined, { tense: 'future' })] },
  { id: 'theft-1', speaker: 'vesper', incident: 'theft', english: 'That was my food.', syntax: [clause('that', 'be', noun('food', 'my'), { tense: 'past' })] },
  { id: 'theft-2', speaker: 'shard', incident: 'theft', english: 'The cat ate it.', syntax: [clause(noun('cat', 'the'), 'eat', 'it', { tense: 'past' })] },
  { id: 'theft-3', speaker: 'vesper', incident: 'theft', english: 'Damn.', syntax: [fragment('damn')] },
]);

export const TRAIN_CARRIAGE = scene({
  id: 'train', name: 'The train carriage', location: 'One stop too late', category: 'On the move', tag: 'Mind the luggage',
  description: 'A missed station and a bag with somewhere else to be.',
  characters: ['vesper', 'rook', 'moss', 'hush', 'brine', 'slate'],
}, [
  { id: 'stop-1', speaker: 'vesper', incident: 'stop', english: 'This is my stop!', syntax: [clause('this', 'be', noun('stop', 'my'), { punctuation: '!' })] },
  { id: 'stop-2', speaker: 'rook', incident: 'stop', english: 'The train passed the station.', syntax: [clause(noun('train', 'the'), 'pass', noun('station', 'the'), { tense: 'past' })] },
  { id: 'stop-3', speaker: 'vesper', incident: 'stop', english: 'Shit.', syntax: [fragment('shit')] },
  { id: 'luggage-1', speaker: 'brine', incident: 'luggage', english: 'My bag is moving.', syntax: [clause(noun('bag', 'my'), 'move')] },
  { id: 'luggage-2', speaker: 'slate', incident: 'luggage', english: 'I will catch it.', syntax: [clause('i', 'catch', 'it', { tense: 'future' })] },
  { id: 'luggage-3', speaker: 'brine', incident: 'luggage', english: 'You missed the bag.', syntax: [clause('you', 'miss', noun('bag', 'the'), { tense: 'past' })] },
]);

export const NEIGHBORHOOD_SCENES = [APARTMENTS, NIGHT_MARKET, TRAIN_CARRIAGE];

const APARTMENT_ANCHORS = [
  { id: 'kiln', x: 118, y: 130, direction: 'left' },
  { id: 'brine', x: 365, y: 130, direction: 'right' },
  { id: 'hush', x: 118, y: 263, direction: 'down' },
  { id: 'moss', x: 365, y: 263, direction: 'left' },
];
const MARKET_ANCHORS = [
  { id: 'kiln', x: 116, y: 150, direction: 'down' },
  { id: 'shard', x: 357, y: 150, direction: 'down' },
  { id: 'moss', x: 152, y: 189, direction: 'up' },
  { id: 'vesper', x: 320, y: 189, direction: 'up' },
];
const TRAIN_ANCHORS = [
  { id: 'vesper', x: 115, y: 178, direction: 'right' },
  { id: 'rook', x: 192, y: 178, direction: 'left' },
  { id: 'moss', x: 267, y: 178, direction: 'down' },
  { id: 'hush', x: 80, y: 286, direction: 'up' },
  { id: 'brine', x: 345, y: 286, direction: 'left' },
  { id: 'slate', x: 423, y: 286, direction: 'left' },
];

const elapsedTime = (time, reduced) => reduced || !Number.isFinite(time) ? 0 : Math.max(0, time);
const residents = anchors => anchors.map(anchor => ({ ...anchor, step: 0, activity: 'idle', expression: 'neutral' }));
const frameAt = (time, period, count) => Math.floor(time / period) % count;
const prop = (id, type, x, y, frame = 0) => ({ id, type, x, y, width: 20, height: 20, frame });

function route(time, period, start, end, phase = 0) {
  const progress = (time % period / period + phase) % 1;
  const forward = progress < 0.5;
  return { x: Math.round(start + (forward ? progress * 2 : (1 - progress) * 2) * (end - start)), direction: forward ? 'right' : 'left' };
}

/** Four fixed residents in a cutaway; the falling props never cross a floor. */
export function sampleApartments(time, { incident = 'pan', reduced = false } = {}) {
  const elapsed = elapsedTime(time, reduced);
  const actors = residents(APARTMENT_ANCHORS), props = [];
  const [kiln, brine, hush, moss] = actors;
  kiln.activity = 'cook';
  kiln.step = reduced ? 0 : frameAt(elapsed, 600, 2);
  hush.activity = incident === 'pan' ? 'idle' : 'sleep';
  if (incident === 'pan') {
    hush.expression = 'worried';
    kiln.expression = 'surprised';
    const fall = Math.min(1, elapsed % 2400 / 500);
    props.push(prop('dropped-pan', 'apartment-pan', 146, Math.round(106 + fall * 28), Math.min(3, Math.floor(fall * 4))));
  } else if (incident === 'pipe') {
    brine.expression = 'worried';
    moss.expression = 'curious';
    props.push(prop('leaking-pipe', 'apartment-drip', 390, Math.round(89 + elapsed % 900 / 900 * 35), frameAt(elapsed, 225, 4)));
  }
  return { actors, props };
}

/** Pedestrians use separate frontage lanes; the cat stays beside the counters. */
export function sampleNightMarket(time, { incident = 'snack', reduced = false } = {}) {
  const elapsed = elapsedTime(time, reduced);
  const actors = residents(MARKET_ANCHORS);
  const props = [prop('soup-steam', 'market-steam', 118, 110, frameAt(elapsed, 500, 4))];
  const [kiln, shard, moss, vesper] = actors;
  for (const [id, y, period, phase] of [['brine', 252, 48000, 0], ['slate', 284, 60000, 0.5]]) {
    actors.push({ id, ...route(elapsed, period, 44, 450, phase), y,
      step: reduced ? 0 : frameAt(elapsed, 220, 2), activity: reduced ? 'idle' : 'walk', expression: 'neutral' });
  }
  if (incident === 'theft') {
    vesper.expression = 'surprised';
    shard.expression = 'curious';
    props.push(prop('food-thief', 'market-critter', route(elapsed, 7000, 188, 266).x, 219, 2 + frameAt(elapsed, 220, 2)));
  } else {
    kiln.expression = 'pleased';
    moss.expression = 'curious';
    props.push(prop('waiting-bowl', 'market-bowl', 140, 132));
  }
  return { actors, props };
}

/** The landscape changes only inside its apertures; luggage uses the empty aisle. */
export function sampleTrain(time, { incident = 'stop', reduced = false } = {}) {
  const elapsed = elapsedTime(time, reduced);
  const actors = residents(TRAIN_ANCHORS);
  const props = [112, 256, 400].map((x, index) => ({
    id: `window-${index + 1}`, type: 'train-window', x, y: 88, width: 110, height: 62,
    frame: (frameAt(elapsed, 320, 8) + index * 2) % 8,
  }));
  const [vesper, rook, , hush, brine, slate] = actors;
  hush.activity = 'sleep';
  if (incident === 'stop') {
    vesper.expression = 'surprised';
    rook.expression = 'curious';
  } else if (incident === 'luggage') {
    brine.expression = 'worried';
    slate.expression = 'surprised';
    props.push(prop('rolling-bag', 'train-bag', route(elapsed, 12000, 100, 420).x, 233, frameAt(elapsed, 220, 2)));
  }
  return { actors, props };
}
