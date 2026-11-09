import test from 'node:test';
import assert from 'node:assert/strict';
import { createLanguage } from '../src/engine.js';
import { createSceneProject, compileSceneProject, sampleSceneProject } from '../src/scene-project.js';
import { createSceneRenderer } from '../src/scene-renderer.js';
import { SCENES } from '../src/scenes.js';
import { getSceneLayout } from '../src/scene-layout.js';

const line = (id, action, speaker = 0) => ({ id, speaker, mode: 'literal', text: 'Hello.', english: 'Hello.', action, cue: 'start', wordIndex: 0, pauseMs: 1200 });
function scene(room = 'bakery', actions = ['drop']) {
  const project = createSceneProject(createLanguage(), { room });
  project.beats = actions.map((action, index) => line(`line-${index}`, action, index % 2));
  return compileSceneProject(project);
}
const sample = sampleSceneProject;

test('the original bakery remix tosses the loaf while alternate deliveries retain their authored actions', () => {
  const language = createLanguage();
  const original = createSceneProject(language, { room: 'bakery', episodeId: 'original' });
  assert.equal(original.beats[1].action, 'drop');
  assert.equal(original.beats[1].cue, 'end');
  const compiled = compileSceneProject(original), delivery = compiled.beats[1];
  const resting = sample(compiled, delivery.actionAt), airborne = sample(compiled, delivery.actionAt + 175);
  assert.ok(airborne.prop.bounds[3] < resting.prop.bounds[3], 'The remixed loaf lifts before landing');
  for (const choiceId of ['take-bread', 'wait-for-cake']) {
    const alternate = createSceneProject(language, { room: 'bakery', episodeId: 'substitution', choiceId });
    assert.deepEqual([alternate.beats[1].action, alternate.beats[1].cue], ['pass', 'end']);
    assert.deepEqual([alternate.beats[3].action, alternate.beats[3].cue], ['gesture', 'start']);
  }
  for (const room of SCENES.filter(room => room.id !== 'bakery')) {
    const remix = createSceneProject(language, { room: room.id, episodeId: 'original' });
    assert.deepEqual([remix.beats[1].action, remix.beats[1].cue], ['pass', 'end'], room.id);
  }
});

test('editor actions anticipate, arrive, and settle without changing the recipe timeline', () => {
  const compiled = scene('bakery', ['walk']), start = sample(compiled, 0);
  const early = sample(compiled, 60), middle = sample(compiled, 350), settled = sample(compiled, 900);
  assert.ok(Math.abs(early.actors[0].x - start.actors[0].x) < 0.1, 'The step holds briefly before moving');
  assert.ok(middle.actors[0].x > early.actors[0].x);
  assert.ok(Math.abs(middle.actors[0].lean) > 0);
  assert.equal(settled.actors[0].x, start.actors[0].x + 6);
  assert.equal(settled.actors[0].lean, 0);
  assert.equal(compiled.duration, 2400);
});

test('drop contact produces brief effects and a delayed stationary observer reaction', () => {
  const compiled = scene(), base = sample(compiled, 0), frames = [];
  for (let time = 0; time < 1500; time += 5) frames.push(sample(compiled, time));
  assert.ok(frames.some(frame => frame.effects?.length), 'The prop contact needs an impact accent');
  const impact = frames.find(frame => frame.effects.length);
  assert.ok(Math.abs(impact.prop.bounds[3] - impact.prop.supportY) < 0.001, 'Effects begin at physical contact');
  assert.equal(base.actors[1].lean, 0);
  assert.ok(frames.some(frame => Math.abs(frame.actors[1].lean) > 0 && frame.time > impact.time));
  for (const frame of frames) assert.deepEqual([frame.actors[1].x, frame.actors[1].y], [base.actors[1].x, base.actors[1].y]);
  assert.deepEqual(sample(compiled, 1500).effects, []);
  assert.equal(sample(compiled, 1500).actors[1].lean, 0);
});

test('a shortest silent action settles before its unchanged final frame', () => {
  const project = scene().project;
  Object.assign(project.beats[0], { text: '', english: '', pauseMs: 0 });
  const compiled = compileSceneProject(project), last = sample(compiled, compiled.duration);
  assert.equal(compiled.duration, 700);
  assert.deepEqual(last.effects, []);
  assert.ok(last.actors.every(actor => actor.lean === 0));
});

test('scene direction is independent of seek order and motion-off removes cinematic movement', () => {
  const compiled = scene('rooftop', ['drop', 'walk', 'recoil', 'pass']);
  const times = [0, 180, 500, 750, 1100, ...compiled.beats.map(beat => beat.start + 450), compiled.duration];
  const expected = times.map(time => sample(compiled, time));
  for (const index of [5, 0, 3, 8, 1, 6, 2, 4, 7]) if (times[index] !== undefined) assert.deepEqual(sample(compiled, times[index]), expected[index]);
  for (const time of times) {
    const frame = sample(compiled, time, { reduced: true });
    assert.deepEqual(frame.camera, { scale: 1, x: 0, y: 0 });
    assert.deepEqual(frame.effects, []);
    assert.ok(frame.actors.every(actor => actor.lean === 0));
    assert.deepEqual(frame.actors.map(actor => [actor.x, actor.y]), getSceneLayout('rooftop').positions);
  }
});

