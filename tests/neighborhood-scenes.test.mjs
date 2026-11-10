import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createLanguage, validateLanguage } from '../src/engine.js';
import { CORE_VOCAB } from '../src/vocabulary.js';
import { ensureSceneVocabulary } from '../src/scene-language.js';
import { CITY_BLOCK, compileCityDialogue } from '../src/city-block.js';
import { CHARACTERS } from '../src/scenes.js';

let scenes, dialogue;
try { scenes = await import('../src/neighborhood-scenes.js'); }
catch (error) { scenes = { loadError: error.message }; }
try { dialogue = await import('../src/world-dialogue.js'); }
catch (error) { dialogue = { loadError: error.message }; }

function api() {
  assert.equal(typeof dialogue.compilePresetDialogue, 'function', dialogue.loadError);
  for (const name of ['sampleApartments', 'sampleNightMarket', 'sampleTrain']) assert.equal(typeof scenes[name], 'function', scenes.loadError);
  return { ...scenes, ...dialogue };
}

function literalLanguage() {
  const language = createLanguage({ seed: 'neighborhood-grammar' });
  language.words = language.words.map(entry => ({ ...entry, word: entry.english }));
  language.grammar = { order: 'SVO', adjective: 'before', plural: '-PL', past: 'PAST', future: 'FUT', negative: 'NEG', question: 'Q' };
  return language;
}

test('each neighborhood compiles six authored lines using present residents and dictionary roots', () => {
  const { NEIGHBORHOOD_SCENES, compilePresetDialogue } = api();
  const language = literalLanguage(), before = structuredClone(language);
  assert.deepEqual(NEIGHBORHOOD_SCENES.map(scene => scene.id), ['apartments', 'nightmarket', 'train']);
  const expected = [
    ['the soup be ready.', 'what PAST be that Q?', 'i PAST drop the pan.', 'the water be cold.', 'the pipe be broken.', 'i FUT fix it.'],
    ['i want the soup.', 'the bowl be hot.', 'i FUT wait.', 'that PAST be my food.', 'the cat PAST eat it.', 'damn.'],
    ['this be my stop!', 'the train PAST pass the station.', 'shit.', 'my bag move.', 'i FUT catch it.', 'you PAST miss the bag.'],
  ];
  for (const [index, scene] of NEIGHBORHOOD_SCENES.entries()) {
    const lines = compilePresetDialogue(scene, language);
    assert.deepEqual(lines.map(line => line.text), expected[index]);
    assert.equal(new Set(lines.map(line => line.id)).size, 6);
    assert.equal(new Set(lines.map(line => line.incident)).size, 2);
    assert.equal(new Set(scene.words).size, scene.words.length);
    assert.ok(scene.characters.every(id => CHARACTERS.some(character => character.id === id)));
    for (const [lineIndex, line] of lines.entries()) {
      assert.ok(scene.characters.includes(line.speaker));
      assert.equal(line.english, scene.lines[lineIndex].english);
      assert.deepEqual(line.unknown, []);
      assert.equal(line.duration, [...line.text].length * 43 + 2400);
      for (const token of line.tokens.filter(token => token.kind === 'word')) {
        assert.ok(scene.words.includes(token.key));
        assert.equal(language.words.find(word => word.id === token.wordId)?.english, token.key);
      }
    }
  }
  assert.deepEqual(language, before, 'Compiling cannot edit the active dictionary');
  assert.deepEqual(compilePresetDialogue(CITY_BLOCK, language), compileCityDialogue(language));
});

