const PREFERENCE_KEY = 'little-languages:text-sounds';
const BLIP_INTERVAL = 40;
const MAX_BURST = 1200;

// Original pulse voices: pitch, pulse width, brightness, duration and level.
// These are synthesized locally; no recordings or game audio are used.
const VOICES = {
  moss:     [172, 0.42, 0.28, 0.049, 0.063],
  kiln:     [133, 0.30, 0.48, 0.054, 0.067],
  vesper:   [279, 0.44, 0.20, 0.041, 0.053],
  slate:    [156, 0.50, 0.15, 0.047, 0.059],
  rook:     [218, 0.25, 0.53, 0.043, 0.061],
  brine:    [193, 0.38, 0.35, 0.051, 0.058],
  shard:    [313, 0.22, 0.57, 0.038, 0.052],
  hush:     [242, 0.48, 0.10, 0.046, 0.034],
  narrator: [205, 0.40, 0.24, 0.044, 0.052],
};

export function isAudibleCharacter(character) {
  return typeof character === 'string' && /[\p{L}\p{N}\p{S}]/u.test(character);
}

export function makeBlipSamples(voiceId, character, sampleRate = 22050) {
  const [pitch, width, brightness, duration, level] = VOICES[voiceId] || VOICES.narrator;
  const rate = Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate : 22050;
  const samples = new Float32Array(Math.max(2, Math.round(rate * duration)));
  if (!isAudibleCharacter(character)) return samples;
  const variation = ((character.codePointAt(0) % 13) - 6) / 150;
  const frequency = pitch * (1 + variation);
  const twoPi = Math.PI * 2;
  for (let i = 1; i < samples.length - 1; i++) {
    const time = i / rate;
    const progress = i / (samples.length - 1);
    const phase = twoPi * frequency * time * (1 - 0.055 * progress);
    const pulse = Math.tanh(2.4 * (Math.sin(phase) + (0.5 - width))) - (0.5 - width);
    const voiced = 0.62 * Math.sin(phase) + 0.25 * pulse
      + brightness * 0.17 * Math.sin(phase * 2) + brightness * 0.10 * Math.sin(phase * 3);
    const attack = Math.min(1, time / 0.004);
    const release = Math.min(1, (duration - time) / 0.010);
    const envelope = Math.sin(attack * Math.PI / 2) ** 2
      * Math.sin(release * Math.PI / 2) ** 2 * (1 - 0.25 * progress);
    samples[i] = voiced * envelope * level;
  }
  return samples;
}

function globalValue(name) {
  try { return globalThis[name]; } catch { return undefined; }
}

export class TextAudio {
  constructor(options = {}) {
    this._AudioContext = Object.hasOwn(options, 'AudioContext') ? options.AudioContext
      : globalValue('AudioContext') || globalValue('webkitAudioContext');
    this._document = Object.hasOwn(options, 'document') ? options.document : globalValue('document');
    this._window = Object.hasOwn(options, 'window') ? options.window : globalValue('window');
    this._storage = Object.hasOwn(options, 'storage') ? options.storage : globalValue('localStorage');
    this._now = options.now || (() => globalThis.performance?.now?.() ?? Date.now());
    this._setTimeout = options.setTimeout || globalThis.setTimeout.bind(globalThis);
    this._clearTimeout = options.clearTimeout || globalThis.clearTimeout.bind(globalThis);
    this.enabled = true;
    this.supported = typeof this._AudioContext === 'function';
    this.ready = false;
    try { this.enabled = this._storage?.getItem(PREFERENCE_KEY) !== 'false'; } catch { /* Storage can be blocked. */ }
    this._subscribers = new Set();
    this._sources = new Set();
    this._listeners = [];
    this._context = null;
    this._resumePromise = null;
    this._pending = null;
    this._timer = null;
    this._lastPlayed = -Infinity;
    this._destroyed = false;

    const gesture = event => {
      if (event?.repeat || event?.target?.closest?.('[data-text-sound-toggle]')) return;
      void this.unlock();
    };
    // Mouse presses activate immediately; touch and pen activate on release.
    // Starting resume on contact can leave it waiting for a valid gesture.
    this._listen(this._document, 'pointerdown', event => {
      if (!event?.pointerType || event.pointerType === 'mouse') gesture(event);
    }, true);
    this._listen(this._document, 'pointerup', event => {
      if (event?.pointerType !== 'mouse') gesture(event);
    }, true);
    this._listen(this._document, 'click', gesture, true);
    this._listen(this._document, 'keydown', gesture, true);
    this._listen(this._document, 'visibilitychange', () => { if (this._hidden()) this.stop(); });
    this._listen(this._window, 'pagehide', () => this.stop());
  }

  _listen(target, type, callback, capture = false) {
    if (!target?.addEventListener) return;
    target.addEventListener(type, callback, capture);
    this._listeners.push(() => target.removeEventListener(type, callback, capture));
  }

  _hidden() { return !!this._document?.hidden; }

  _notify() {
    const state = { enabled: this.enabled, supported: this.supported, ready: this.ready };
    for (const callback of this._subscribers) {
      try { callback(state); } catch { /* A UI listener must not interrupt audio cleanup. */ }
    }
  }

  subscribe(callback) {
    this._subscribers.add(callback);
    try { callback({ enabled: this.enabled, supported: this.supported, ready: this.ready }); } catch { /* Isolate listeners. */ }
    return () => this._subscribers.delete(callback);
  }

