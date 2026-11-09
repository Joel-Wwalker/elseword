import test from 'node:test';
import assert from 'node:assert/strict';
import { createLanguage } from '../src/engine.js';
import { SCENES, CHARACTERS } from '../src/scenes.js';

const api = await import('../src/scene-project.js').catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return {};
});
const tool = name => { assert.equal(typeof api[name], 'function', `${name} must be implemented`); return api[name]; };
const language = () => createLanguage({ seed: 'scene-project-test' });
const blank = room => tool('createSceneProject')(language(), { room });
const literal = (id, text = 'Hello, world!', extra = {}) => ({ id, speaker: 0, mode: 'literal', text, english: 'Hello, world!', action: 'none', cue: 'start', wordIndex: 0, pauseMs: 600, ...extra });
const compile = project => tool('compileSceneProject')(project);
const sample = (compiled, time, options) => tool('sampleSceneProject')(compiled, time, options);

test('new scenes embed detached validated language snapshots and start with an editable beat', () => {
  const source = language();
  const project = tool('createSceneProject')(source, { room: 'library' });
  assert.equal(project.format, 'little-languages-scene');
  assert.equal(project.version, 1);
  assert.equal(project.room, 'library');
  assert.equal(project.beats.length, 1);
  assert.equal(project.beats[0].mode, 'builder');
  assert.equal(project.language.version, 2);
  assert.deepEqual(tool('validateSceneProject')(JSON.stringify(project)), project);
  project.language.words[0].word = 'changed';
  assert.notEqual(source.words[0].word, 'changed');
});

test('template remix resolves a chosen branch into portable, bounded references', () => {
  const project = tool('createSceneProject')(language(), { room: 'cafe', episodeId: 'cold-tea', choiceId: 'wait' });
  assert.equal(project.beats.length, 4);
  assert.ok(project.beats.every(beat => beat.mode === 'template' && beat.template.choiceId === 'wait'));
  assert.equal(compile(project).beats.at(-1).english, 'Good. I can sleep.');
  const invalid = structuredClone(project); delete invalid.beats[0].template.choiceId;
  assert.throws(() => tool('validateSceneProject')(invalid), /choice|branch/i);
  assert.throws(() => tool('createSceneProject')(language(), { room: 'cafe', episodeId: 'missing' }), /episode|template/i);
  assert.throws(() => tool('createSceneProject')(language(), { room: 'cafe', episodeId: 'cold-tea' }), /choice|branch|reply/i);
});

test('remixed scenes retain the authored action cues and deliberate pauses', () => {
  const directions = tool('createSceneProject')(language(), { room: 'tickets', episodeId: 'directions' });
  assert.equal(directions.beats[2].action, 'turn');
  assert.equal(directions.beats[2].cue, 'start');
  const sky = tool('createSceneProject')(language(), { room: 'rooftop', episodeId: 'uncertainty', choiceId: 'hope-for-star' });
  assert.equal(sky.beats[1].action, 'none');
  assert.equal(sky.beats[3].action, 'none');
  assert.equal(sky.beats[3].pauseMs, 1600);
});

test('malformed scene imports reject unsafe trees, invalid actors, references and bounds', () => {
  const project = blank();
  const validate = tool('validateSceneProject');
  for (const update of [
    { version: 3 }, { room: 'missing' }, { cast: ['moss'] }, { cast: ['moss', 'missing'] }, { prop: 'bomb' },
    { beats: [] }, { beats: Array.from({ length: 25 }, (_, i) => literal(`b${i}`)) },
    { beats: [literal('x'), literal('x')] }, { beats: [literal('a', 'x'.repeat(301))] },
    { beats: [literal('a', '', { pauseMs: 5001 })] }, { beats: [literal('a', '', { wordIndex: 300 })] },
    { beats: [literal('a', '', { speaker: 2 })] }, { beats: [literal('a', '', { action: 'fall' })] },
    { beats: [{ ...literal('a'), mode: 'builder', options: { subject: { invalid: 'reference' } } }] },
  ]) assert.throws(() => validate({ ...project, ...update }), undefined, JSON.stringify(update));
  assert.throws(() => validate('{"__proto__":{}}'), /unsafe|key/i);
  const getter = { ...project }; Object.defineProperty(getter, 'name', { enumerable: true, get() { throw new Error('executed getter'); } });
  assert.throws(() => validate(getter), /executable|accessor/i);
  assert.throws(() => validate(' '.repeat(2_000_001)), /large|size/i);
  assert.throws(() => validate(JSON.stringify({ ...project, padding: '界'.repeat(340000) })), /large|size/i);
});

