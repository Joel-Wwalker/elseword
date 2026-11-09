import test from 'node:test';
import assert from 'node:assert/strict';

const audioModule = await import('../src/text-audio.js').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const { TextAudio, makeBlipSamples, isAudibleCharacter } = audioModule;

class Events {
  listeners = new Map();
  hidden = false;
  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(callback);
  }
  removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); }
  dispatch(type, event = {}) { for (const callback of this.listeners.get(type) || []) callback(event); }
}

function fixture({ storage = new Map(), suspended = false, resume, contextFails = false } = {}) {
  assert.equal(typeof TextAudio, 'function', 'Shared text audio controller must exist');
  let time = 0;
  let nextTimer = 0;
  const timers = new Map();
  const contexts = [];
  const outputs = [];
  const document = new Events();
  const window = new Events();
  class AudioContext extends Events {
    constructor() {
      super();
      if (contextFails) throw new Error('Audio unavailable');
      this.state = suspended ? 'suspended' : 'running';
      this.sampleRate = 22050;
      this.destination = {};
      contexts.push(this);
    }
    get currentTime() { return time / 1000; }
    resume() {
      const result = resume?.();
      return Promise.resolve(result).then(() => {
        this.state = 'running';
        this.dispatch('statechange');
      });
    }
    async close() { this.state = 'closed'; }
    createBuffer(channels, length, sampleRate) {
      const samples = new Float32Array(length);
      return { duration: length / sampleRate, getChannelData: () => samples };
    }
    createBufferSource() {
      const source = {
        buffer: null, onended: null, stopped: false, disconnected: false,
        connect() {},
        disconnect() { this.disconnected = true; },
        start() { outputs.push({ source: this, at: time }); },
        stop() { this.stopped = true; },
      };
      return source;
    }
  }
  const audio = new TextAudio({
    AudioContext, document, window,
    storage: storage instanceof Map ? { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) } : storage,
    now: () => time,
    setTimeout: (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, at: time + delay }); return id; },
    clearTimeout: id => timers.delete(id),
  });
  function advance(ms) {
    const target = time + ms;
    for (;;) {
      const next = [...timers].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      time = next[1].at;
      timers.delete(next[0]);
      next[1].callback();
    }
    time = target;
  }
  return { audio, contexts, outputs, document, window, timers, storage, advance };
}

test('original voice samples are quiet, finite, short and smoothly enveloped', () => {
  assert.equal(typeof makeBlipSamples, 'function', 'Original PCM synthesizer must exist');
  const voices = ['moss', 'kiln', 'vesper', 'slate', 'rook', 'brine', 'shard', 'hush', 'narrator'];
  const fingerprints = new Set();
  for (const voice of voices) {
    const samples = makeBlipSamples(voice, 'é', 22050);
    assert.ok(samples instanceof Float32Array);
    assert.ok(samples.length >= 400 && samples.length <= 1800);
    assert.equal(samples[0], 0);
    assert.ok(Math.abs(samples.at(-1)) < 1e-6);
    let peak = 0;
    let energy = 0;
    for (const sample of samples) { assert.ok(Number.isFinite(sample)); peak = Math.max(peak, Math.abs(sample)); energy += sample * sample; }
    assert.ok(peak > 0.005 && peak <= 0.12, `${voice} must be audible but quiet`);
    assert.ok(energy / samples.length > 0.00001);
    fingerprints.add(Array.from(samples.slice(0, 150)).join(','));
  }
  assert.equal(fingerprints.size, voices.length, 'Every character needs a distinct timbre');
  assert.ok(makeBlipSamples('moss', 'a', 44100).length > makeBlipSamples('moss', 'a', 22050).length);
});

