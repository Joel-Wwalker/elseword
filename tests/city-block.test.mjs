import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createLanguage, validateLanguage } from '../src/engine.js';
import { ensureSceneVocabulary } from '../src/scene-language.js';
import { CHARACTERS } from '../src/scenes.js';

let city;
try { city = await import('../src/city-block.js'); }
catch (error) { city = { loadError: error.message }; }

function api() {
  assert.equal(typeof city.compileCityDialogue, 'function', city.loadError);
  assert.equal(typeof city.sampleCity, 'function');
  return city;
}

function literalLanguage() {
  const language = createLanguage({ seed: 'city-grammar' });
  language.words = language.words.map(entry => ({ ...entry, word: entry.english }));
  language.grammar = { order: 'SVO', adjective: 'before', plural: '-PL', past: 'PAST', future: 'FUT', negative: 'NEG', question: 'Q' };
  return language;
}

test('city speech uses existing residents and inspectable roots throughout all three incidents', () => {
  const { CITY_BLOCK, compileCityDialogue } = api();
  const language = literalLanguage();
  const before = structuredClone(language);
  const lines = compileCityDialogue(language);
  assert.deepEqual(lines.map(line => line.incident), ['wallet', 'wallet', 'wallet', 'delivery', 'delivery', 'delivery', 'building', 'building', 'building']);
  assert.equal(new Set(lines.map(line => line.id)).size, lines.length);
  assert.deepEqual(new Set(CITY_BLOCK.characters), new Set(CHARACTERS.map(character => character.id)));
  for (const [index, line] of lines.entries()) {
    assert.ok(CITY_BLOCK.characters.includes(line.speaker));
    assert.equal(line.english, CITY_BLOCK.lines[index].english);
    assert.ok(CITY_BLOCK.lines[index].syntax.length);
    assert.deepEqual(line.unknown, []);
    assert.ok(line.duration >= [...line.text].length * 43 + 2400);
    for (const token of line.tokens.filter(token => token.kind === 'word')) {
      assert.ok(CITY_BLOCK.words.includes(token.key));
      assert.equal(language.words.find(word => word.id === token.wordId)?.english, token.key);
    }
  }
  assert.equal(new Set(CITY_BLOCK.words).size, CITY_BLOCK.words.length);
  assert.deepEqual(language, before, 'Compiling never edits the active language');
});

test('city clauses reorder as authored while preserving tense, possessives and question markers', () => {
  const { compileCityDialogue } = api();
  const language = literalLanguage();
  const orders = [
    ['SVO', 'damn, i PAST forget my wallet!', 'you PAST eat the bread. that bread NEG PAST be free.', 'this be your package Q? please say yes.'],
    ['SOV', 'damn, i my wallet PAST forget!', 'you the bread PAST eat. that bread free NEG PAST be.', 'this your package be Q? please yes say.'],
    ['VSO', 'damn, PAST forget i my wallet!', 'PAST eat you the bread. NEG PAST be that bread free.', 'be this your package Q? please say yes.'],
    ['VOS', 'damn, PAST forget my wallet i!', 'PAST eat the bread you. NEG PAST be free that bread.', 'be your package this Q? please say yes.'],
    ['OSV', 'damn, my wallet i PAST forget!', 'the bread you PAST eat. free that bread NEG PAST be.', 'your package this be Q? please yes say.'],
    ['OVS', 'damn, my wallet PAST forget i!', 'the bread PAST eat you. free NEG PAST be that bread.', 'your package be this Q? please yes say.'],
  ];
  for (const [order, wallet, bread, packageQuestion] of orders) {
    language.grammar.order = order;
    const lines = compileCityDialogue(language);
    assert.equal(lines[0].text, wallet);
    assert.equal(lines[1].text, bread);
    assert.equal(lines[3].text, packageQuestion);
  }
  language.grammar.order = 'SVO';
  assert.deepEqual(compileCityDialogue(language).slice(2).map(line => line.text), [
    'sorry. i FUT come back. please forget my face.', 'this be your package Q? please say yes.', 'i PAST order one book. one.',
    'this be a chair. you can read on it.', 'the wall be ready. i can sleep now.', 'good. where the door be Q?', 'shit. i PAST forget the door.',
  ]);
  language.grammar.past = '';
  language.grammar.question = '';
  assert.equal(compileCityDialogue(language)[3].text, 'this be your package? please say yes.');
  assert.equal(compileCityDialogue(language)[4].text, 'i order one book. one.');
});