const rendererAPI = await import('../src/scene-renderer.js').catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return {};
});
test('caption wrapping retains long multilingual words and breaks only at codepoint boundaries', () => {
  assert.equal(typeof rendererAPI.wrapCaptionText, 'function', 'wrapCaptionText must be implemented');
  const ctx = { measureText: value => ({ width: Array.from(value).reduce((sum, char) => sum + (char === '界' || char === '🦉' ? 12 : 6), 0) }) };
  const input = 'A longwordwithoutspaces界🦉andmore\nSecond line';
  const lines = rendererAPI.wrapCaptionText(ctx, input, 60);
  assert.ok(lines.length > 2);
  assert.equal(lines.join('').replace(/\s/gu, ''), input.replace(/\s/gu, ''));
  assert.ok(lines.every(line => ctx.measureText(line).width <= 60));
  assert.ok(lines.some(line => line.includes('🦉')));
});

test('long English captions display every page within the canvas instead of silently dropping their beginning', async t => {
  assert.equal(typeof rendererAPI.createSceneRenderer, 'function');
  const previousImage = globalThis.Image, previousDocument = globalThis.document;
  t.after(() => { globalThis.Image = previousImage; globalThis.document = previousDocument; });
  globalThis.Image = class { width = 1024; height = 512; set src(value) { queueMicrotask(() => this.onload()); } };
  globalThis.document = { baseURI: 'http://localhost/', fonts: { load: async () => {}, ready: Promise.resolve() } };
  const drawn = [];
  const ctx = { font: '12px monospace', save() {}, restore() {}, translate() {}, scale() {}, rotate() {}, beginPath() {}, rect() {}, clip() {}, setTransform() {}, fillRect() {}, strokeRect() {}, drawImage() {},
    measureText(value) { const size = parseFloat(this.font); return { width: Array.from(value).reduce((width, char) => width + (/\p{Script=Han}/u.test(char) ? size : size * 0.6), 0) }; },
    fillText(value, x, y) { if (y >= 302 && y < 348) drawn.push(value); assert.ok(y < 348, 'Caption must stay inside its panel'); },
  };
  const project = blank();
  const english = Array.from({ length: 300 }, (_, index) => String.fromCodePoint(0x4e00 + index)).join('');
  project.beats = [literal('a', 'Hello.', { english })];
  const compiled = compile(project), renderer = await rendererAPI.createSceneRenderer({ getContext: () => ctx });
  for (let time = 0; time <= compiled.duration; time += 200) renderer.draw(compiled, time);
  renderer.destroy();
  const seen = new Set(Array.from(drawn.join('')));
  assert.ok(Array.from(english).every(character => seen.has(character)), 'Every caption character must appear during the beat');
});

test('compiled builder dialogue follows the snapshot grammar and does not follow later editor changes', () => {
  const project = blank();
  project.beats[0].options = { subject: 'i', verb: 'see', object: 'book', adjective: 'big', tense: 'past', plural: true, question: true };
  project.language.grammar.order = 'SOV';
  const compiled = compile(project);
  assert.equal(compiled.beats[0].english, 'Did I see big books?');
  const before = compiled.beats[0].text;
  project.language.words.find(word => word.english === 'book').word = 'changed';
  assert.equal(compiled.beats[0].text, before);
  assert.notEqual(compile(project).beats[0].text, before);
});