test('audible characters include Unicode letters, numbers and symbols but exclude punctuation and whitespace', () => {
  assert.equal(typeof isAudibleCharacter, 'function', 'Unicode filtering must exist');
  for (const char of ['a', 'é', '中', '𐐀', '7', '٣', '★', '🙂']) assert.equal(isAudibleCharacter(char), true, char);
  for (const char of ['', ' ', '\n', '.', ',', '!', '—', '…', '、', '\u0301']) assert.equal(isAudibleCharacter(char), false, char);
});

test('audio stays lazy until a user gesture and subscriptions track persistent mute', async () => {
  const f = fixture();
  const states = [];
  const unsubscribe = f.audio.subscribe(state => states.push(state));
  assert.deepEqual(states, [{ enabled: true, supported: true, ready: false }]);
  f.audio.playText('initial render');
  assert.equal(f.contexts.length, 0);
  assert.equal(f.timers.size, 0);
  f.document.dispatch('pointerdown');
  await f.audio.unlock();
  assert.equal(f.contexts.length, 1);
  assert.equal(f.audio.ready, true);
  f.audio.setEnabled(false);
  assert.equal(states.at(-1).enabled, false);
  const restored = fixture({ storage: f.storage });
  assert.equal(restored.audio.enabled, false);
  const count = states.length;
  unsubscribe();
  f.audio.setEnabled(true);
  assert.equal(states.length, count);
  f.audio.destroy(); restored.audio.destroy();
});

test('sound-toggle activation does not resume audio before its click handler can mute', async () => {
  const f = fixture();
  f.document.dispatch('pointerdown', { target: { closest: selector => selector === '[data-text-sound-toggle]' ? {} : null } });
  assert.equal(f.contexts.length, 0);
  f.audio.setEnabled(false);
  assert.equal(await f.audio.unlock(), false);
  f.audio.setEnabled(true);
  assert.equal(await f.audio.unlock(), true);
  f.audio.destroy();
});

test('touch and pen playback wait for pointer release before requesting audio', async () => {
  for (const pointerType of ['touch', 'pen']) {
    const f = fixture({ suspended: true });
    f.document.dispatch('pointerdown', { pointerType });
    assert.equal(f.contexts.length, 0, 'Contact alone is not an audio activation gesture');
    f.document.dispatch('pointerup', { pointerType });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.audio.blip('a', 'moss'), true);
    assert.equal(f.outputs.length, 1);
    f.audio.destroy();
  }
});

test('click activation starts voices without requiring a preceding pointer event', async () => {
  const f = fixture({ suspended: true });
  f.document.dispatch('click');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.audio.blip('a'), true);
  f.audio.destroy();
});

test('Escape does not start an audio request without browser activation', () => {
  const f = fixture({ suspended: true });
  f.document.dispatch('keydown', { key: 'Escape' });
  assert.equal(f.contexts.length, 0);
  f.document.dispatch('keydown', { key: 'Enter' });
  assert.equal(f.contexts.length, 1);
  f.audio.destroy();
});

test('a later gesture retries a pending resume and stale rejection cannot stop playback', async () => {
  let rejectFirst;
  const first = new Promise((resolve, reject) => { rejectFirst = reject; });
  let attempts = 0;
  const f = fixture({ suspended: true, resume: () => ++attempts === 1 ? first : undefined });
  const oldRequest = f.audio.unlock();
  f.document.dispatch('click');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(attempts, 2, 'A pending request must not swallow the next user gesture');
  assert.equal(f.audio.ready, true);
  f.audio.playText('abcdef');
  assert.equal(f.outputs.length, 1);
  rejectFirst(new Error('Old activation failed'));
  await oldRequest;
  assert.equal(f.outputs[0].source.stopped, false, 'An old request cannot cancel newly started voices');
  f.advance(80);
  assert.ok(f.outputs.length > 1);
  f.audio.destroy();
});