test('cinematic actor rotations and falling props remain inside the room and settle on supports', () => {
  for (const room of SCENES) {
    const compiled = scene(room.id, ['recoil', 'walk', 'drop', 'pass']);
    for (let time = 0; time <= compiled.duration; time += 61) {
      const frame = sample(compiled, time);
      assert.ok(frame.camera?.scale >= 1 && frame.camera.scale <= 1.15);
      for (const actor of frame.actors) {
        assert.ok(Math.abs(actor.lean) <= 3);
        const angle = actor.lean * Math.PI / 180;
        for (const [x, y] of [[6, 0], [59, 0], [6, 63], [59, 63]]) {
          const worldX = actor.x + 32 + (x - 32) * Math.cos(angle) - (y - 64) * Math.sin(angle);
          const worldY = actor.y + 64 + (x - 32) * Math.sin(angle) + (y - 64) * Math.cos(angle);
          assert.ok(worldX >= 27 && worldX <= 357 && worldY >= 23 && worldY <= 197, room.id);
        }
      }
      assert.ok(frame.prop.bounds[0] >= 27 && frame.prop.bounds[2] <= 357);
      assert.ok(frame.prop.bounds[1] >= 23 && frame.prop.bounds[3] <= 191);
    }
    const dropped = sample(compiled, compiled.beats[2].start + 900).prop;
    assert.ok(Math.abs(dropped.bounds[3] - dropped.supportY) < 0.001, room.id);
  }
});

function canvasContext() {
  const calls = [], stack = [];
  let matrix = [1, 0, 0, 1, 0, 0], clipped = false;
  const multiply = ([a, b, c, d, e, f]) => {
    const [g, h, i, j, k, l] = matrix;
    matrix = [g*a+i*b, h*a+j*b, g*c+i*d, h*c+j*d, g*e+i*f+k, h*e+j*f+l];
  };
  const record = (type, args) => calls.push({ type, args, matrix: [...matrix], clipped });
  const context = {
    font: '12px monospace',
    save() { stack.push({ matrix: [...matrix], clipped, alpha: this.globalAlpha }); },
    restore() { const state = stack.pop(); matrix = state.matrix; clipped = state.clipped; this.globalAlpha = state.alpha; },
    setTransform(...values) { matrix = values; },
    translate(x, y) { multiply([1, 0, 0, 1, x, y]); },
    scale(x, y) { multiply([x, 0, 0, y, 0, 0]); },
    rotate(angle) { multiply([Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0]); },
    beginPath() {}, rect(...args) { record('clipRect', args); }, clip() { clipped = true; },
    fillRect(...args) { record('fillRect', args); }, strokeRect(...args) { record('strokeRect', args); },
    drawImage(...args) { record('image', args); }, fillText(...args) { record('text', args); },
    measureText(text) { return { width: [...text].length * parseFloat(this.font) * 0.6 }; },
  };
  return { context, calls };
}

test('video renderer clips and moves every room layer together while restoring caption coordinates', async t => {
  const previousImage = globalThis.Image, previousDocument = globalThis.document;
  t.after(() => { globalThis.Image = previousImage; globalThis.document = previousDocument; });
  globalThis.Image = class { width = 1024; height = 512; set src(value) { this.source = value; queueMicrotask(() => this.onload()); } };
  globalThis.document = { baseURI: 'http://localhost/', fonts: { load: async () => {}, ready: Promise.resolve() } };
  const { context, calls } = canvasContext();
  const renderer = await createSceneRenderer({ getContext: () => context });
  const frame = renderer.draw(scene('bakery', ['walk']), 350);
  const clip = calls.find(call => call.type === 'clipRect');
  assert.deepEqual(clip?.args, [0, 0, 384, 216]);
  assert.deepEqual(clip.matrix, [2, 0, 0, 2, 0, 0]);
  const images = calls.filter(call => call.type === 'image');
  assert.ok(images.every(call => call.clipped));
  assert.deepEqual(images[0].matrix, [2 * frame.camera.scale, 0, 0, 2 * frame.camera.scale, 2 * frame.camera.x, 2 * frame.camera.y]);
  const actors = images.filter(call => call.args.length === 9);
  assert.equal(actors.length, 2);
  for (const [index, actor] of [frame.actors[1], frame.actors[0]].entries()) {
    const [a, b, c, d, e, f] = actors[index].matrix;
    const feet = [a * 32 + c * 64 + e, b * 32 + d * 64 + f];
    assert.ok(Math.abs(feet[0] - 2 * (frame.camera.x + frame.camera.scale * (actor.x + 32))) < 0.00001);
    assert.ok(Math.abs(feet[1] - 2 * (frame.camera.y + frame.camera.scale * (actor.y + 64))) < 0.00001);
  }
  for (const caption of calls.filter(call => call.type === 'text' || call.type === 'strokeRect')) {
    assert.deepEqual(caption.matrix, [2, 0, 0, 2, 0, 0]);
    assert.equal(caption.clipped, false);
  }
  calls.length = 0;
  const contactFrame = renderer.draw(scene('bakery', ['drop']), 385);
  assert.ok(contactFrame.effects.length > 0);
  const marks = calls.filter(call => call.type === 'fillRect' && call.clipped);
  assert.equal(marks.length, contactFrame.effects.length);
  const lastActor = calls.findLastIndex(call => call.type === 'image' && call.args.length === 9);
  for (const mark of marks) assert.ok(calls.indexOf(mark) > lastActor, 'Impact marks draw above the actors');
  for (const caption of calls.filter(call => call.type === 'text')) assert.equal(caption.clipped, false);
  renderer.destroy();
});
