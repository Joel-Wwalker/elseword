import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createLanguage, validateLanguage } from '../src/engine.js';
import { CORE_VOCAB } from '../src/vocabulary.js';
import { ensureSceneVocabulary } from '../src/scene-language.js';
import { CITY_BLOCK, compileCityDialogue } from '../src/city-block.js';
import { CHARACTERS } from '../src/scenes.js';
import { neighborhoodPropSVG } from '../src/neighborhood-art.js';

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
    ['the soup be ready. i can eat now.', 'what PAST be that Q? you be alive Q?', 'yes. i PAST drop the pan. go back to sleep.', 'the water be cold!', 'the pipe be broken. again.', 'again Q? i PAST fix it yesterday.'],
    ['i need the soup. i be hungry.', 'wait. the bowl be hot.', 'damn. i FUT wait.', 'no! that PAST be my food!', 'the cat PAST eat it.', 'i hope the cat can pay.'],
    ['wait! this be my stop!', 'that PAST be your stop.', 'shit. i PAST wave at it.', 'my bag move. my wallet be inside!', 'i FUT catch it. NEG panic.', 'you PAST miss the bag. i can panic now Q?'],
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
    ['SVO', 'yes. i PAST drop the pan. go back to sleep.', 'what PAST be that Q? you be alive Q?', 'the cat PAST eat it.', 'you PAST miss the bag. i can panic now Q?'],
    ['SOV', 'yes. i the pan PAST drop. go back to sleep.', 'what that PAST be Q? you alive be Q?', 'the cat it PAST eat.', 'you the bag PAST miss. i can panic now Q?'],
    ['VSO', 'yes. PAST drop i the pan. go back to sleep.', 'PAST be what that Q? be you alive Q?', 'PAST eat the cat it.', 'PAST miss you the bag. can panic i now Q?'],
    ['VOS', 'yes. PAST drop the pan i. go back to sleep.', 'PAST be that what Q? be alive you Q?', 'PAST eat it the cat.', 'PAST miss the bag you. can panic i now Q?'],
    ['OSV', 'yes. the pan i PAST drop. go back to sleep.', 'that what PAST be Q? alive you be Q?', 'it the cat PAST eat.', 'the bag you PAST miss. i can panic now Q?'],
    ['OVS', 'yes. the pan PAST drop i. go back to sleep.', 'that PAST be what Q? alive be you Q?', 'it PAST eat the cat.', 'the bag PAST miss you. can panic i now Q?'],
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
  assert.equal(compilePresetDialogue(APARTMENTS, language)[1].text, 'what be that? you be alive?');
  assert.equal(compilePresetDialogue(TRAIN_CARRIAGE, language)[4].text, 'i catch it. NEG panic.');
});

