import test from 'node:test';
import assert from 'node:assert/strict';
import { createLanguage } from '../src/engine.js';
import { SCENES, getSceneEpisode, resolveSceneChoice } from '../src/scenes.js';
import { createSceneProject, validateSceneProject, compileSceneProject, sampleSceneProject, saveSceneProjects, loadSceneProjects } from '../src/scene-project.js';
import { convertSceneBeat, duplicateSceneBeat, parseSceneImport, serializeSceneProject } from '../src/scene-maker.js';

const expressions = ['auto', 'neutral', 'curious', 'annoyed', 'pleased', 'worried', 'startled'];
const language = () => createLanguage({ seed: 'expression-project' });
function literalScene(options = {}) {
  const project = createSceneProject(language());
  project.beats = [{ id: 'line-1', speaker: 0, mode: 'literal', text: 'Hello.', english: 'Hello.', action: 'none', cue: 'end', wordIndex: 0, pauseMs: 1600, ...options }];
  return project;
}
const faces = (compiled, time, options) => sampleSceneProject(compiled, time, options).actors.map(actor => actor.expression);

test('version-one scenes without expression settings open as automatic without changing the source', () => {
  const legacy = literalScene();
  delete legacy.beats[0].expression;
  const restored = validateSceneProject(JSON.stringify(legacy));
  assert.equal(restored.version, 1);
  assert.equal(restored.beats[0].expression, 'auto');
  assert.equal(legacy.beats[0].expression, undefined);
  assert.deepEqual(faces(compileSceneProject(restored), 250), ['neutral', 'neutral']);
});

test('scene expressions accept only supported values and survive editing and file or device saves', () => {
  for (const expression of expressions) {
    const source = literalScene({ expression });
    assert.equal(validateSceneProject(source).beats[0].expression, expression);
  }
  for (const expression of ['happy', '', null, 1, ['neutral'], { name: 'neutral' }]) {
    assert.throws(() => validateSceneProject(literalScene({ expression })), /expression/i);
  }
  const source = literalScene({ expression: 'worried' });
  const builder = convertSceneBeat(source, 'line-1', 'builder');
  const literal = convertSceneBeat(builder, 'line-1', 'literal');
  const copy = duplicateSceneBeat(literal, 'line-1', 'line-copy');
  const imported = parseSceneImport(serializeSceneProject(copy), 'expression-import');
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  saveSceneProjects(storage, { scenes: [imported], activeId: imported.id });
  const saved = loadSceneProjects(storage).scenes[0];
  assert.deepEqual(saved.beats.map(beat => beat.expression), ['worried', 'worried']);
  assert.equal(saved.beats[1].id, 'line-copy');
  assert.equal(source.beats.length, 1);
});

test('builder questions cue the speaking role while explicit choices override its automatic expression', () => {
  const project = createSceneProject(language());
  Object.assign(project.beats[0], { speaker: 1, expression: 'auto' });
  project.beats[0].options.question = true;
  let compiled = compileSceneProject(project);
  assert.deepEqual(compiled.beats[0].expressions, ['neutral', 'curious']);
  assert.deepEqual(faces(compiled, 0), ['neutral', 'curious']);
  project.beats[0].expression = 'annoyed';
  compiled = compileSceneProject(project);
  assert.deepEqual(compiled.beats[0].expressions, ['neutral', 'curious']);
  assert.deepEqual(faces(compiled, 0), ['neutral', 'annoyed']);
  project.beats[0].options.question = false;
  project.beats[0].expression = 'auto';
  assert.deepEqual(faces(compileSceneProject(project), 250), ['neutral', 'neutral']);
  assert.deepEqual(faces(compileSceneProject(literalScene({ text: 'Why?', english: 'Why?' })), 250), ['neutral', 'neutral']);
});

