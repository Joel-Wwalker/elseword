import { getSceneLineWords } from './scene-language.js';

/** Original town residents. Each atlas contains four poses in each of two rows. */
export const CHARACTERS = [
  {
    id: 'moss', name: 'Moss', title: 'Bog wanderer',
    description: 'A tall, wary bog-being with an angular green head, narrow pale eyes, branch horns, and a long teal coat.',
    atlas: 'assets/humanoid-creature-atlas.png', row: 0, color: '#a9bf91',
  },
  {
    id: 'kiln', name: 'Kiln', title: 'Bakery keeper',
    description: 'A broad fired-clay being with a stern kiln-mask face, narrow amber eyes, long arms, and a dark plum apron.',
    atlas: 'assets/humanoid-creature-atlas.png', row: 1, color: '#d1a17d',
  },
  {
    id: 'vesper', name: 'Vesper', title: 'Night courier',
    description: 'A slender moth-like humanoid in a muted mauve cloak, with a pale mask and tired, watchful eyes.',
    atlas: 'assets/townfolk-1.png', row: 0, color: '#c0a0b8',
  },
  {
    id: 'slate', name: 'Slate', title: 'Stone archivist',
    description: 'A tall, slim stone-being with a slate-blue angular face and a long, carefully buttoned coat.',
    atlas: 'assets/townfolk-1.png', row: 1, color: '#9baebf',
  },
  {
    id: 'rook', name: 'Rook', title: 'Platform guard',
    description: 'An iron-armored humanoid with a severe angular head and a dark red coat worn over square metal shoulders.',
    atlas: 'assets/townfolk-2.png', row: 0, color: '#b98888',
  },
  {
    id: 'brine', name: 'Brine', title: 'Harbor traveler',
    description: 'A sea-green aquatic humanoid with fin-like ears, narrow eyes, and an indigo traveling coat.',
    atlas: 'assets/townfolk-2.png', row: 1, color: '#91bcb2',
  },
  {
    id: 'shard', name: 'Shard', title: 'Glass apothecary',
    description: 'An angular violet crystal humanoid in a long charcoal coat, with a still expression and sharp, quiet gestures.',
    atlas: 'assets/townfolk-3.png', row: 0, color: '#b39acb',
  },
  {
    id: 'hush', name: 'Hush', title: 'Quiet observer',
    description: 'A shadow-cloaked humanoid with an ivory mask, narrow dark eyes, and antler-like antennae.',
    atlas: 'assets/townfolk-3.png', row: 1, color: '#c3bda4',
  },
];

// These helpers author syntax; they do not infer grammar from the English gloss.
const noun = (head, options = {}) => ({ type: 'noun', head, ...options });
const clause = (subject, verb, object, options = {}) => ({ type: 'clause', subject, verb, object, ...options });
const sequence = (...items) => ({ type: 'sequence', items });
const fragment = (...items) => ({ type: 'fragment', items });
const polite = phrase => ({ type: 'fragment', items: [phrase, 'please'], separator: ', ' });

function authoredLines(lines) {
  return lines.map(([speaker, english, ...syntax]) => ({
    speaker,
    english,
    keys: english.toLowerCase().match(/[a-z]+/g) || [],
    syntax,
  }));
}

function episode(definition) {
  const lines = authoredLines(definition.lines);
  const choice = definition.choice ? {
    ...definition.choice,
    options: definition.choice.options.map(option => ({ ...option, lines: authoredLines(option.lines) })),
  } : undefined;
  const allLines = [...lines, ...(choice?.options.flatMap(option => option.lines) ?? [])];
  return { animation: { type: 'original' }, ...definition, lines, choice, words: [...new Set(allLines.flatMap(getSceneLineWords))] };
}

function scene(definition) {
  const original = episode({ id: 'original', title: definition.tag, tag: definition.tag, description: definition.description, lines: definition.lines, makerActions: definition.makerActions });
  const episodes = [original, ...(definition.episodes ?? []).map(episode)];
  // Original aliases keep the room grid and older scene consumers compatible.
  return { ...definition, lines: original.lines, words: original.words, animation: original.animation, title: original.title, episodes };
}

