import { getSceneLineWords } from './scene-language.js';
import { compilePresetDialogue } from './world-dialogue.js';

const noun = (head, determiner) => ({ type: 'noun', head, determiner });
const clause = (subject, verb, object, options = {}) => ({ type: 'clause', subject, verb, object, ...options });
const fragment = (word, punctuation = '.') => ({ type: 'fragment', items: [word], punctuation });

const lines = [
  { id: 'wallet-1', speaker: 'moss', incident: 'wallet', english: 'Damn, I forgot my wallet!', syntax: [
    fragment('damn', ','), clause('i', 'forget', noun('wallet', 'my'), { tense: 'past', punctuation: '!' }),
  ] },
  { id: 'wallet-2', speaker: 'kiln', incident: 'wallet', english: 'You ate the bread.', syntax: [
    clause('you', 'eat', noun('bread', 'the'), { tense: 'past' }),
  ] },
  { id: 'wallet-3', speaker: 'moss', incident: 'wallet', english: 'I will come back.', syntax: [
    clause('i', 'come', undefined, { tense: 'future', tail: 'back' }),
  ] },
  { id: 'delivery-1', speaker: 'vesper', incident: 'delivery', english: 'Is this your package?', syntax: [
    clause('this', 'be', noun('package', 'your'), { question: true }),
  ] },
  { id: 'delivery-2', speaker: 'hush', incident: 'delivery', english: 'I ordered one book.', syntax: [
    clause('i', 'order', noun('book', 'one'), { tense: 'past' }),
  ] },
  { id: 'delivery-3', speaker: 'vesper', incident: 'delivery', english: 'This is a chair.', syntax: [
    clause('this', 'be', noun('chair', 'a')),
  ] },
  { id: 'building-1', speaker: 'rook', incident: 'building', english: 'The wall is ready.', syntax: [
    clause(noun('wall', 'the'), 'be', 'ready'),
  ] },
  { id: 'building-2', speaker: 'brine', incident: 'building', english: 'Where is the door?', syntax: [
    clause(noun('door', 'the'), 'be', undefined, { front: 'where', question: true }),
  ] },
  { id: 'building-3', speaker: 'rook', incident: 'building', english: 'Shit.', syntax: [fragment('shit')] },
];

export const CITY_BLOCK = {
  id: 'city', name: 'The city block', location: 'An ordinary day', tag: 'Life on the block',
  description: 'A forgotten wallet, a puzzling delivery, and a wall with one small problem.',
  characters: ['moss', 'kiln', 'vesper', 'hush', 'rook', 'brine', 'slate', 'shard'],
  lines, words: [...new Set(lines.flatMap(getSceneLineWords))],
};

export function compileCityDialogue(language) {
  return compilePresetDialogue(CITY_BLOCK, language);
}

const ANCHORS = [
  { id: 'moss', x: 145, y: 167, direction: 'up' },
  { id: 'kiln', x: 99, y: 135, direction: 'right' },
  { id: 'vesper', x: 280, y: 214, direction: 'right' },
  { id: 'hush', x: 318, y: 214, direction: 'left' },
  { id: 'rook', x: 413, y: 133, direction: 'right' },
  { id: 'brine', x: 453, y: 148, direction: 'left' },
];

function pedestrian(id, y, time, period, phase, reduced) {
  const progress = (time / period + phase) % 1;
  const right = progress < 0.5;
  const distance = right ? progress * 2 : (1 - progress) * 2;
  return { id, x: Math.round(44 + distance * 304), y, direction: right ? 'right' : 'left',
    step: reduced ? 0 : Math.floor(time / 220) % 2, activity: reduced ? 'idle' : 'walk', expression: 'neutral' };
}

/** Feet coordinates in a 512×320 block. Dialogue never changes walking routes. */
export function sampleCity(time, { incident = 'wallet', reduced = false } = {}) {
  const elapsed = reduced || !Number.isFinite(time) ? 0 : Math.max(0, time);
  const actors = ANCHORS.map(anchor => ({ ...anchor, step: 0, activity: 'idle', expression: 'neutral' }));
  const [moss, kiln, vesper, hush, rook, brine] = actors;
  const props = [{ id: 'supply-crate', type: 'crate', x: 377, y: 180 }];
  let hammer = false;
  if (incident === 'wallet') {
    moss.activity = 'pockets';
    moss.expression = 'worried';
    kiln.expression = 'annoyed';
  } else if (incident === 'delivery') {
    vesper.activity = 'carry';
    vesper.expression = 'curious';
    hush.expression = 'curious';
    props.push({ id: 'delivery-parcel', type: 'parcel', x: 292, y: 211 });
  } else if (incident === 'building') {
    rook.activity = reduced ? 'idle' : 'hammer';
    rook.expression = 'pleased';
    brine.expression = 'curious';
    hammer = !reduced && elapsed % 1000 < 240;
    rook.step = hammer ? 1 : 0;
    props.push({ id: 'construction-plank', type: 'plank', x: 433, y: 139 });
  }
  actors.push(pedestrian('slate', 254, elapsed, 48000, 0, reduced));
  actors.push(pedestrian('shard', 282, elapsed, 60000, 0.5, reduced));
  return { actors, props, hammer };
}