test('all six word orders preserve tense, noun phrases, and the apartment question', () => {
  const { APARTMENTS, NIGHT_MARKET, TRAIN_CARRIAGE, compilePresetDialogue } = api();
  const language = literalLanguage();
  const expected = [
    ['SVO', 'i PAST drop the pan.', 'what PAST be that Q?', 'the cat PAST eat it.', 'you PAST miss the bag.'],
    ['SOV', 'i the pan PAST drop.', 'what that PAST be Q?', 'the cat it PAST eat.', 'you the bag PAST miss.'],
    ['VSO', 'PAST drop i the pan.', 'PAST be what that Q?', 'PAST eat the cat it.', 'PAST miss you the bag.'],
    ['VOS', 'PAST drop the pan i.', 'PAST be that what Q?', 'PAST eat it the cat.', 'PAST miss the bag you.'],
    ['OSV', 'the pan i PAST drop.', 'that what PAST be Q?', 'it the cat PAST eat.', 'the bag you PAST miss.'],
    ['OVS', 'the pan PAST drop i.', 'that PAST be what Q?', 'it PAST eat the cat.', 'the bag PAST miss you.'],
  ];
  for (const [order, pan, question, cat, bag] of expected) {
    language.grammar.order = order;
    const apartments = compilePresetDialogue(APARTMENTS, language);
    assert.equal(apartments[2].text, pan);
    assert.equal(apartments[1].text, question);
    assert.equal(compilePresetDialogue(NIGHT_MARKET, language)[4].text, cat);
    assert.equal(compilePresetDialogue(TRAIN_CARRIAGE, language)[5].text, bag);
  }
  language.grammar = { ...language.grammar, order: 'SVO', past: '', future: '', question: '' };
  assert.equal(compilePresetDialogue(APARTMENTS, language)[1].text, 'what be that?');
  assert.equal(compilePresetDialogue(TRAIN_CARRIAGE, language)[4].text, 'i catch it.');
});

test('custom RTL glyphs retain root ownership, punctuation, long words, and visible unknowns', () => {
  const { APARTMENTS, compilePresetDialogue } = api();
  const language = literalLanguage();
  const replacements = { i: 'e\u0301', drop: 'sh', the: '🙂', pan: 'a' };
  for (const word of language.words) if (Object.hasOwn(replacements, word.english)) word.word = replacements[word.english];
  language.script = { style: 'custom', direction: 'rtl', glyphs: { é: 'אב', sh: '𐀀', '🙂': '☽△', 'a.': 'Z' } };
  const line = compilePresetDialogue(APARTMENTS, language)[2];
  assert.equal(line.text, 'אב PAST 𐀀 ☽△ Z');
  assert.deepEqual(line.tokens.map(({ key, marker, start, end, text }) => [key ?? marker, start, end, text]), [
    ['i', 0, 2, 'אב'], ['past', 3, 7, 'PAST'], ['drop', 8, 9, '𐀀'], ['the', 10, 12, '☽△'], ['pan', 13, 14, 'Z'],
  ]);
  language.script.glyphs['🙂 a'] = 'XX';
  const shared = compilePresetDialogue(APARTMENTS, language)[2];
  assert.equal(shared.text, 'אב PAST 𐀀 XX.');
  assert.deepEqual(shared.tokens.filter(token => token.kind === 'word').map(token => token.key), ['i', 'drop']);
  language.words.find(word => word.english === 'pan').word = '𐀀'.repeat(80);
  language.script.glyphs['𐀀'] = 'abcdefgh';
  const long = compilePresetDialogue(APARTMENTS, language)[2];
  const pan = long.tokens.find(token => token.key === 'pan');
  assert.equal(pan.text, 'abcdefgh'.repeat(80));
  assert.equal([...long.text].slice(pan.start, pan.end).join(''), pan.text);
  language.words = language.words.filter(word => word.english !== 'pan');
  const missing = compilePresetDialogue(APARTMENTS, language)[2];
  assert.deepEqual(missing.unknown, ['pan']);
  assert.equal(missing.tokens.find(token => token.key === 'pan').wordId, undefined);
  assert.match(missing.text, /⟦pan⟧/u);
});

test('neighborhood additions preserve the pre-release dictionary and all saved user edits', () => {
  const language = createLanguage({ seed: 'neighborhood-compat' });
  assert.equal(createHash('sha256').update(JSON.stringify(language.words.slice(0, 241))).digest('hex'), 'ff59209bbb05d383051350bee4b42176d44423cd2c32c39d90952ccc138440bc');
  const additions = ['drop', 'fix', 'move', 'catch', 'miss', 'pan', 'pipe', 'food', 'broken'];
  assert.ok(additions.every(key => language.words.some(word => word.english === key)));
  assert.equal(new Set(CORE_VOCAB.map(word => word.id)).size, CORE_VOCAB.length);
  assert.equal(new Set(CORE_VOCAB.map(word => word.english)).size, CORE_VOCAB.length);
  language.words = language.words.slice(0, 241).filter(word => word.english !== 'bread');
  language.words.push({ id: 'pan', english: 'custom cookware', word: 'mypan', locked: true, notes: 'Keep ID.', pos: 'noun', category: 'Custom' });
  language.words.push({ id: 'custom-drop', english: ' DROP ', word: 'mydrop', locked: true, notes: 'Keep spelling.', pos: 'verb', category: 'Custom', extra: { mine: true } });
  const before = structuredClone(language), upgraded = ensureSceneVocabulary(language);
  assert.deepEqual(language, before);
  assert.deepEqual(upgraded.words.slice(0, before.words.length), before.words);
  assert.ok(!upgraded.words.some(word => word.english === 'bread'));
  assert.notEqual(upgraded.words.find(word => word.english === 'pan').id, 'pan');
  assert.equal(upgraded.words.filter(word => word.english.trim().toLowerCase() === 'drop').length, 1);
  assert.ok(additions.every(key => upgraded.words.some(word => word.english.trim().toLowerCase() === key)));
  assert.equal(new Set(upgraded.words.map(word => word.id)).size, upgraded.words.length);
  assert.equal(ensureSceneVocabulary(upgraded), upgraded);
  assert.doesNotThrow(() => validateLanguage(upgraded));
});