test('custom RTL glyphs retain root ownership, punctuation, long words, and visible unknowns', () => {
  const { APARTMENTS, compilePresetDialogue } = api();
  const language = literalLanguage();
  // Isolate the dropped-pan clause so this glyph fixture keeps its boundary cases
  // even when the surrounding dialogue includes more sentences.
  const panLine = APARTMENTS.lines.find(line => line.id === 'pan-3');
  const fixture = { lines: [{ ...panLine, syntax: panLine.syntax.filter(node => node.verb === 'drop') }] };
  const replacements = { i: 'e\u0301', drop: 'sh', the: '🙂', pan: 'a' };
  for (const word of language.words) if (Object.hasOwn(replacements, word.english)) word.word = replacements[word.english];
  language.script = { style: 'custom', direction: 'rtl', glyphs: { é: 'אב', sh: '𐀀', '🙂': '☽△', 'a.': 'Z' } };
  const line = compilePresetDialogue(fixture, language)[0];
  assert.equal(line.text, 'אב PAST 𐀀 ☽△ Z');
  assert.deepEqual(line.tokens.map(({ key, marker, start, end, text }) => [key ?? marker, start, end, text]), [
    ['i', 0, 2, 'אב'], ['past', 3, 7, 'PAST'], ['drop', 8, 9, '𐀀'], ['the', 10, 12, '☽△'], ['pan', 13, 14, 'Z'],
  ]);
  language.script.glyphs['🙂 a'] = 'XX';
  const shared = compilePresetDialogue(fixture, language)[0];
  assert.equal(shared.text, 'אב PAST 𐀀 XX.');
  assert.deepEqual(shared.tokens.filter(token => token.kind === 'word').map(token => token.key), ['i', 'drop']);
  language.words.find(word => word.english === 'pan').word = '𐀀'.repeat(80);
  language.script.glyphs['𐀀'] = 'abcdefgh';
  const long = compilePresetDialogue(fixture, language)[0];
  const pan = long.tokens.find(token => token.key === 'pan');
  assert.equal(pan.text, 'abcdefgh'.repeat(80));
  assert.equal([...long.text].slice(pan.start, pan.end).join(''), pan.text);
  language.words = language.words.filter(word => word.english !== 'pan');
  const missing = compilePresetDialogue(fixture, language)[0];
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

test('nested hope clauses and negative imperatives retain meaning in every word order', () => {
  const { NIGHT_MARKET, TRAIN_CARRIAGE, compilePresetDialogue } = api();
  const language = literalLanguage();
  const expected = [
    ['SVO', 'i hope the cat can pay.'],
    ['SOV', 'i the cat can pay hope.'],
    ['VSO', 'hope i can pay the cat.'],
    ['VOS', 'hope can pay the cat i.'],
    ['OSV', 'the cat can pay i hope.'],
    ['OVS', 'can pay the cat hope i.'],
  ];
  for (const [order, hope] of expected) {
    language.grammar.order = order;
    const market = compilePresetDialogue(NIGHT_MARKET, language).find(line => line.id === 'theft-3');
    assert.equal(market.text, hope);
    assert.deepEqual(market.unknown, []);
    const reassurance = compilePresetDialogue(TRAIN_CARRIAGE, language).find(line => line.id === 'luggage-2');
    assert.ok(reassurance.text.endsWith(' NEG panic.'));
    assert.equal(reassurance.tokens.filter(token => token.marker === 'negative').length, 1);
    assert.equal(reassurance.tokens.filter(token => token.key === 'panic').length, 1);
  }
});

test('separate alarm questions and a repeated fragment receive their own question markers', () => {
  const { APARTMENTS, compilePresetDialogue } = api();
  const language = literalLanguage();
  const lines = compilePresetDialogue(APARTMENTS, language);
  assert.equal(lines[1].text, 'what PAST be that Q? you be alive Q?');
  assert.equal(lines[1].tokens.filter(token => token.marker === 'question').length, 2);
  assert.equal(lines[5].text, 'again Q? i PAST fix it yesterday.');
  assert.equal(lines[5].tokens.filter(token => token.marker === 'question').length, 1);
  language.grammar.question = '';
  assert.equal(compilePresetDialogue(APARTMENTS, language)[1].text, 'what PAST be that? you be alive?');
  assert.equal(compilePresetDialogue(APARTMENTS, language)[5].text, 'again? i PAST fix it yesterday.');
});

test('expressive dialogue appends roots without changing the previous 250 words or saved edits', () => {
  const language = createLanguage({ seed: 'emotive-compat' });
  assert.equal(createHash('sha256').update(JSON.stringify(language.words.slice(0, 250))).digest('hex'), '4fa0ebc74edf12a999c1b3318c1057da2cf57436967dd6235596261bc0ef1512');
  const additions = ['face', 'alive', 'hungry', 'wave', 'panic', 'at'];
  assert.deepEqual(new Set(language.words.slice(250).map(word => word.english)), new Set(additions));
  language.words = language.words.slice(0, 250);
  language.words.push({ id: 'face', english: 'custom mask', word: 'mymask', locked: true, notes: 'Keep ID.', pos: 'noun', category: 'Custom' });
  language.words.push({ id: 'personal-wave', english: ' WAVE ', word: 'mywave', locked: true, notes: 'Keep spelling.', pos: 'verb', category: 'Custom', extra: { mine: true } });
  const before = structuredClone(language), upgraded = ensureSceneVocabulary(language);
  assert.deepEqual(language, before);
  assert.deepEqual(upgraded.words.slice(0, before.words.length), before.words);
  assert.notEqual(upgraded.words.find(word => word.english === 'face').id, 'face');
  assert.equal(upgraded.words.filter(word => word.english.trim().toLowerCase() === 'wave').length, 1);
  assert.ok(additions.every(key => upgraded.words.some(word => word.english.trim().toLowerCase() === key)));
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
    assert.ok(prop.y >= (incident === 'pan' ? 106 : 103) && prop.y <= (incident === 'pan' ? 134 : 140));
    assert.ok(prop.frame <= 3);
  }
  assert.notDeepEqual(sampleApartments(0).props, sampleApartments(250).props);
});

// Measure the emitted drip's axis-aligned SVG shapes, including the transparent
// padding around them, so sampler coordinates alone cannot hide an art mismatch.
function dripBounds(prop) {
  const markup = neighborhoodPropSVG(prop), points = [];
  assert.doesNotMatch(markup, /transform=/, 'Drip geometry must be measured after any new transform');
  for (const [, attrs] of markup.matchAll(/<rect\s([^>]+)\/>/g)) {
    const value = name => Number(attrs.match(new RegExp(`\\b${name}="([^"]+)"`))[1]);
    points.push([value('x'), value('y')], [value('x') + value('width'), value('y') + value('height')]);
  }
  for (const [, commands] of markup.matchAll(/<path d="([^"]+)"/g)) {
    let x = 0, y = 0, start;
    for (const [, command, args] of commands.matchAll(/([a-z])([^a-z]*)/gi)) {
      const values = args.trim().split(/[\s,]+/).map(Number);
      if (command === 'M') { [x, y] = values; start = [x, y]; }
      else if (command === 'H') x = values[0];
      else if (command === 'h') x += values[0];
      else if (command === 'V') y = values[0];
      else if (command === 'v') y += values[0];
      else if (command.toLowerCase() === 'z') [x, y] = start;
      else assert.fail(`Unmeasured drip command ${command}`);
      points.push([x, y]);
    }
  }
  assert.ok(points.length, 'The leak has visible artwork');
  return {
    top: prop.y - prop.height + Math.min(...points.map(([, y]) => y)),
    bottom: prop.y - prop.height + Math.max(...points.map(([, y]) => y)),
  };
}

