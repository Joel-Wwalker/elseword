import { getSceneLineWords } from './scene-language.js';

const noun = (head, determiner) => ({ type: 'noun', head, determiner });
const clause = (subject, verb, object, options = {}) => ({ type: 'clause', subject, verb, object, ...options });
const sequence = (...items) => ({ type: 'sequence', items });
const fragment = (word, options = {}) => ({ type: 'fragment', items: [word], ...options });

function scene(metadata, lines) {
  return { ...metadata, lines, words: [...new Set(lines.flatMap(getSceneLineWords))] };
}

export const APARTMENTS = scene({
  id: 'apartments', name: 'The apartments', location: 'Upstairs, downstairs', category: 'Neighbors', tag: 'Thin walls',
  description: 'Soup on the stove, a dropped pan, and a pipe that needs attention.',
  characters: ['kiln', 'brine', 'hush', 'moss'],
}, [
  { id: 'pan-1', speaker: 'kiln', incident: 'pan', english: 'The soup is ready. I can eat now.', syntax: [
    clause(noun('soup', 'the'), 'be', 'ready'), clause('i', 'eat', undefined, { modal: 'can', tail: 'now' }),
  ] },
  { id: 'pan-2', speaker: 'hush', incident: 'pan', english: 'What was that? Are you alive?', syntax: [
    clause('what', 'be', 'that', { tense: 'past', question: true }), clause('you', 'be', 'alive', { question: true }),
  ] },
  { id: 'pan-3', speaker: 'kiln', incident: 'pan', english: 'Yes. I dropped the pan. Go back to sleep.', syntax: [
    fragment('yes'), clause('i', 'drop', noun('pan', 'the'), { tense: 'past' }),
    clause(undefined, 'go', undefined, { tail: sequence('back', 'to', 'sleep') }),
  ] },
  { id: 'pipe-1', speaker: 'brine', incident: 'pipe', english: 'The water is cold!', syntax: [
    clause(noun('water', 'the'), 'be', 'cold', { punctuation: '!' }),
  ] },
  { id: 'pipe-2', speaker: 'moss', incident: 'pipe', english: 'The pipe is broken. Again.', syntax: [
    clause(noun('pipe', 'the'), 'be', 'broken'), fragment('again'),
  ] },
  { id: 'pipe-3', speaker: 'brine', incident: 'pipe', english: 'Again? I fixed it yesterday.', syntax: [
    fragment('again', { question: true }), clause('i', 'fix', 'it', { tense: 'past', tail: 'yesterday' }),
  ] },
]);

export const NIGHT_MARKET = scene({
  id: 'nightmarket', name: 'The night market', location: 'Dinner after dark', category: 'Street food', tag: 'One hungry visitor',
  description: 'Hot soup, patient customers, and a cat with dinner plans.',
  characters: ['kiln', 'shard', 'moss', 'vesper', 'brine', 'slate'],
}, [
  { id: 'snack-1', speaker: 'moss', incident: 'snack', english: 'I need the soup. I\'m hungry.', syntax: [
    clause('i', 'need', noun('soup', 'the')), clause('i', 'be', 'hungry'),
  ] },
  { id: 'snack-2', speaker: 'kiln', incident: 'snack', english: 'Wait. The bowl is hot.', syntax: [
    clause(undefined, 'wait'), clause(noun('bowl', 'the'), 'be', 'hot'),
  ] },
  { id: 'snack-3', speaker: 'moss', incident: 'snack', english: 'Damn. I\'ll wait.', syntax: [
    fragment('damn'), clause('i', 'wait', undefined, { tense: 'future' }),
  ] },
  { id: 'theft-1', speaker: 'vesper', incident: 'theft', english: 'No! That was my food!', syntax: [
    fragment('no', { punctuation: '!' }), clause('that', 'be', noun('food', 'my'), { tense: 'past', punctuation: '!' }),
  ] },
  { id: 'theft-2', speaker: 'shard', incident: 'theft', english: 'The cat ate it.', syntax: [clause(noun('cat', 'the'), 'eat', 'it', { tense: 'past' })] },
  { id: 'theft-3', speaker: 'vesper', incident: 'theft', english: 'I hope the cat can pay.', syntax: [
    clause('i', 'hope', clause(noun('cat', 'the'), 'pay', undefined, { modal: 'can' })),
  ] },
]);

export const TRAIN_CARRIAGE = scene({
  id: 'train', name: 'The train carriage', location: 'One stop too late', category: 'On the move', tag: 'Mind the luggage',
  description: 'A missed station and a bag with somewhere else to be.',
  characters: ['vesper', 'rook', 'moss', 'hush', 'brine', 'slate'],
}, [
  { id: 'stop-1', speaker: 'vesper', incident: 'stop', english: 'Wait! This is my stop!', syntax: [
    clause(undefined, 'wait', undefined, { punctuation: '!' }), clause('this', 'be', noun('stop', 'my'), { punctuation: '!' }),
  ] },
  { id: 'stop-2', speaker: 'rook', incident: 'stop', english: 'That was your stop.', syntax: [
    clause('that', 'be', noun('stop', 'your'), { tense: 'past' }),
  ] },
  { id: 'stop-3', speaker: 'vesper', incident: 'stop', english: 'Shit. I waved at it.', syntax: [
    fragment('shit'), clause('i', 'wave', undefined, { tense: 'past', tail: sequence('at', 'it') }),
  ] },
  { id: 'luggage-1', speaker: 'brine', incident: 'luggage', english: 'My bag is moving. My wallet is inside!', syntax: [
    clause(noun('bag', 'my'), 'move'), clause(noun('wallet', 'my'), 'be', 'inside', { punctuation: '!' }),
  ] },
  { id: 'luggage-2', speaker: 'slate', incident: 'luggage', english: 'I\'ll catch it. Don\'t panic.', syntax: [
    clause('i', 'catch', 'it', { tense: 'future' }), clause(undefined, 'panic', undefined, { negative: true }),
  ] },
  { id: 'luggage-3', speaker: 'brine', incident: 'luggage', english: 'You missed the bag. Can I panic now?', syntax: [
    clause('you', 'miss', noun('bag', 'the'), { tense: 'past' }), clause('i', 'panic', undefined, { modal: 'can', tail: 'now', question: true }),
  ] },
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
    const cycle = elapsed % 900;
    // The visible drop runs from the outlet at y86 to the basin rim at y132.
    // Its local y3..12 shape gives way to a fixed y16..19 splash on impact.
    const y = cycle < 675 ? Math.round(103 + cycle / 675 * 37) : 133;
    props.push(prop('leaking-pipe', 'apartment-drip', 390, y, frameAt(elapsed, 225, 4)));
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
    const { x, direction } = route(elapsed, 7000, 188, 266);
    props.push({ ...prop('food-thief', 'market-critter', x, 219, 2 + frameAt(elapsed, 220, 2)), direction });
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