function assertWorld(world, cast) {
  assert.deepEqual(new Set(world.actors.map(actor => actor.id)), new Set(cast));
  assert.equal(new Set(world.props.map(prop => prop.id)).size, world.props.length);
  for (const actor of world.actors) {
    assert.ok(Number.isFinite(actor.x) && Number.isFinite(actor.y));
    assert.ok(actor.x >= 10 && actor.x <= 502 && actor.y >= 28 && actor.y <= 320);
    assert.ok([0, 1].includes(actor.step));
  }
  for (let a = 0; a < world.actors.length; a++) for (let b = a + 1; b < world.actors.length; b++) {
    const first = world.actors[a], second = world.actors[b];
    assert.ok(Math.abs(first.x - second.x) >= 20 || Math.abs(first.y - second.y) >= 28, `${first.id} overlaps ${second.id}`);
  }
  for (const prop of world.props) {
    const width = prop.width ?? 20, height = prop.height ?? 20;
    assert.ok(Number.isFinite(prop.x) && Number.isFinite(prop.y));
    assert.ok(prop.x - width / 2 >= 0 && prop.x + width / 2 <= 512 && prop.y - height >= 0 && prop.y <= 320);
    assert.ok(Number.isInteger(prop.frame ?? 0) && (prop.frame ?? 0) >= 0 && (prop.frame ?? 0) <= 7);
    assert.ok(prop.opacity === undefined || Number.isFinite(prop.opacity) && prop.opacity >= 0 && prop.opacity <= 1);
    assert.ok(prop.layer === undefined || ['back', 'front'].includes(prop.layer));
    for (const actor of world.actors) {
      assert.ok(prop.x + width / 2 <= actor.x - 10 || prop.x - width / 2 >= actor.x + 10 || prop.y <= actor.y - 28 || prop.y - height >= actor.y,
        `${prop.id} overlaps ${actor.id}`);
    }
  }
}

test('apartment incidents stay inside their rooms and clear of residents and floors', () => {
  const { APARTMENTS, sampleApartments } = api();
  const positions = [['kiln', 118, 130], ['brine', 365, 130], ['hush', 118, 263], ['moss', 365, 263]];
  for (let time = 0; time <= 12000; time += 125) for (const incident of ['pan', 'pipe']) {
    const world = sampleApartments(time, { incident });
    assertWorld(world, APARTMENTS.characters);
    assert.deepEqual(world.actors.map(({ id, x, y }) => [id, x, y]), positions);
    assert.equal(world.props.length, 1);
    const prop = world.props[0];
    assert.equal(prop.type, incident === 'pan' ? 'apartment-pan' : 'apartment-drip');
    assert.equal(prop.x, incident === 'pan' ? 146 : 390);
    assert.ok(prop.y >= (incident === 'pan' ? 106 : 89) && prop.y <= (incident === 'pan' ? 134 : 124));
    assert.ok(prop.frame <= 3);
  }
  assert.notDeepEqual(sampleApartments(0).props, sampleApartments(250).props);
});