test('custom symbols and RTL keep codepoint spans attached to their original dictionary entries', () => {
  const { compileCityDialogue } = api();
  const language = literalLanguage();
  const replacements = { damn: 'sha', i: 'a', forget: 'sh', my: '🙂', wallet: 'aash' };
  for (const entry of language.words) if (Object.hasOwn(replacements, entry.english)) entry.word = replacements[entry.english];
  language.grammar.past = 'sh';
  language.script = { style: 'custom', direction: 'rtl', glyphs: { sh: '𐀀', a: 'אב', '🙂': '☽△' } };
  const line = compileCityDialogue(language)[0];
  assert.equal(line.text, '𐀀אב, אב 𐀀 𐀀 ☽△ אבאב𐀀!');
  assert.deepEqual(line.tokens.map(({ key, marker, start, end, text }) => [key ?? marker, start, end, text]), [
    ['damn', 0, 3, '𐀀אב'], ['i', 5, 7, 'אב'], ['past', 8, 9, '𐀀'],
    ['forget', 10, 11, '𐀀'], ['my', 12, 14, '☽△'], ['wallet', 15, 20, 'אבאב𐀀'],
  ]);
  for (const token of line.tokens) {
    assert.equal([...line.text].slice(token.start, token.end).join(''), token.text);
    if (token.kind === 'word') assert.equal(language.words.find(word => word.id === token.wordId)?.english, token.key);
  }
});

test('long user words and missing vocabulary stay complete and inspectable', () => {
  const { compileCityDialogue } = api();
  const language = literalLanguage();
  language.words.find(word => word.english === 'wallet').word = '𐀀'.repeat(80);
  language.script = { style: 'custom', direction: 'ltr', glyphs: { '𐀀': 'abcdefgh' } };
  const line = compileCityDialogue(language)[0];
  const wallet = line.tokens.find(token => token.key === 'wallet');
  assert.equal(wallet.text, 'abcdefgh'.repeat(80));
  assert.equal([...line.text].slice(wallet.start, wallet.end).join(''), wallet.text);
  assert.ok(line.duration >= [...line.text].length * 43 + 2400);
  language.words = language.words.filter(word => word.english !== 'wallet');
  const unknown = compileCityDialogue(language)[0];
  assert.deepEqual(unknown.unknown, ['wallet']);
  assert.equal(unknown.tokens.find(token => token.key === 'wallet').wordId, undefined);
  assert.match(unknown.text, /⟦wallet⟧/u);
});

test('glyphs consuming punctuation cannot absorb the following word inspection target', () => {
  const { compileCityDialogue } = api();
  const language = literalLanguage();
  language.script = { style: 'custom', direction: 'ltr', glyphs: { 'damn,': 'Z', i: 'XX' } };
  const line = compileCityDialogue(validateLanguage(language))[0];
  assert.equal(line.text, 'Z XX PAST forget my wallet!');
  assert.deepEqual(line.tokens.slice(0, 2).map(({ key, text, start, end }) => ({ key, text, start, end })), [
    { key: 'damn', text: 'Z', start: 0, end: 1 },
    { key: 'i', text: 'XX', start: 2, end: 4 },
  ]);
});

test('one glyph shared by two lexical roots stays plain text while independent words remain inspectable', () => {
  const { compileCityDialogue } = api();
  const language = literalLanguage();
  language.words.find(word => word.english === 'my').word = 'ma';
  language.words.find(word => word.english === 'wallet').word = 'wa';
  language.script = { style: 'custom', direction: 'rtl', glyphs: { 'ma wa': '𐀀', i: 'XX' } };
  const line = compileCityDialogue(validateLanguage(language))[0];
  assert.equal(line.text, 'damn, XX PAST forget 𐀀!');
  assert.deepEqual(line.tokens.filter(token => token.kind === 'word').map(token => token.key), ['damn', 'i', 'forget']);
  assert.equal(line.tokens.find(token => token.key === 'i').text, 'XX');
  const glyphIndex = [...line.text].indexOf('𐀀');
  assert.ok(line.tokens.every(token => token.end <= glyphIndex || token.start > glyphIndex));
});

test('NFC composition keeps source token ownership after combining sequences shrink', () => {
  const { compileCityDialogue } = api();
  const language = literalLanguage();
  language.words.find(word => word.english === 'damn').word = 'e\u0301';
  language.words.find(word => word.english === 'i').word = '\u1100\u1161';
  language.script = { style: 'custom', direction: 'ltr', glyphs: { 'é,': '𐀀', '가': 'XX' } };
  const line = compileCityDialogue(language)[0];
  assert.equal(line.text, '𐀀 XX PAST forget my wallet!');
  assert.deepEqual(line.tokens.slice(0, 2).map(({ key, text, start, end }) => ({ key, text, start, end })), [
    { key: 'damn', text: '𐀀', start: 0, end: 1 },
    { key: 'i', text: 'XX', start: 2, end: 4 },
  ]);
});

test('repeated words in one delivery line retain separate Unicode inspection targets', () => {
  const { compileCityDialogue } = api();
  const language = literalLanguage();
  const one = language.words.find(word => word.english === 'one');
  one.word = 'e\u0301';
  language.script = { style: 'custom', direction: 'rtl', glyphs: { 'é': '𐀀' } };
  const line = compileCityDialogue(language).find(line => line.id === 'delivery-2');
  assert.equal(line.text, 'i PAST order 𐀀 book. 𐀀.');
  assert.deepEqual(line.tokens.filter(token => token.key === 'one').map(({ wordId, start, end, text }) => ({ wordId, start, end, text })), [
    { wordId: one.id, start: 13, end: 14, text: '𐀀' },
    { wordId: one.id, start: 21, end: 22, text: '𐀀' },
  ]);
});