test('typewriter, word cues and audio events share exact Unicode character boundaries', () => {
  const project = blank(); project.beats = [literal('a', 'A 🦉 two.', { cue: 'word', wordIndex: 1, action: 'gesture' })];
  const compiled = compile(project), beat = compiled.beats[0];
  assert.equal(sample(compiled, 0).visibleText, '');
  assert.equal(sample(compiled, 43).visibleText, 'A');
  assert.equal(sample(compiled, 129).visibleText, 'A 🦉');
  assert.ok(beat.actionAt > 129 && beat.actionAt < beat.speechEnd);
  for (const event of compiled.audioEvents) {
    assert.equal(event.voice, project.cast[0]);
    assert.ok(sample(compiled, event.time).visibleText.endsWith(event.character));
    assert.doesNotMatch(event.character, /^[\s.,!?]$/u);
  }
  assert.equal(sample(compiled, beat.speechEnd).visibleText, beat.text);
  assert.equal(sample(compiled, Infinity).time, compiled.duration);
});

test('word cues still locate spoken words when a custom alphabet uses symbols', () => {
  const project = blank();
  project.language.script = { style: 'custom', direction: 'rtl', glyphs: Object.fromEntries(Array.from('abcdefghijklmnopqrstuvwxyz').map(letter => [letter, '◇'])) };
  project.beats[0].action = 'gesture'; project.beats[0].cue = 'word'; project.beats[0].wordIndex = 0;
  const beat = compile(project).beats[0];
  assert.equal(beat.actionAt, 43);
  assert.ok(beat.actionAt < beat.speechEnd);
});

test('start and end cues, pauses and beat boundaries remain deterministic under arbitrary seeking', () => {
  const project = blank();
  project.beats = [literal('a', 'First.', { action: 'walk', cue: 'end', pauseMs: 1000 }), literal('b', 'Second.', { speaker: 1, action: 'turn', cue: 'start' })];
  const compiled = compile(project), [first, second] = compiled.beats;
  assert.equal(first.actionAt, first.speechEnd);
  assert.equal(second.start, first.end);
  assert.ok(first.end >= first.speechEnd + 1000);
  assert.equal(sample(compiled, first.end).beatIndex, 1);
  const before = sample(compiled, first.actionAt - 1);
  assert.equal(before.actors[0].x, sample(compiled, 0).actors[0].x);
  assert.notEqual(sample(compiled, first.end).actors[0].x, before.actors[0].x);
  const expected = sample(compiled, second.start + 400);
  sample(compiled, compiled.duration); sample(compiled, 0);
  assert.deepEqual(sample(compiled, second.start + 400), expected);
  assert.equal(sample(compiled, -100).time, 0);
});

test('long scenes keep their full timeline so video export can reject rather than truncate', () => {
  const project = blank();
  project.beats = Array.from({ length: 10 }, (_, index) => literal(`b${index}`, '長'.repeat(300), { pauseMs: 5000 }));
  const compiled = compile(project);
  assert.ok(compiled.duration > 60000);
  assert.equal(sample(compiled, compiled.duration).visibleText.length, 300);
  assert.equal(compiled.beats.length, 10);
});

test('a quiet pause lasts exactly its chosen duration, with a minimal frame for zero', () => {
  const project = blank();
  project.beats = [literal('quiet', '', { english: '', pauseMs: 1600 })];
  assert.equal(compile(project).duration, 1600);
  assert.deepEqual(compile(project).audioEvents, []);
  project.beats[0].pauseMs = 0;
  assert.equal(compile(project).duration, 100);
  project.beats[0].action = 'gesture';
  assert.ok(compile(project).duration >= 700, 'A silent action retains enough time to finish');
});

