import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { TextAudio } from '../src/text-audio.js';

const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
const start = app.indexOf('const textAudio = new TextAudio(');
const end = app.indexOf('let project = loadProject(', start);
assert.ok(start >= 0 && end > start);

// Run the app's startup and toolbar handlers with the real audio controller.
function fixture(t, { muted = false, suspended = false, resume } = {}) {
  const document = new EventTarget(), contexts = [], outputs = [], writes = [];
  const button = { dataset: {}, attributes: {}, setAttribute(key, value) { this.attributes[key] = value; } };
  let resumes = 0;
  class AudioContext extends EventTarget {
    constructor() {
      super();
      this.state = suspended ? 'suspended' : 'running';
      this.sampleRate = 22050;
      this.destination = {};
      contexts.push(this);
    }
    async resume() {
      await resume?.(++resumes);
      if (this.state === 'closed') return;
      this.state = 'running';
      this.dispatchEvent(new Event('statechange'));
    }
    createBuffer(channels, length) {
      const samples = new Float32Array(length);
      return { getChannelData: () => samples };
    }
    createBufferSource() {
      return { connect() {}, disconnect() {}, stop() {}, start() { outputs.push(this.buffer); } };
    }
    async close() { this.state = 'closed'; }
  }
  const context = vm.createContext({
    TextAudio: class extends TextAudio {
      constructor(options) { super({ ...options, AudioContext, document, window: null }); }
    },
    storage: { getItem: () => muted ? 'false' : null, setItem: (...args) => writes.push(args) },
    $: () => button,
  });
  vm.runInContext(`${app.slice(start, end)}; globalThis.audio = textAudio;`, context);
  const audio = context.audio;
  t.after(() => audio.destroy());
  return { audio, document, button, contexts, outputs, writes, get resumes() { return resumes; } };
}

test('studio startup can play voices without a gesture when autoplay is allowed', t => {
  const f = fixture(t);
  assert.equal(f.contexts.length, 1, 'Startup must actually request audio');
  assert.equal(f.audio.enabled, true);
  assert.equal(f.audio.ready, true);
  assert.equal(f.button.textContent, '♪ SFX ON');
  assert.equal(f.audio.blip('a'), true);
  assert.ok(f.outputs[0].getChannelData(0).some(sample => sample !== 0));
  assert.deepEqual(f.writes, [], 'Startup must not replace a saved preference');
  f.button.onclick();
  assert.equal(f.audio.enabled, false, 'The running sound toggle still mutes');
});

test('blocked startup remains enabled and a later tap starts voices', async t => {
  let release;
  const first = new Promise(resolve => { release = resolve; });
  const f = fixture(t, { suspended: true, resume: attempt => attempt === 1 ? first : undefined });
  assert.equal(f.resumes, 1);
  assert.equal(f.audio.enabled, true);
  assert.equal(f.audio.ready, false);
  assert.equal(f.button.dataset.soundState, 'waiting');
  assert.equal(f.audio.blip('a'), false);
  f.document.dispatchEvent(new Event('click'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.resumes, 2);
  assert.equal(f.audio.blip('a'), true);
  assert.equal(f.button.textContent, '♪ SFX ON');
  release();
});

test('studio startup respects an explicit saved mute', t => {
  const f = fixture(t, { muted: true });
  assert.equal(f.contexts.length, 0);
  assert.equal(f.audio.enabled, false);
  assert.equal(f.button.textContent, '♪ SFX OFF');
  f.document.dispatchEvent(new Event('click'));
  assert.equal(f.contexts.length, 0);
  assert.deepEqual(f.writes, []);
  f.button.onclick();
  assert.equal(f.audio.enabled, true);
  assert.equal(f.audio.blip('a'), true);
});

test('muting during startup cancels queued voices before resume completes', async t => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const f = fixture(t, { suspended: true, resume: () => pending });
  assert.equal(f.resumes, 1);
  f.audio.playText('queued voices');
  f.audio.setEnabled(false);
  release();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.outputs.length, 0);
  assert.equal(f.audio.enabled, false);
  assert.equal(f.button.textContent, '♪ SFX OFF');
});