test('new city vocabulary preserves every pre-city generated entry and upgrades saved edits only once', () => {
  const language = createLanguage({ seed: 'city-compat' });
  assert.equal(createHash('sha256').update(JSON.stringify(language.words.slice(0, 233))).digest('hex'), '126add1cada7693d7b76a4aef02c0169cbe74743d292caed4021cf63658a7eb7');
  const additions = ['damn', 'shit', 'forget', 'order', 'wallet', 'package', 'wall', 'back'];
  assert.ok(additions.every(key => language.words.some(word => word.english === key)));
  language.words = language.words.slice(0, 233).filter(word => word.english !== 'bread');
  language.words.push({ id: 'wallet', english: 'custom purse', word: 'mypurse', locked: true, notes: 'Keep this ID.', pos: 'noun', category: 'Custom' });
  language.words.push({ id: 'my-forget', english: ' FORGET ', word: 'memoryword', locked: true, notes: 'Keep this spelling.', pos: 'verb', category: 'Custom', extra: { mine: true } });
  const before = structuredClone(language);
  const upgraded = ensureSceneVocabulary(language);
  assert.deepEqual(language, before);
  assert.deepEqual(upgraded.words.slice(0, before.words.length), before.words);
  assert.ok(!upgraded.words.some(word => word.english === 'bread'));
  assert.ok(additions.every(key => upgraded.words.some(word => word.english.trim().toLowerCase() === key)));
  assert.notEqual(upgraded.words.find(word => word.english === 'wallet').id, 'wallet');
  assert.equal(upgraded.words.filter(word => word.english.trim().toLowerCase() === 'forget').length, 1);
  assert.equal(new Set(upgraded.words.map(word => word.id)).size, upgraded.words.length);
  assert.equal(ensureSceneVocabulary(upgraded), upgraded);
  assert.doesNotThrow(() => validateLanguage(upgraded));
});

test('residents keep separate safe corridors across time and every foreground incident', () => {
  const { sampleCity } = api();
  const anchors = { moss: [145, 167], kiln: [99, 135], vesper: [280, 214], hush: [318, 214], rook: [413, 133], brine: [453, 148] };
  for (const time of [0, 1, 250, 1000, 6000, 17000, 24000, 48000, 90000, 1e9]) {
    for (const incident of ['wallet', 'delivery', 'building']) {
      const world = sampleCity(time, { incident });
      assert.equal(world.actors.length, 8);
      assert.deepEqual(sampleCity(time, { incident }), world);
      for (const actor of world.actors) {
        assert.ok(actor.x >= 10 && actor.x <= 502 && actor.y >= 28 && actor.y <= 320);
        if (anchors[actor.id]) assert.deepEqual([actor.x, actor.y], anchors[actor.id]);
        else {
          assert.ok(actor.x >= 44 && actor.x <= 348);
          assert.equal(actor.y, actor.id === 'slate' ? 254 : 282);
        }
      }
      for (let a = 0; a < world.actors.length; a++) for (let b = a + 1; b < world.actors.length; b++) {
        const first = world.actors[a], second = world.actors[b];
        assert.ok(Math.abs(first.x - second.x) >= 20 || Math.abs(first.y - second.y) >= 28, `${first.id} overlaps ${second.id} at ${time}`);
      }
      for (const prop of world.props) assert.ok(prop.x >= 10 && prop.x <= 502 && prop.y >= 20 && prop.y <= 320);
    }
  }
  const positions = world => world.actors.map(({ id, x, y }) => ({ id, x, y }));
  assert.notDeepEqual(positions(sampleCity(0)), positions(sampleCity(1000)));
  assert.deepEqual(positions(sampleCity(1000, { incident: 'wallet' })), positions(sampleCity(1000, { incident: 'building' })));
  const sampled = sampleCity(1000);
  sampled.actors[0].x = -1;
  assert.equal(sampleCity(1000).actors[0].x, 145, 'Sampling returns fresh data');
});

test('reduced motion and invalid time never start walkers or hammering', () => {
  const { sampleCity } = api();
  const reduced = sampleCity(0, { incident: 'building', reduced: true });
  assert.deepEqual(sampleCity(90000, { incident: 'building', reduced: true }), reduced);
  assert.equal(reduced.hammer, false);
  assert.ok(reduced.actors.every(actor => actor.step === 0 && !['walk', 'hammer'].includes(actor.activity)));
  for (const time of [NaN, Infinity, -1000]) assert.deepEqual(sampleCity(time), sampleCity(0));
  assert.ok([0, 250, 500, 750, 1000].some(time => sampleCity(time, { incident: 'building' }).hammer));
  assert.ok(sampleCity(1000, { incident: 'delivery' }).props.some(prop => prop.type === 'parcel'));
  assert.ok(sampleCity(1000, { incident: 'building' }).props.some(prop => prop.type === 'plank'));
});