test('actions keep both actors in clear room anchors and props on safe supports after drops', () => {
  const obstacles = { bakery: [[92,147,127,173]], library: [[104,148,138,172]], cafe: [[84,156,125,189]], rooftop: [[99,166,140,190]], apothecary: [[86,130,131,170]] };
  const overlaps = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
  for (const room of SCENES) for (const prop of api.SCENE_PROPS.filter(type => type !== 'none')) {
    const project = blank(room.id); project.prop = prop;
    project.beats = ['recoil', 'walk', 'turn', 'pass', 'drop', 'walk'].map((action, index) => literal(`a${index}`, 'Hello.', { action, speaker: index % 2 }));
    const compiled = compile(project);
    for (let time = 0; time <= compiled.duration; time += 83) {
      const frame = sample(compiled, time);
      frame.actors.forEach((actor, role) => {
        const bounds = [actor.x + 6, actor.y, actor.x + 59, actor.y + 63];
        assert.ok(bounds[0] >= 27 && bounds[2] <= 357 && bounds[1] >= 23 && bounds[3] <= 197, `${room.id}/${prop} actor room bounds`);
        if (role === 0) for (const obstacle of obstacles[room.id] ?? []) assert.equal(overlaps(bounds, obstacle), false, `${room.id} actor crossed furniture`);
      });
      assert.ok(frame.prop.bounds[0] >= 27 && frame.prop.bounds[2] <= 357 && frame.prop.bounds[1] >= 23 && frame.prop.bounds[3] <= 191, `${room.id}/${prop} leaves room`);
    }
    const dropped = sample(compiled, compiled.beats[4].end);
    assert.ok(Math.abs(dropped.prop.bounds[3] - dropped.prop.supportY) < 0.001, `${room.id}/${prop} drop must rest on support`);
    assert.deepEqual(sample(compiled, 0, { reduced: true }).actors.map(({ x, y }) => [x, y]), sample(compiled, compiled.duration, { reduced: true }).actors.map(({ x, y }) => [x, y]));
  }
});

const memory = initial => ({ values: new Map(Object.entries(initial ?? {})), getItem(key) { return this.values.get(key) ?? null; }, setItem(key, value) { this.values.set(key, value); } });
test('local scenes round trip independently from languages and preserve corrupt originals before repairs', () => {
  const load = tool('loadSceneProjects'), save = tool('saveSceneProjects');
  const project = blank(); const storage = memory();
  assert.deepEqual(load(storage).scenes, []);
  save(storage, { scenes: [project], activeId: project.id });
  assert.deepEqual(load(storage).scenes, [project]);
  storage.setItem(api.SCENE_STORAGE_KEY, '{damaged');
  const damaged = load(storage);
  assert.equal(damaged.recoveryRaw, '{damaged');
  assert.equal(storage.getItem(api.SCENE_STORAGE_KEY), '{damaged');
  save(storage, { ...damaged, scenes: [project], activeId: project.id });
  assert.equal(storage.getItem(api.SCENE_RECOVERY_KEY), '{damaged');
  assert.deepEqual(load(storage).scenes, [project]);
});

test('failed recovery preservation leaves the damaged save intact and local limits are enforced', () => {
  const project = blank(); const storage = memory({ [api.SCENE_STORAGE_KEY]: '{damaged' });
  const originalSet = storage.setItem.bind(storage);
  storage.setItem = (key, value) => { if (key === api.SCENE_RECOVERY_KEY) throw new Error('blocked'); originalSet(key, value); };
  assert.throws(() => tool('saveSceneProjects')(storage, { scenes: [project], activeId: project.id, recoveryRaw: '{damaged' }), /storage|recovery|save/i);
  assert.equal(storage.getItem(api.SCENE_STORAGE_KEY), '{damaged');
  assert.throws(() => tool('saveSceneProjects')(memory(), { scenes: Array.from({ length: 21 }, (_, i) => ({ ...project, id: `scene-${i}` })), activeId: project.id }), /20|limit/i);
});
