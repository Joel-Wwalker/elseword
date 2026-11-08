import test from 'node:test';
import assert from 'node:assert/strict';

let sceneData;
try {
  sceneData = await import('../src/scenes.js');
} catch (error) {
  sceneData = { loadError: error.message };
}

function data() {
  assert.ok(Array.isArray(sceneData.SCENES), `Scene definitions must be available: ${sceneData.loadError || ''}`);
  assert.ok(Array.isArray(sceneData.CHARACTERS), 'Character definitions must be available');
  return sceneData;
}

test('all eight requested locations have distinct scene identities', () => {
  const { SCENES } = data();
  assert.equal(SCENES.length, 8);
  assert.deepEqual(new Set(SCENES.map(scene => scene.id)), new Set([
    'bakery', 'market', 'busstop', 'library', 'cafe', 'tickets', 'rooftop', 'apothecary',
  ]));
  assert.equal(new Set(SCENES.map(scene => scene.name)).size, 8);
  for (const scene of SCENES) {
    assert.ok(scene.location && scene.description && scene.tag, `${scene.id} needs location context`);
    assert.ok(scene.prop, `${scene.id} needs an animated scene prop`);
  }
});

test('eight original cast members map to valid atlas rows and all appear in scenes', () => {
  const { SCENES, CHARACTERS } = data();
  assert.equal(CHARACTERS.length, 8);
  assert.equal(new Set(CHARACTERS.map(character => character.id)).size, 8);
  const present = new Set(SCENES.flatMap(scene => scene.characters));
  assert.deepEqual(present, new Set(CHARACTERS.map(character => character.id)));
  for (const character of CHARACTERS) {
    assert.match(character.atlas, /^assets\/(?:humanoid-creature-atlas|townfolk-[123])\.png$/);
    assert.ok(character.row === 0 || character.row === 1, `${character.id} has an invalid atlas row`);
    assert.ok(character.name && character.title && character.description);
    assert.match(character.color, /^#[0-9a-f]{6}$/i);
  }
});

test('conversations reference valid cast, retain gloss tokens, and expose the rendered word keys', async () => {
  const { SCENES, CHARACTERS } = data();
  const { getSceneLineWords } = await import('../src/scene-language.js');
  const cast = new Set(CHARACTERS.map(character => character.id));
  for (const scene of SCENES) {
    assert.equal(scene.characters.length, 2);
    assert.notEqual(scene.characters[0], scene.characters[1]);
    for (const id of scene.characters) assert.ok(cast.has(id), `${scene.id} references missing ${id}`);
    for (const episode of sceneData.getSceneEpisodes(scene.id)) {
      assert.ok(episode.lines.length >= 4 && episode.lines.length <= 6);
      assert.equal(new Set(episode.words).size, episode.words.length);
      const expectedWords = new Set();
      const allLines = [...episode.lines, ...(episode.choice?.options.flatMap(option => option.lines) ?? [])];
      for (const line of allLines) {
        assert.ok(line.speaker === 0 || line.speaker === 1);
        assert.ok(line.english.trim().length > 0);
        const tokens = line.english.toLowerCase().match(/[a-z]+/g) || [];
        assert.deepEqual(line.keys, tokens, `${scene.id}: spoken English and gloss keys diverged`);
        for (const key of getSceneLineWords(line)) {
          expectedWords.add(key);
          assert.ok(episode.words.includes(key), `${scene.id} hides rendered context word ${key}`);
        }
      }
      assert.deepEqual(new Set(episode.words), expectedWords, `${scene.id} context includes unused words`);
    }
  }
});

test('the approved bakery begins with the starter language bread order', () => {
  const { SCENES } = data();
  const bakery = SCENES.find(scene => scene.id === 'bakery');
  assert.deepEqual(bakery.characters, ['moss', 'kiln']);
  assert.equal(bakery.lines[0].english, 'One bread, please.');
  assert.deepEqual(bakery.lines[0].keys, ['one', 'bread', 'please']);
  assert.equal(bakery.lines[1].english, 'One bread.');
});

test('the starter dictionary translates every displayed English line without unknown words', async () => {
  const { SCENES } = data();
  const { createLanguage, translateText } = await import('../src/engine.js');
  const language = createLanguage({ name: 'Luma', seed: 'scene-coverage', preset: 'soft' });
  for (const scene of SCENES) {
    for (const episode of sceneData.getSceneEpisodes(scene.id)) {
      for (const line of episode.lines) {
        const result = translateText(line.english, language);
        assert.deepEqual(result.unknown, [], `${scene.id}: ${line.english}`);
        assert.ok(result.text.trim().length > 0);
      }
    }
  }
});

test('dialogue timing preserves the exact gloss and uses the current dictionary for every line', async () => {
  const { buildDialogue } = await import('../src/scene-player.js');
  const { createLanguage } = await import('../src/engine.js');
  const { renderSceneLine } = await import('../src/scene-language.js');
  const { SCENES } = data();
  const language = createLanguage({ name: 'Luma', seed: 'dialogue-coverage', preset: 'soft' });
  const bakery = SCENES.find(scene => scene.id === 'bakery');
  for (const scene of SCENES.flatMap(location => sceneData.getSceneEpisodes(location.id).map(episode => sceneData.getSceneEpisode(location.id, episode.id)))) {
    const entries = buildDialogue(scene, language);
    assert.equal(entries.length, scene.lines.length);
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index];
      const expected = renderSceneLine(scene.lines[index], language);
      assert.equal(entry.english, scene.lines[index].english);
      assert.equal(entry.text, expected.text);
      assert.deepEqual(entry.unknown, expected.unknown);
      assert.ok(entry.duration >= 2600, 'Each line needs enough reading time');
      assert.equal(entry.end - entry.start, entry.duration);
      assert.equal(entry.start, index ? entries[index - 1].end : 0);
    }
  }
  language.words.find(word => word.english.toLowerCase() === 'bread').word = 'zorra';
  const changed = buildDialogue(bakery, language);
  assert.match(changed[0].text, /zorra/i);
  language.words = language.words.filter(word => word.english.toLowerCase() !== 'bread');
  const missing = buildDialogue(bakery, language);
  assert.deepEqual(missing[0].unknown, renderSceneLine(bakery.lines[0], language).unknown);
  assert.ok(missing[0].unknown.length > 0, 'Unknown words must remain visible to the player');
});