test('mute and destruction cancel output while a retried resume is pending', async () => {
  for (const reason of ['mute', 'destroy']) {
    const resolvers = [];
    const f = fixture({ suspended: true, resume: () => new Promise(resolve => resolvers.push(resolve)) });
    const first = f.audio.unlock();
    const second = f.audio.unlock();
    assert.equal(resolvers.length, 2);
    f.audio.playText('pending voices');
    if (reason === 'mute') f.audio.setEnabled(false);
    else f.audio.destroy();
    resolvers[1]();
    await second;
    resolvers[0]();
    await first;
    f.advance(2000);
    assert.equal(f.outputs.length, 0, reason);
    f.audio.destroy();
  }
});

test('touch release and click on a sound toggle leave activation to its handler', () => {
  const f = fixture();
  const target = { closest: () => ({}) };
  f.document.dispatch('pointerup', { pointerType: 'touch', target });
  f.document.dispatch('click', { target });
  assert.equal(f.contexts.length, 0);
  f.audio.destroy();
});

test('blips filter punctuation, throttle to 40ms, and release ended audio nodes', async () => {
  const f = fixture();
  await f.audio.unlock();
  for (const char of [' ', '.', '!']) f.audio.blip(char);
  assert.equal(f.outputs.length, 0);
  f.audio.blip('中', 'moss');
  f.audio.blip('x', 'moss');
  f.advance(39); f.audio.blip('x');
  assert.equal(f.outputs.length, 1);
  f.advance(1); f.audio.blip('★', 'hush');
  assert.equal(f.outputs.length, 2);
  f.outputs[0].source.onended();
  assert.equal(f.outputs[0].source.disconnected, true);
  f.audio.stop();
  assert.equal(f.outputs[0].source.stopped, false, 'Ended sources are no longer active');
  assert.equal(f.outputs[1].source.stopped, true);
  f.audio.destroy();
});

test('generated bursts are capped at 1200ms even when callers request a long duration', async () => {
  const f = fixture();
  await f.audio.unlock();
  f.audio.playText('a'.repeat(50000), { maxDuration: 60000 });
  assert.ok(f.timers.size <= 1, 'A burst uses one pending timer, not one timer per character');
  f.advance(100000);
  assert.ok(f.outputs.length > 10 && f.outputs.length <= 30);
  for (const output of f.outputs) assert.ok(output.at + output.source.buffer.duration * 1000 <= 1200);
  assert.equal(f.timers.size, 0);
  f.audio.destroy();
});

test('rapid edits replace delayed gloss sounds and do not accumulate output', async () => {
  const f = fixture();
  await f.audio.unlock();
  f.audio.playText('old sentence', { delay: 150 });
  f.advance(100);
  f.audio.playText('中', { delay: 150 });
  f.advance(149);
  assert.equal(f.outputs.length, 0);
  f.advance(1);
  assert.equal(f.outputs.length, 1);
  f.advance(5000);
  assert.equal(f.outputs.length, 1);
  f.audio.destroy();
});

test('repeated immediate output still respects the shared 40ms throttle', async () => {
  const f = fixture();
  await f.audio.unlock();
  f.audio.playText('a');
  f.advance(10);
  f.audio.playText('b');
  f.advance(10);
  f.audio.playText('中');
  assert.equal(f.outputs.length, 1, 'Replacing a burst must not bypass the shared rate limit');
  f.advance(20);
  assert.equal(f.outputs.length, 2, 'The latest character waits for the next available blip');
  assert.equal(f.outputs[1].at, 40);
  f.advance(2000);
  assert.equal(f.outputs.length, 2);
  f.audio.destroy();
});

test('a new burst stops old sources and an empty replacement cancels pending output', async () => {
  const f = fixture();
  await f.audio.unlock();
  f.audio.playText('abcdefghij');
  f.audio.playText('x', { delay: 150 });
  assert.equal(f.outputs[0].source.stopped, true);
  f.audio.playText('   .!');
  f.advance(5000);
  assert.equal(f.outputs.length, 1);
  assert.equal(f.timers.size, 0);
  f.audio.destroy();
});