test('market walkers have separate lanes and the cat carries the only food bowl during theft', () => {
  const { NIGHT_MARKET, sampleNightMarket } = api();
  for (let time = 0; time <= 120000; time += 500) for (const incident of ['snack', 'theft']) {
    const world = sampleNightMarket(time, { incident });
    assertWorld(world, NIGHT_MARKET.characters);
    assert.deepEqual(world.actors.slice(0, 4).map(({ id, x, y }) => [id, x, y]), [
      ['kiln', 116, 150], ['shard', 357, 150], ['moss', 152, 189], ['vesper', 320, 189],
    ]);
    for (const id of ['brine', 'slate']) {
      const actor = world.actors.find(actor => actor.id === id);
      assert.ok(actor.x >= 44 && actor.x <= 450);
      assert.equal(actor.y, id === 'brine' ? 252 : 284);
    }
    const steam = world.props.find(prop => prop.type === 'market-steam');
    assert.deepEqual([steam.x, steam.y], [118, 110]);
    assert.ok(steam.frame <= 3);
    const cat = world.props.find(prop => prop.type === 'market-critter');
    const bowl = world.props.find(prop => prop.type === 'market-bowl');
    if (incident === 'theft') {
      assert.equal(bowl, undefined);
      assert.ok(cat.x >= 188 && cat.x <= 266 && cat.y === 219 && [2, 3].includes(cat.frame));
    } else {
      assert.equal(cat, undefined);
      assert.ok(bowl.x - bowl.width / 2 >= 129 && bowl.x + bowl.width / 2 <= 187, 'The waiting bowl fits the counter beside Kiln');
      assert.ok(bowl.y >= 128 && bowl.y <= 134, 'The waiting bowl rests on the countertop');
    }
  }
  const positions = world => world.actors.map(({ id, x, y }) => [id, x, y]);
  assert.notDeepEqual(positions(sampleNightMarket(0)), positions(sampleNightMarket(2000)));
  assert.deepEqual(positions(sampleNightMarket(2000, { incident: 'snack' })), positions(sampleNightMarket(2000, { incident: 'theft' })));
});

test('train landscape remains in window apertures while luggage stays in the clear aisle', () => {
  const { TRAIN_CARRIAGE, sampleTrain } = api();
  const positions = [['vesper', 115, 178], ['rook', 192, 178], ['moss', 267, 178], ['hush', 80, 286], ['brine', 345, 286], ['slate', 423, 286]];
  for (let time = 0; time <= 60000; time += 250) for (const incident of ['stop', 'luggage']) {
    const world = sampleTrain(time, { incident });
    assertWorld(world, TRAIN_CARRIAGE.characters);
    assert.deepEqual(world.actors.map(({ id, x, y }) => [id, x, y]), positions);
    const windows = world.props.filter(prop => prop.type === 'train-window');
    assert.deepEqual(windows.map(({ x, y, width, height }) => [x, y, width, height]), [[112, 88, 110, 62], [256, 88, 110, 62], [400, 88, 110, 62]]);
    const bag = world.props.find(prop => prop.type === 'train-bag');
    if (incident === 'luggage') assert.ok(bag.x >= 100 && bag.x <= 420 && bag.y === 233 && [0, 1].includes(bag.frame));
    else assert.equal(bag, undefined);
  }
  assert.notDeepEqual(sampleTrain(0).props, sampleTrain(1000).props);
  assert.notEqual(sampleTrain(0, { incident: 'luggage' }).props.at(-1).x, sampleTrain(1000, { incident: 'luggage' }).props.at(-1).x);
});

test('all samplers freeze reduced motion and normalize invalid time without retaining mutations', () => {
  const { sampleApartments, sampleNightMarket, sampleTrain } = api();
  for (const [sample, incidents] of [[sampleApartments, ['pan', 'pipe']], [sampleNightMarket, ['snack', 'theft']], [sampleTrain, ['stop', 'luggage']]]) {
    for (const incident of incidents) {
      const reduced = sample(0, { incident, reduced: true });
      for (const time of [250, 90000, 1e9, Number.MAX_VALUE]) assert.deepEqual(sample(time, { incident, reduced: true }), reduced);
      assert.ok(reduced.actors.every(actor => actor.step === 0 && actor.activity !== 'walk'));
      for (const time of [undefined, null, NaN, Infinity, -Infinity, -1000, 'later']) assert.deepEqual(sample(time, { incident }), sample(0, { incident }));
      const world = sample(1000, { incident });
      assert.deepEqual(world, sample(1000, { incident }));
      const original = structuredClone(world);
      world.actors[0].x = -1;
      world.props[0].x = -1;
      assert.deepEqual(sample(1000, { incident }), original);
      assertWorld(sample(Number.MAX_VALUE, { incident }), original.actors.map(actor => actor.id));
    }
    assert.doesNotThrow(() => sample(1000, { incident: 'unknown' }));
  }
});