  setEnabled(enabled) {
    if (this._destroyed) return;
    this.enabled = !!enabled;
    try { this._storage?.setItem(PREFERENCE_KEY, String(this.enabled)); } catch { /* Preference is optional. */ }
    if (!this.enabled) this.stop();
    this._notify();
  }

  _syncReady() {
    const ready = !this._destroyed && this._context?.state === 'running';
    if (ready !== this.ready) {
      this.ready = ready;
      if (!ready) this.stop();
      this._notify();
    }
  }

  async unlock() {
    if (this._destroyed || !this.enabled || !this.supported || this._hidden()) return false;
    if (!this._context) {
      try {
        this._context = new this._AudioContext();
        this._listen(this._context, 'statechange', () => this._syncReady());
      } catch {
        this.supported = false;
        this._notify();
        return false;
      }
    }
    this._syncReady();
    if (this.ready) { this._kickPending(); return true; }
    if (this._resumePromise) return this._resumePromise;
    // Only the latest pending burst survives; stop/mute remove it while resume awaits.
    this._resumePromise = (async () => {
      try {
        await this._context.resume();
        this._syncReady();
        this._kickPending();
        return this.ready && this.enabled && !this._hidden();
      } catch {
        this.stop();
        this._syncReady();
        return false;
      }
    })().finally(() => { this._resumePromise = null; });
    return this._resumePromise;
  }

  blip(character, voiceId = 'narrator') {
    return this._playCharacter(character, voiceId);
  }

  _playCharacter(character, voiceId, remaining = Infinity) {
    if (this._destroyed || !this.enabled || !this.ready || this._hidden() || !isAudibleCharacter(character)) return false;
    const now = this._now();
    if (now - this._lastPlayed < BLIP_INTERVAL) return false;
    let source;
    try {
      const sampleRate = this._context.sampleRate || 22050;
      const samples = makeBlipSamples(voiceId, character, sampleRate);
      if (samples.length / sampleRate * 1000 > remaining) return false;
      const buffer = this._context.createBuffer(1, samples.length, sampleRate);
      buffer.getChannelData(0).set(samples);
      source = this._context.createBufferSource();
      source.buffer = buffer;
      source.connect(this._context.destination);
      source.onended = () => {
        this._sources.delete(source);
        source.onended = null;
        try { source.disconnect(); } catch { /* Already disconnected. */ }
      };
      this._sources.add(source);
      source.start();
      this._lastPlayed = now;
      return true;
    } catch {
      if (source) {
        this._sources.delete(source);
        source.onended = null;
        try { source.disconnect(); } catch { /* Partial node creation can fail. */ }
      }
      return false;
    }
  }

  playText(text, { voiceId = 'narrator', maxDuration = MAX_BURST, delay = 0 } = {}) {
    this.stop();
    if (this._destroyed || !this.enabled || !this.supported || this._hidden() || (!this.ready && !this._resumePromise)) return;
    const duration = Number.isFinite(maxDuration) ? Math.max(0, Math.min(MAX_BURST, maxDuration)) : MAX_BURST;
    if (!duration) return;
    const characters = [];
    const limit = Math.ceil(duration / BLIP_INTERVAL);
    for (const character of String(text ?? '')) {
      if (isAudibleCharacter(character)) characters.push(character);
      if (characters.length >= limit) break;
    }
    if (!characters.length) return;
    const start = this._now() + (Number.isFinite(delay) ? Math.max(0, delay) : 0);
    this._pending = { characters, index: 0, voiceId, start, end: start + duration };
    this._kickPending();
  }

  _kickPending() {
    if (!this._pending || this._timer !== null || !this.ready) return;
    if (!this.enabled || this._destroyed || this._hidden()) { this.stop(); return; }
    const pending = this._pending;
    const wait = Math.max(0, pending.start - this._now());
    if (wait) this._timer = this._setTimeout(() => this._pump(pending), wait);
    else this._pump(pending);
  }

  _pump(pending) {
    this._timer = null;
    if (this._pending !== pending) return;
    const remaining = pending.end - this._now();
    if (remaining <= 0 || !this.enabled || !this.ready || this._hidden() || this._destroyed) {
      this._pending = null;
      return;
    }
    const throttleWait = BLIP_INTERVAL - (this._now() - this._lastPlayed);
    if (throttleWait > 0) {
      this._timer = this._setTimeout(() => this._pump(pending), Math.min(throttleWait, remaining));
      return;
    }
    this._playCharacter(pending.characters[pending.index++], pending.voiceId, remaining);
    if (pending.index < pending.characters.length) {
      this._timer = this._setTimeout(() => this._pump(pending), Math.min(BLIP_INTERVAL, remaining));
    } else this._pending = null;
  }

  stop() {
    this._pending = null;
    if (this._timer !== null) this._clearTimeout(this._timer);
    this._timer = null;
    for (const source of this._sources) {
      source.onended = null;
      try { source.stop(); } catch { /* A source may have just ended. */ }
      try { source.disconnect(); } catch { /* Already disconnected. */ }
    }
    this._sources.clear();
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this.stop();
    for (const remove of this._listeners) remove();
    this._listeners.length = 0;
    this.ready = false;
    this._notify();
    this._subscribers.clear();
    try { Promise.resolve(this._context?.close()).catch(() => {}); } catch { /* Closing is best effort. */ }
  }
}