export const SCENES = [
  scene({
    id: 'bakery', name: 'The bakery', location: 'A quiet afternoon',
    description: 'Warm window light, a wooden counter, and a loaf with little regard for the size of its bag.',
    tag: 'A little misunderstanding', characters: ['moss', 'kiln'], prop: 'bread',
    makerActions: { 1: { action: 'drop', cue: 'end' } },
    lines: [
      [0, 'One bread, please.', polite(noun('bread', { determiner: 'one' }))],
      [1, 'One bread.', fragment(noun('bread', { determiner: 'one' }))],
      [0, 'This bread is big.', clause(noun('bread', { determiner: 'this' }), 'be', 'big')],
      [1, 'Yes. The bag is small.', fragment('yes'), clause(noun('bag', { determiner: 'the' }), 'be', 'small')],
      [0, 'I need another bag.', clause('i', 'need', noun('bag', { determiner: 'another' }))],
    ],
    episodes: [
      {
        id: 'substitution', title: 'Something fresh', tag: 'A change of order',
        description: 'The cake is not ready. Kiln offers the bread, with a second plan if Moss prefers to wait.',
        animation: { type: 'original', offerLine: 1 },
        makerActions: { 1: { action: 'pass', cue: 'end' }, 3: { action: 'gesture', cue: 'start' } },
        choice: {
          afterLine: 1, prompt: 'What do you choose?',
          options: [
            { id: 'take-bread', lines: [
              [0, 'I will take the bread.', clause('i', 'take', noun('bread', { determiner: 'the' }), { tense: 'future' })],
              [1, 'Good. It is fresh.', fragment('good'), clause('it', 'be', 'fresh')],
            ] },
            { id: 'wait-for-cake', lines: [
              [0, 'I can wait for cake.', clause('i', 'wait', sequence('for', 'cake'), { modal: 'can' })],
              [1, 'Then I can eat the bread.', clause('i', 'eat', noun('bread', { determiner: 'the' }), { front: 'then', modal: 'can' })],
            ] },
          ],
        },
        lines: [
          [0, 'Is the cake ready?', clause(noun('cake', { determiner: 'the' }), 'be', 'ready', { question: true })],
          [1, 'No. We have bread.', fragment('no'), clause('we', 'have', 'bread')],
          [0, 'I will take the bread.', clause('i', 'take', noun('bread', { determiner: 'the' }), { tense: 'future' })],
          [1, 'Good. It is fresh.', fragment('good'), clause('it', 'be', 'fresh')],
        ],
      },
    ],
  }),
  scene({
    id: 'market', name: 'The market', location: 'The last stall on the square',
    description: 'Striped awnings, crates of apples, and one unusually appealing free extra.',
    tag: 'A very small purchase', characters: ['vesper', 'slate'], prop: 'basket',
    lines: [
      [0, 'How much is this apple?', clause(noun('apple', { determiner: 'this' }), 'be', undefined, { front: 'how much', question: true })],
      [1, 'Two coins.', fragment(noun('coin', { determiner: 'two', plural: true }))],
      [0, 'It has a leaf.', clause('it', 'have', noun('leaf', { determiner: 'a' }))],
      [1, 'The leaf is free.', clause(noun('leaf', { determiner: 'the' }), 'be', 'free')],
      [0, 'I will take the leaf.', clause('i', 'take', noun('leaf', { determiner: 'the' }), { tense: 'future' })],
    ],
    episodes: [
      {
        id: 'bargaining', title: 'A smaller price', tag: 'An adjustable purchase',
        description: 'Vesper offers fewer coins. Slate adjusts how much of the apple is included.',
        animation: { type: 'original', offerLine: 3 },
        makerActions: { 1: { action: 'gesture', cue: 'start' }, 2: { action: 'gesture', cue: 'start' }, 3: { action: 'pass', cue: 'end' } },
        choice: {
          afterLine: 1, prompt: 'What do you offer?',
          options: [
            { id: 'two-coins', lines: [
              [0, 'Two coins?', { ...fragment(noun('coin', { determiner: 'two', plural: true })), question: true }],
              [1, 'Two coins. The leaf is my leaf.', fragment(noun('coin', { determiner: 'two', plural: true })), clause(noun('leaf', { determiner: 'the' }), 'be', noun('leaf', { determiner: 'my' }))],
            ] },
            { id: 'one-coin', lines: [
              [0, 'One coin?', { ...fragment(noun('coin', { determiner: 'one' })), question: true }],
              [1, 'One leaf.', fragment(noun('leaf', { determiner: 'one' }))],
            ] },
          ],
        },
        lines: [
          [0, 'How much is the apple?', clause(noun('apple', { determiner: 'the' }), 'be', undefined, { front: 'how much', question: true })],
          [1, 'Three coins.', fragment(noun('coin', { determiner: 'three', plural: true }))],
          [0, 'Two coins?', { ...fragment(noun('coin', { determiner: 'two', plural: true })), question: true }],
          [1, 'Two coins. The leaf is my leaf.', fragment(noun('coin', { determiner: 'two', plural: true })), clause(noun('leaf', { determiner: 'the' }), 'be', noun('leaf', { determiner: 'my' }))],
        ],
      },
    ],
  }),
  scene({
    id: 'busstop', name: 'The bus stop', location: 'Rain, with more rain expected',
    description: 'A wet street, a small shelter, and a timetable with an optimistic view of the afternoon.',
    tag: 'Something is on time', characters: ['rook', 'brine'], prop: 'umbrella',
    lines: [
      [0, 'Is the bus late?', clause(noun('bus', { determiner: 'the' }), 'be', 'late', { question: true })],
      [1, 'The bus is coming.', clause(noun('bus', { determiner: 'the' }), sequence('be', 'coming'))],
      [0, 'You said that before.', clause('you', 'say', 'that', { tense: 'past', tail: 'before' })],
      [1, 'The rain is here.', clause(noun('rain', { determiner: 'the' }), 'be', 'here')],
      [0, 'The rain is on time.', clause(noun('rain', { determiner: 'the' }), 'be', sequence('on', 'time'))],
    ],
    episodes: [
      {
        id: 'introductions', title: 'An introduction', tag: 'A passing feeling',
        description: 'Two travelers introduce themselves beneath the shelter. One finds the feeling temporary.',
        animation: { type: 'introductions', lookAwayLine: 3 },
        choice: {
          afterLine: 1, prompt: 'What do you say?',
          options: [
            { id: 'pleased', lines: [
              [0, 'I am pleased to meet you.', clause('i', 'be', sequence('pleased', clause(undefined, 'meet', 'you', { front: 'to' })))],
              [1, 'That should pass.', clause('that', 'pass', undefined, { modal: 'should' })],
            ] },
            { id: 'quiet-friend', lines: [
              [0, 'I need a quiet friend.', clause('i', 'need', noun('friend', { determiner: 'a', adjectives: ['quiet'] }))],
              [1, 'Then goodbye.', fragment('then', 'goodbye')],
            ] },
          ],
        },
        lines: [
          [0, 'Hello.', fragment('hello')],
          [1, 'Hello.', fragment('hello')],
          [0, 'I am pleased to meet you.', clause('i', 'be', sequence('pleased', clause(undefined, 'meet', 'you', { front: 'to' })))],
          [1, 'That should pass.', clause('that', 'pass', undefined, { modal: 'should' })],
        ],
      },
    ],
  }),
  scene({
    id: 'library', name: 'The library', location: 'Please keep the door quiet',
    description: 'Tall shelves, a reading desk, and a search for a book that makes less noise.',
    tag: 'A quiet recommendation', characters: ['hush', 'slate'], prop: 'book',
    lines: [
      [0, 'I need a quiet book.', clause('i', 'need', noun('book', { determiner: 'a', adjectives: ['quiet'] }))],
      [1, 'All books are quiet.', clause(noun('book', { determiner: 'all', plural: true }), 'be', 'quiet')],
      [0, 'This one has a bell.', clause(noun('one', { determiner: 'this' }), 'have', noun('bell', { determiner: 'a' }))],
      [1, 'That is the door.', clause('that', 'be', noun('door', { determiner: 'the' }))],
      [0, 'I will read outside.', clause('i', 'read', undefined, { tense: 'future', tail: 'outside' })],
    ],
    episodes: [
      {
        id: 'lost-property', title: 'Lost property', tag: 'An unfortunate coincidence',
        description: 'A book crosses the library desk. The name inside does little to settle its ownership.',
        animation: { type: 'lost-property', offerLine: 0, returnLine: 3 },
        choice: {
          afterLine: 0, prompt: 'What do you say?',
          options: [
            { id: 'deny', lines: [
              [1, 'No. It is not my book.', fragment('no'), clause('it', 'be', noun('book', { determiner: 'my' }), { negative: true })],
              [0, 'Your name is inside.', clause(noun('name', { determiner: 'your' }), 'be', 'inside')],
              [1, 'An unfortunate coincidence.', fragment(noun('coincidence', { determiner: 'a', adjectives: ['unfortunate'] }))],
            ] },
            { id: 'claim', lines: [
              [1, 'Yes. I need that book.', fragment('yes'), clause('i', 'need', noun('book', { determiner: 'that' }))],
              [0, 'Your name is inside.', clause(noun('name', { determiner: 'your' }), 'be', 'inside')],
              [1, 'I need a new name.', clause('i', 'need', noun('name', { determiner: 'a', adjectives: ['new'] }))],
            ] },
          ],
        },
        lines: [
          [0, 'Is this your book?', clause('this', 'be', noun('book', { determiner: 'your' }), { question: true })],
          [1, 'No. It is not my book.', fragment('no'), clause('it', 'be', noun('book', { determiner: 'my' }), { negative: true })],
          [0, 'Your name is inside.', clause(noun('name', { determiner: 'your' }), 'be', 'inside')],
          [1, 'An unfortunate coincidence.', fragment(noun('coincidence', { determiner: 'a', adjectives: ['unfortunate'] }))],
        ],
      },
    ],
  }),
  scene({
    id: 'cafe', name: 'The café', location: 'A table beside the window',
    description: 'A small café with warm lamps, an empty cup, and the beginning of a very slow tea.',
    tag: 'The first ingredient', characters: ['shard', 'vesper'], prop: 'cup',
    lines: [
      [0, 'One hot tea, please.', polite(noun('tea', { determiner: 'one', adjectives: ['hot'] }))],
      [1, 'The cup is empty.', clause(noun('cup', { determiner: 'the' }), 'be', 'empty')],
      [0, 'Where is the tea?', clause(noun('tea', { determiner: 'the' }), 'be', undefined, { front: 'where', question: true })],
      [1, 'It needs water.', clause('it', 'need', 'water')],
      [0, 'I can wait for water.', clause('i', 'wait', sequence('for', 'water'), { modal: 'can' })],
    ],
    episodes: [
      {
        id: 'cold-tea', title: 'Cold tea', tag: 'A matter of time',
        description: 'The tea arrives hot. The proposed correction requires no effort from the café.',
        animation: { type: 'cold-tea', coolLine: 3 },
        choice: {
          afterLine: 1, prompt: 'What do you say?',
          options: [
            { id: 'cold-tea', lines: [
              [0, 'I asked for cold tea.', clause('i', 'ask', sequence('for', noun('tea', { adjectives: ['cold'] })), { tense: 'past' })],
              [1, 'Then wait.', clause(undefined, 'wait', undefined, { front: 'then' })],
            ] },
            { id: 'wait', lines: [
              [0, 'I can wait.', clause('i', 'wait', undefined, { modal: 'can' })],
              [1, 'Good. I can sleep.', fragment('good'), clause('i', 'sleep', undefined, { modal: 'can' })],
            ] },
          ],
        },
        lines: [
          [0, 'This tea is hot.', clause(noun('tea', { determiner: 'this' }), 'be', 'hot')],
          [1, 'Yes.', fragment('yes')],
          [0, 'I asked for cold tea.', clause('i', 'ask', sequence('for', noun('tea', { adjectives: ['cold'] })), { tense: 'past' })],
          [1, 'Then wait.', clause(undefined, 'wait', undefined, { front: 'then' })],
        ],
      },
    ],
  }),
  scene({
    id: 'tickets', name: 'The ticket counter', location: 'A station quite far inland',
    description: 'A ticket window, a platform clock, and a traveler trying to make the sea a little closer.',
    tag: 'Distance is not a quantity', characters: ['brine', 'rook'], prop: 'ticket',
    lines: [
      [0, 'One ticket to the sea.', fragment(noun('ticket', { determiner: 'one', modifiers: [sequence('to', noun('sea', { determiner: 'the' }))] }))],
      [1, 'The train stops here.', clause(noun('train', { determiner: 'the' }), 'stop', undefined, { tail: 'here' })],
      [0, 'Where is the sea?', clause(noun('sea', { determiner: 'the' }), 'be', undefined, { front: 'where', question: true })],
      [1, 'Very far from here.', fragment('very', 'far', 'from', 'here')],
      [0, 'Then two tickets, please.', polite(sequence('then', noun('ticket', { determiner: 'two', plural: true })))],
    ],
    episodes: [
      {
        id: 'directions', title: 'The other left', tag: 'A matter of perspective',
        description: 'Rook points toward the train. Brine turns, then checks whose direction was intended.',
        animation: { type: 'introductions', lookAwayLine: 2 },
        makerActions: { 1: { action: 'gesture', cue: 'end' }, 2: { action: 'turn', cue: 'start' }, 3: { action: 'gesture', cue: 'end' } },
        lines: [
          [0, 'Where is the train?', clause(noun('train', { determiner: 'the' }), 'be', undefined, { front: 'where', question: true })],
          [1, 'Go left.', clause(undefined, 'go', undefined, { tail: 'left' })],
          [0, 'My left or your left?', { ...fragment(noun('left', { determiner: 'my' }), 'or', noun('left', { determiner: 'your' })), question: true }],
          [1, 'Your right.', fragment(noun('right', { determiner: 'your' }))],
        ],
      },
    ],
  }),
  scene({
    id: 'rooftop', name: 'The rooftop', location: 'Above the evening windows',
    description: 'A quiet roof above a scattered city skyline, where some stars still have their curtains open.',
    tag: 'A mostly accurate sky', characters: ['moss', 'hush'], prop: 'star',
    lines: [
      [0, 'The stars are bright.', clause(noun('star', { determiner: 'the', plural: true }), 'be', 'bright')],
      [1, 'That is a window.', clause('that', 'be', noun('window', { determiner: 'a' }))],
      [0, 'And that star?', { ...fragment('and', noun('star', { determiner: 'that' })), question: true }],
      [1, 'Another window.', fragment(noun('window', { determiner: 'another' }))],
      [0, 'I hope the moon is real.', clause('i', 'hope', clause(noun('moon', { determiner: 'the' }), 'be', 'real'))],
    ],
    episodes: [
      {
        id: 'uncertainty', title: 'A possible star', tag: 'No need to be certain',
        description: 'Moss watches a distant light. Hush proposes a quiet way to leave the question open.',
        animation: { type: 'introductions', lookAwayLine: 2 },
        makerActions: { 1: { action: 'none', cue: 'start' }, 2: { action: 'turn', cue: 'end' }, 3: { action: 'none', cue: 'end', pauseMs: 1600 } },
        choice: {
          afterLine: 1, prompt: 'What might it be?',
          options: [
            { id: 'hope-for-star', lines: [
              [0, 'I hope it is a star.', clause('i', 'hope', clause('it', 'be', noun('star', { determiner: 'a' })))],
              [1, 'Then we should wait.', clause('we', 'wait', undefined, { front: 'then', modal: 'should' })],
            ] },
            { id: 'maybe-window', lines: [
              [0, 'Maybe it is a window.', fragment('maybe', clause('it', 'be', noun('window', { determiner: 'a' })))],
              [1, 'Then we should be quiet.', clause('we', 'be', 'quiet', { front: 'then', modal: 'should' })],
            ] },
          ],
        },
        lines: [
          [0, 'Is that star real?', clause(noun('star', { determiner: 'that' }), 'be', 'real', { question: true })],
          [1, 'Maybe.', fragment('maybe')],
          [0, 'I hope it is a star.', clause('i', 'hope', clause('it', 'be', noun('star', { determiner: 'a' })))],
          [1, 'Then we should wait.', clause('we', 'wait', undefined, { front: 'then', modal: 'should' })],
        ],
      },
    ],
  }),
  scene({
    id: 'apothecary', name: 'The apothecary', location: 'One minute before closing',
    description: 'Colored bottles, a low amber lamp, and a sleep remedy with an encouraging effect on opening hours.',
    tag: 'An early demonstration', characters: ['kiln', 'shard'], prop: 'bottle',
    lines: [
      [0, 'I need a bottle of sleep.', clause('i', 'need', noun('bottle', { determiner: 'a', modifiers: [sequence('of', 'sleep')] }))],
      [1, 'One small bottle.', fragment(noun('bottle', { determiner: 'one', adjectives: ['small'] }))],
      [0, 'Does it work?', clause('it', 'work', undefined, { question: true })],
      [1, 'The shop is closed.', clause(noun('shop', { determiner: 'the' }), 'be', 'closed')],
      [0, 'That is a good sign.', clause('that', 'be', noun('sign', { determiner: 'a', adjectives: ['good'] }))],
    ],
    episodes: [
      {
        id: 'instructions', title: 'Only one', tag: 'The size of an instruction',
        description: 'Shard offers a bottle and a short instruction. Kiln checks an important detail about the quantity.',
        animation: { type: 'original', offerLine: 1 },
        makerActions: { 1: { action: 'pass', cue: 'end' }, 2: { action: 'recoil', cue: 'start' }, 3: { action: 'gesture', cue: 'end' } },
        lines: [
          [0, 'When should I drink this?', clause('i', 'drink', 'this', { front: 'when', modal: 'should', question: true })],
          [1, 'Before sleep. Only one.', fragment('before', 'sleep'), fragment('only', 'one')],
          [0, 'One bottle?', { ...fragment(noun('bottle', { determiner: 'one' })), question: true }],
          [1, 'One small cup.', fragment(noun('cup', { determiner: 'one', adjectives: ['small'] }))],
        ],
      },
    ],
  }),
];

export function getSceneEpisodes(sceneId) {
  return (SCENES.find(entry => entry.id === sceneId) ?? SCENES[0]).episodes;
}

export function getSceneEpisode(sceneId, episodeId = 'original') {
  const location = SCENES.find(entry => entry.id === sceneId) ?? SCENES[0];
  const episodeIndex = Math.max(0, location.episodes.findIndex(entry => entry.id === episodeId));
  const selected = location.episodes[episodeIndex];
  return { ...location, ...selected, id: location.id, episodeId: selected.id, episodeIndex, episodeCount: location.episodes.length };
}

/** Choose an authored continuation without changing the shared room or episode. */
export function resolveSceneChoice(scene, choiceId) {
  const selected = scene.choice?.options.find(option => option.id === choiceId);
  if (!selected) return scene;
  const lines = [...scene.lines.slice(0, scene.choice.afterLine + 1), ...selected.lines];
  return { ...scene, choiceId, lines, words: [...new Set(lines.flatMap(getSceneLineWords))] };
}