test('all eight original English scripts remain unchanged', () => {
  const original = {
    bakery: ['One bread, please.', 'One bread.', 'This bread is big.', 'Yes. The bag is small.', 'I need another bag.'],
    market: ['How much is this apple?', 'Two coins.', 'It has a leaf.', 'The leaf is free.', 'I will take the leaf.'],
    busstop: ['Is the bus late?', 'The bus is coming.', 'You said that before.', 'The rain is here.', 'The rain is on time.'],
    library: ['I need a quiet book.', 'All books are quiet.', 'This one has a bell.', 'That is the door.', 'I will read outside.'],
    cafe: ['One hot tea, please.', 'The cup is empty.', 'Where is the tea?', 'It needs water.', 'I can wait for water.'],
    tickets: ['One ticket to the sea.', 'The train stops here.', 'Where is the sea?', 'Very far from here.', 'Then two tickets, please.'],
    rooftop: ['The stars are bright.', 'That is a window.', 'And that star?', 'Another window.', 'I hope the moon is real.'],
    apothecary: ['I need a bottle of sleep.', 'One small bottle.', 'Does it work?', 'The shop is closed.', 'That is a good sign.'],
  };
  for (const scene of data().SCENES) {
    assert.deepEqual(scene.lines.map(line => line.english), original[scene.id]);
    assert.deepEqual(sceneData.getSceneEpisode(scene.id).lines, scene.lines);
  }
});

test('long custom words remain on screen long enough to finish typing and be read', async () => {
  const { buildDialogue } = await import('../src/scene-player.js');
  const { createLanguage } = await import('../src/engine.js');
  const { SCENES } = data();
  const language = createLanguage({ name: 'Luma', seed: 'long-dialogue', preset: 'soft' });
  const longWord = 'a'.repeat(180);
  language.words.find(word => word.english.toLowerCase() === 'bread').word = longWord;
  const bakery = SCENES.find(scene => scene.id === 'bakery');
  const entry = buildDialogue(bakery, language)[0];

  assert.ok(entry.text.includes(longWord), 'The entire custom word must reach the dialogue');
  const requiredTime = Array.from(entry.text).length * 43 + 1000;
  assert.ok(entry.duration >= requiredTime,
    `Expected at least ${requiredTime} ms to type and read the full line, got ${entry.duration} ms`);
});
