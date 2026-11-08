import test from 'node:test';
import assert from 'node:assert/strict';
import { createLanguage } from '../src/engine.js';
import { createSceneProject } from '../src/scene-project.js';
import { moveSceneBeat, duplicateSceneBeat, removeSceneBeat, convertSceneBeat, parseSceneImport, serializeSceneProject } from '../src/scene-maker.js';

test('storyboard ordering and duplication preserve source data and stable beat IDs', () => {
  const scene = createSceneProject(createLanguage(), { room: 'bakery', episodeId: 'original' });
  const first = scene.beats[0].id;
  const moved = moveSceneBeat(scene, first, 1);
  assert.equal(moved.beats[1].id, first);
  assert.equal(scene.beats[0].id, first);
  const copy = duplicateSceneBeat(scene, first, 'beat-copy');
  assert.equal(copy.beats[1].id, 'beat-copy');
  assert.equal(copy.beats[1].speaker, scene.beats[0].speaker);
  assert.equal(removeSceneBeat(copy, 'beat-copy').beats.length, scene.beats.length);
});

test('literal conversion freezes visible dialogue while builder conversion is explicit', () => {
  const scene = createSceneProject(createLanguage(), { room: 'bakery', episodeId: 'original' });
  const converted = convertSceneBeat(scene, scene.beats[0].id, 'literal');
  assert.equal(converted.beats[0].mode, 'literal');
  assert.ok(converted.beats[0].text.length);
  assert.equal(converted.beats[0].english, 'One bread, please.');
  assert.equal(scene.beats[0].mode, 'template');
  const builder = convertSceneBeat(scene, scene.beats[0].id, 'builder');
  assert.equal(builder.beats[0].mode, 'builder');
  assert.ok(builder.beats[0].options.subject);
});

test('portable imports reject malformed input without altering current scenes and assign a fresh identity', () => {
  const scene = createSceneProject(createLanguage(), { room: 'bakery', episodeId: 'original' });
  assert.throws(() => parseSceneImport('{broken', 'scene-import'));
  const imported = parseSceneImport(JSON.stringify(scene), 'scene-import');
  assert.equal(imported.id, 'scene-import');
  assert.notEqual(scene.id, imported.id);
  assert.deepEqual(imported.language, scene.language);
  assert.throws(() => parseSceneImport('x'.repeat(1_000_001), 'scene-large'), /1 MB/i);
});

test('storyboard helpers enforce beat limits and preserve the last editable beat', () => {
  const scene = createSceneProject(createLanguage());
  assert.throws(() => removeSceneBeat(scene, scene.beats[0].id), /at least one line/i);
  scene.beats = Array.from({ length: 24 }, (_, index) => ({ ...structuredClone(scene.beats[0]), id: `beat-${index}` }));
  assert.throws(() => duplicateSceneBeat(scene, 'beat-0', 'beat-overflow'), /24/i);
  assert.equal(scene.beats.length, 24);
  assert.equal(moveSceneBeat(scene, 'beat-0', -1).beats[0].id, 'beat-0');
});

test('large valid scene downloads stay within the import byte limit and round-trip', () => {
  const scene = createSceneProject(createLanguage());
  scene.language.words.push(...Array.from({ length: 1450 }, (_, index) => ({ id: `custom-${index}`, english: `extra ${index}`, word: 'na', pos: 'noun', category: 'Custom', notes: 'n'.repeat(500), locked: true })));
  assert.ok(new TextEncoder().encode(JSON.stringify(scene, null, 2)).byteLength > 1_000_000);
  const serialized = serializeSceneProject(scene);
  assert.ok(new TextEncoder().encode(serialized).byteLength < 1_000_000);
  const restored = parseSceneImport(serialized, 'scene-roundtrip');
  assert.equal(restored.language.words.length, scene.language.words.length);
  assert.equal(restored.language.words.at(-1).notes.length, 500);
});