test('visible water falls from the pipe outlet and splashes on the basin rim', () => {
  const { sampleApartments } = api();
  const dripAt = time => sampleApartments(time, { incident: 'pipe' }).props[0];
  assert.equal(dripBounds(dripAt(0)).top, 86, 'The drop begins at the pipe outlet, outside its metal');
  let previousBottom = 0;
  for (let time = 0; time < 675; time++) {
    const bounds = dripBounds(dripAt(time));
    assert.ok(bounds.top >= 86 && bounds.bottom <= 132, `Water leaves the outlet-to-basin gap at ${time}ms`);
    assert.ok(bounds.bottom >= previousBottom, `The falling drop moves upward at ${time}ms`);
    previousBottom = bounds.bottom;
  }
  assert.equal(previousBottom, 132, 'The drop reaches the basin before changing to a splash');
  for (const time of [675, 700, 800, 899]) {
    const bounds = dripBounds(dripAt(time));
    assert.equal(bounds.bottom, 132, `The splash must touch the fixed basin rim at ${time}ms`);
    assert.ok(bounds.top >= 128, 'Only a small splash remains at impact, without a suspended drop');
  }
  assert.deepEqual(dripAt(900), dripAt(0), 'Each leak cycle restarts at the outlet');
});

test('the food thief turns with its route even between matching walking frames', () => {
  const { sampleNightMarket } = api();
  const catAt = time => sampleNightMarket(time, { incident: 'theft' }).props.find(prop => prop.id === 'food-thief');
  const right = catAt(3499), left = catAt(3500);
  assert.equal(right.frame, left.frame, 'The turn happens without requiring a walking-frame change');
  assert.equal(right.direction, 'right');
  assert.equal(left.direction, 'left');
  assert.doesNotMatch(neighborhoodPropSVG(right), /scale\(-1 1\)/);
  assert.match(neighborhoodPropSVG(left), /transform="translate\(20 0\) scale\(-1 1\)"/, 'The cat and its food face left together');
  assert.equal(catAt(7000).direction, 'right', 'The next circuit turns back toward the right');
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