test('mute, pagehide and document hiding cancel both pending and active sounds', async () => {
  for (const reason of ['mute', 'hidden', 'pagehide']) {
    const f = fixture();
    await f.audio.unlock();
    f.audio.playText('abcdef');
    if (reason === 'mute') f.audio.setEnabled(false);
    if (reason === 'hidden') { f.document.hidden = true; f.document.dispatch('visibilitychange'); }
    if (reason === 'pagehide') f.window.dispatch('pagehide');
    assert.equal(f.outputs[0].source.stopped, true, reason);
    f.advance(5000);
    assert.equal(f.outputs.length, 1, reason);
    if (reason === 'hidden') f.audio.blip('a');
    assert.equal(f.outputs.length, 1, reason);
    f.audio.destroy();
  }
});

test('pending resume cannot resurrect output canceled by mute, stop or destruction', async () => {
  for (const reason of ['mute', 'stop', 'destroy']) {
    let resolve;
    const pending = new Promise(done => { resolve = done; });
    const f = fixture({ suspended: true, resume: () => pending });
    const unlocking = f.audio.unlock();
    f.audio.playText('stale text');
    if (reason === 'mute') f.audio.setEnabled(false);
    if (reason === 'stop') f.audio.stop();
    if (reason === 'destroy') f.audio.destroy();
    resolve();
    await unlocking;
    f.advance(5000);
    assert.equal(f.outputs.length, 0, reason);
    f.audio.destroy();
  }
});

test('first generated output can wait for activation but expires if activation arrives too late', async () => {
  for (const wait of [100, 2000]) {
    let resolve;
    const pending = new Promise(done => { resolve = done; });
    const f = fixture({ suspended: true, resume: () => pending });
    const unlocking = f.audio.unlock();
    f.audio.playText('a');
    f.advance(wait);
    resolve(); await unlocking;
    assert.equal(f.outputs.length, wait === 100 ? 1 : 0);
    f.audio.destroy();
  }
});

test('unsupported audio, denied storage and failed contexts are harmless', async () => {
  assert.equal(typeof TextAudio, 'function');
  const unsupported = new TextAudio({ AudioContext: null, document: null, window: null, storage: { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } } });
  assert.equal(unsupported.supported, false);
  unsupported.setEnabled(false);
  unsupported.setEnabled(true);
  assert.equal(await unsupported.unlock(), false);
  unsupported.playText('text'); unsupported.blip('a'); unsupported.stop(); unsupported.destroy();
  const failed = fixture({ contextFails: true });
  assert.equal(await failed.audio.unlock(), false);
  assert.equal(failed.audio.supported, false);
  const rejected = fixture({ suspended: true, resume: () => Promise.reject(new Error('gesture rejected')) });
  assert.equal(await rejected.audio.unlock(), false);
  assert.equal(rejected.audio.ready, false);
  rejected.audio.destroy(); failed.audio.destroy();
});

test('a synchronous resume failure can be retried on a later gesture', async () => {
  let attempts = 0;
  const f = fixture({ suspended: true, resume: () => { if (++attempts === 1) throw new Error('activation rejected'); } });
  assert.equal(await f.audio.unlock(), false);
  assert.equal(await f.audio.unlock(), true);
  f.audio.blip('a');
  assert.equal(f.outputs.length, 1);
  f.audio.destroy();
});

test('destroy closes owned context and removes gesture and lifecycle listeners', async () => {
  const f = fixture();
  await f.audio.unlock();
  f.audio.playText('long text', { delay: 150 });
  f.audio.destroy();
  assert.equal(f.contexts[0].state, 'closed');
  assert.equal(f.timers.size, 0);
  for (const callbacks of [...f.document.listeners.values(), ...f.window.listeners.values()]) assert.equal(callbacks.size, 0);
  f.document.dispatch('pointerdown');
  assert.equal(await f.audio.unlock(), false);
  f.advance(5000);
  assert.equal(f.outputs.length, 0);
});