test('remixed templates compile expression cues from the selected reply lines', () => {
  const source = language();
  for (const room of SCENES) for (const episode of room.episodes) {
    const choices = episode.choice?.options.map(choice => choice.id) ?? [undefined];
    for (const choiceId of choices) {
      const selected = resolveSceneChoice(getSceneEpisode(room.id, episode.id), choiceId);
      const project = createSceneProject(source, { room: room.id, episodeId: episode.id, choiceId });
      for (const beat of project.beats) beat.action = 'none';
      const compiled = compileSceneProject(project);
      for (const [index, beat] of compiled.beats.entries()) {
        const cues = selected.lines[index].expressions;
        assert.ok(Array.isArray(cues) && cues.length === 2, `${room.id}/${episode.id}/${choiceId}/${index}`);
        assert.deepEqual(beat.expressions, cues);
        assert.equal(beat.english, selected.lines[index].english);
        assert.deepEqual(faces(compiled, beat.start + 220), cues);
        const initial = [...cues]; initial[1 - beat.speaker] = 'neutral';
        assert.deepEqual(faces(compiled, beat.start + 219), initial);
      }
    }
  }
});

test('prop actions start expressions at contact and delay the other character reaction', () => {
  for (const action of ['pass', 'drop']) {
    const compiled = compileSceneProject(literalScene({ action, expression: 'pleased' }));
    const contact = compiled.beats[0].actionAt + 385;
    assert.deepEqual(faces(compiled, contact - 1), ['pleased', 'neutral']);
    assert.deepEqual(faces(compiled, contact), ['startled', 'neutral']);
    assert.deepEqual(faces(compiled, contact + 99), ['startled', 'neutral']);
    assert.deepEqual(faces(compiled, contact + 100), ['startled', 'startled']);
    assert.deepEqual(faces(compiled, contact + 651), ['pleased', 'startled']);
    assert.deepEqual(faces(compiled, contact + 751), ['pleased', 'neutral']);
  }
});

test('recoil reacts immediately for its actor and only after contact for its observer', () => {
  const compiled = compileSceneProject(literalScene({ action: 'recoil', speaker: 1, expression: 'annoyed' }));
  const start = compiled.beats[0].actionAt, observer = start + 224 + 100;
  assert.deepEqual(faces(compiled, start - 1), ['neutral', 'annoyed']);
  assert.deepEqual(faces(compiled, start), ['neutral', 'startled']);
  assert.deepEqual(faces(compiled, observer - 1), ['neutral', 'startled']);
  assert.deepEqual(faces(compiled, observer), ['startled', 'startled']);
  assert.deepEqual(faces(compiled, observer + 651), ['neutral', 'annoyed']);
});

test('missing props do not cause phantom face reactions and body gestures remain independent', () => {
  for (const action of ['pass', 'drop', 'gesture']) {
    const project = literalScene({ action, cue: 'start', expression: 'pleased' });
    project.prop = 'none';
    const compiled = compileSceneProject(project);
    for (const time of [0, 384, 385, 485, 700, 1200]) assert.deepEqual(faces(compiled, time), ['pleased', 'neutral']);
    if (action === 'gesture') assert.notEqual(sampleSceneProject(compiled, 500).actors[0].pose, 0);
  }
});

test('expression sampling is independent of seek order and remains visible with motion reduced', () => {
  const project = literalScene({ action: 'drop', cue: 'start' });
  project.beats.push({ ...project.beats[0], id: 'line-2', speaker: 1, action: 'recoil', expression: 'worried' });
  const compiled = compileSceneProject(project), start = compiled.beats[1].start;
  const times = [0, 200, 385, 485, 900, 1200, start, start + 324, start + 1000];
  const expected = times.map(time => faces(compiled, time));
  assert.deepEqual(expected[2], ['startled', 'neutral']);
  assert.deepEqual(expected[3], ['startled', 'startled']);
  for (const index of [8, 1, 4, 0, 6, 3, 7, 2, 5]) {
    assert.deepEqual(faces(compiled, times[index]), expected[index]);
    assert.deepEqual(faces(compiled, times[index], { reduced: true }), expected[index]);
  }
});

test('a silent pause keeps the chosen face without changing timing or producing speech', () => {
  const compiled = compileSceneProject(literalScene({ text: '', english: '', pauseMs: 1000, expression: 'worried' }));
  assert.equal(compiled.duration, 1000);
  assert.deepEqual(compiled.audioEvents, []);
  assert.equal(compiled.beats[0].quiet, true);
  for (const time of [0, 500, 1000]) assert.deepEqual(faces(compiled, time), ['worried', 'neutral']);
});
