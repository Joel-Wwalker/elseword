import { compilePresetDialogue } from './world-dialogue.js';
import { cityActorSVG } from './city-art.js';
import { CHARACTERS } from './scenes.js';
import { TextAudio, isAudibleCharacter } from './text-audio.js';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const resident = id => CHARACTERS.find(character => character.id === id);
const node = (tag, className, text) => {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};
const button = (className, text) => {
  const element = node('button', className, text);
  element.setAttribute('type', 'button');
  return element;
};

/** Fixed places share independent clocks for activity and translated speech. */
export class WorldPresetPlayer {
  constructor(container, { preset, getLanguage, onWordSelect = () => {}, textAudio } = {}) {
    if (!container || typeof getLanguage !== 'function' || !preset) throw new TypeError('WorldPresetPlayer needs a container, preset and getLanguage callback.');
    this.container = container;
    this.preset = preset;
    this.getLanguage = getLanguage;
    this.onWordSelect = onWordSelect;
    this.motion = matchMedia('(prefers-reduced-motion: reduce)');
    this.paused = this.motion.matches;
    this.visible = false;
    this.pageActive = true;
    this.english = true;
    this.destroyed = false;
    this.backgroundTime = 0;
    this.elapsed = 0;
    this.index = 0;
    this.lastTime = null;
    this.visibleChars = 0;
    this.revealed = false;
    this.listeners = [];
    this.wordListeners = [];
    this.textAudio = textAudio || new TextAudio();
    this.ownsTextAudio = !textAudio;
    // A shared controller may still hold a room ambience loop during a switch.
    this.textAudio.stop();
    this.sound = this.textAudio.enabled;
    this.build();
    this.unsubscribeAudio = this.textAudio.subscribe(({ enabled }) => {
      this.sound = enabled;
      if (!enabled) this.textAudio.stop();
      this.syncControls();
    });
    this.listen(this.el.pause, 'click', () => this.paused ? this.play() : this.pause());
    this.listen(this.el.replay, 'click', () => this.replay());
    this.listen(this.el.next, 'click', () => this.next());
    this.listen(this.el.english, 'click', () => this.setEnglish(!this.english));
    this.listen(this.el.sound, 'click', () => this.setSound(!(this.sound && this.textAudio.ready)));
    this.listen(this.el.text, 'focusin', () => this.hold());
    this.listen(this.el.text, 'focusout', () => { this.lastTime = null; });
    this.listen(document, 'visibilitychange', () => { this.lastTime = null; if (document.hidden) this.hold(); });
    for (const event of ['blur', 'pagehide']) this.listen(globalThis.window, event, () => { this.pageActive = false; this.hold(); });
    for (const event of ['focus', 'pageshow']) this.listen(globalThis.window, event, () => { this.pageActive = true; this.lastTime = null; });
    this.listen(this.motion, 'change', () => {
      if (this.motion.matches) this.pause();
      this.render();
    });
    this.resize = new ResizeObserver(() => {
      if (!this.destroyed) { this.measureBubble(); this.positionBubble(); this.updateHint(); }
    });
    this.resize.observe(this.el.stage);
    this.intersection = new IntersectionObserver(entries => {
      if (this.destroyed) return;
      this.visible = entries[0]?.isIntersecting === true;
      this.lastTime = null;
      if (!this.visible) this.hold();
    });
    this.intersection.observe(this.root);
    this.refresh();
    this.tick = now => {
      if (this.destroyed) return;
      const delta = this.lastTime === null || !Number.isFinite(now) ? 0 : clamp(now - this.lastTime, 0, 100);
      this.lastTime = Number.isFinite(now) ? now : null;
      if (this.isActive()) {
        this.backgroundTime += delta;
        // Long speech stays available for scrolling without stopping city life.
        if (!(this.manualAdvance && this.visibleChars >= this.letters.length)) this.elapsed += delta;
        if (this.elapsed >= this.current.duration) {
          this.elapsed -= this.current.duration;
          this.index = (this.index + 1) % this.dialogue.length;
          this.textAudio.stop();
          this.revealed = false;
        }
        this.render({ audible: delta > 0 });
      }
      this.frame = requestAnimationFrame(this.tick);
    };
    this.frame = requestAnimationFrame(this.tick);
  }

  listen(target, type, callback) {
    if (!target?.addEventListener) return;
    target.addEventListener(type, callback);
    this.listeners.push(() => target.removeEventListener(type, callback));
  }

  build() {
    this.root = node('div', 'world-player city-player');
    const toolbar = node('div', 'scene-toolbar');
    const location = node('span', 'scene-location', this.preset.location.toUpperCase());
    const status = node('span', 'scene-status');
    toolbar.append(location, status);
    const stage = node('div', 'city-stage');
    stage.setAttribute('role', 'group'); stage.setAttribute('aria-label', this.preset.description);
    const background = node('div', 'city-background'); background.setAttribute('aria-hidden', 'true');
    background.innerHTML = this.preset.renderBackground();
    const props = node('div', 'city-props'); props.setAttribute('aria-hidden', 'true');
    Object.assign(props.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    stage.append(background, props);
    this.actorMarkup = new Map();
    this.actorNodes = new Map(this.preset.characters.map(id => {
      const actor = node('div', 'city-resident');
      actor.dataset.character = id; actor.setAttribute('aria-hidden', 'true'); stage.append(actor);
      return [id, actor];
    }));
    const leader = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    leader.setAttribute('class', 'city-leader'); leader.setAttribute('aria-hidden', 'true');
    const tail = document.createElementNS('http://www.w3.org/2000/svg', 'path'); leader.append(tail);
    const bubble = node('div', 'city-bubble');
    const speaker = node('p', 'city-bubble-name');
    const text = node('p', 'city-bubble-text');
    const translation = node('p', 'city-bubble-english');
    bubble.append(speaker, text, translation); stage.append(leader, bubble);
    const accessible = node('p', 'city-transcript scene-sr-only');
    accessible.setAttribute('aria-live', 'polite'); accessible.setAttribute('aria-atomic', 'true');
    const controls = node('div', 'city-controls scene-controls');
    const playback = node('div', 'scene-playback'), options = node('div', 'scene-options');
    const pause = button('scene-control scene-pause', 'Pause');
    const replay = button('scene-control scene-replay', 'Replay');
    const next = button('scene-control scene-next', 'Next line');
    const english = button('scene-control scene-english', 'English');
    english.setAttribute('aria-pressed', 'true');
    const sound = button('scene-control scene-sound', 'SFX OFF'); sound.setAttribute('data-text-sound-toggle', '');
    const hint = node('p', 'scene-word-hint', 'Click a word to edit it.');
    playback.append(pause, replay, next); options.append(sound, english); controls.append(playback, options, hint);
    this.root.append(toolbar, stage, accessible, controls); this.container.replaceChildren(this.root);
    this.el = { stage, props, leader, tail, bubble, location, status, speaker, text, translation, accessible,
      pause, replay, next, english, sound, hint };
  }

  hasWordFocus() { return Boolean(document.activeElement && this.el.text.contains(document.activeElement)); }
  isActive() { return !this.destroyed && !this.paused && this.visible && this.pageActive && !document.hidden && !this.hasWordFocus(); }
  hold() { this.lastTime = null; this.textAudio.stop(); }

  refresh() {
    if (this.destroyed) return;
    this.hold();
    const fraction = this.current ? clamp(this.elapsed / this.current.duration, 0, 1) : 0;
    this.dialogue = compilePresetDialogue(this.preset, this.getLanguage());
    this.index = Math.min(this.index, this.dialogue.length - 1);
    this.elapsed = fraction * this.dialogue[this.index].duration;
    this.current = null;
    this.render();
    // Refreshing an already-playing reduced-motion line is a silent redraw.
    this.reducedAudioLine = this.current;
    this.syncControls();
  }

  play() {
    if (this.destroyed) return;
    this.paused = false; this.lastTime = null; this.reducedAudioLine = null; this.syncControls();
  }
  pause() {
    if (this.destroyed) return;
    this.paused = true; this.hold(); this.syncControls();
  }
  replay() {
    if (this.destroyed) return;
    this.index = 0; this.backgroundTime = 0; this.paused = this.motion.matches;
    this.replayLine();
  }
  replayLine() {
    if (this.destroyed) return;
    this.hold(); this.elapsed = 0; this.current = null; this.revealed = false;
    this.render(); this.syncControls();
  }
  next() {
    if (this.destroyed) return;
    this.hold();
    if (this.visibleChars < this.letters.length) this.revealed = true;
    else { this.index = (this.index + 1) % this.dialogue.length; this.elapsed = 0; this.revealed = false; }
    this.render();
  }
  setEnglish(value) {
    if (this.destroyed) return;
    this.english = Boolean(value); this.el.translation.hidden = !this.english;
    this.el.english.setAttribute('aria-pressed', String(this.english));
    this.updateTranscript(); this.measureBubble(); this.positionBubble(); this.updateHint();
  }
  setSound(value) {
    if (this.destroyed) return;
    this.textAudio.setEnabled(Boolean(value));
    if (this.textAudio.enabled) void this.textAudio.unlock();
  }

  syncControls() {
    if (this.destroyed) return;
    this.root.classList.toggle('scene-paused', this.paused);
    this.el.pause.textContent = this.paused ? 'Resume' : 'Pause';
    this.el.pause.setAttribute('aria-label', this.paused ? 'Resume scene' : 'Pause scene');
    this.el.status.textContent = this.paused ? 'SCENE PAUSED' : 'SCENE PLAYING';
    const supported = this.textAudio.supported !== false;
    const enabled = this.sound && supported, active = enabled && this.textAudio.ready === true;
    this.el.sound.textContent = enabled ? (active ? 'SFX ON' : 'Enable sound') : 'SFX OFF';
    this.el.sound.setAttribute('aria-label', active ? 'Mute text sounds' : 'Enable text sounds');
    this.el.sound.setAttribute('aria-pressed', String(active)); this.el.sound.disabled = !supported;
    this.el.sound.title = supported ? 'Text sound effects' : 'Text sounds are unavailable in this browser';
  }

  updateTranscript() {
    if (!this.current) return;
    const text = `${resident(this.current.speaker).name}: ${this.current.text}${this.english ? ` — ${this.current.english}` : ''}`;
    if (this.el.accessible.textContent !== text) this.el.accessible.textContent = text;
  }

  buildTextParts() {
    for (const remove of this.wordListeners) remove();
    this.wordListeners = [];
    const parts = []; let cursor = 0;
    for (const token of this.current.tokens ?? []) {
      if (token.kind !== 'word' || token.start < cursor || token.end > this.letters.length) continue;
      if (token.start > cursor) parts.push({ start: cursor, end: token.start });
      parts.push({ start: token.start, end: token.end, token }); cursor = token.end;
    }
    if (cursor < this.letters.length) parts.push({ start: cursor, end: this.letters.length });
    this.textParts = parts.map(part => {
      const element = part.token ? button('scene-word', '') : node('span', 'city-text-fragment');
      const letters = this.letters.slice(part.start, part.end);
      if (part.token) {
        const click = () => { if (!element.disabled && !this.destroyed) this.onWordSelect(part.token); };
        element.addEventListener('click', click);
        this.wordListeners.push(() => element.removeEventListener('click', click));
      }
      return { ...part, letters, node: element };
    });
    this.el.text.replaceChildren(...this.textParts.map(part => part.node));
  }

  renderTextParts(chars) {
    for (const part of this.textParts ?? []) {
      const visible = part.letters.slice(0, Math.max(0, chars - part.start)).join('');
      if (part.node.textContent !== visible) part.node.textContent = visible;
      const complete = chars >= part.end;
      part.node.setAttribute('aria-hidden', String(!complete));
      if (part.token) {
        part.node.disabled = !complete;
        if (complete) part.node.setAttribute('aria-label', `${part.letters.join('')}: inspect word`);
        else part.node.removeAttribute('aria-label');
      }
    }
  }

  updateHint() {
    const text = this.manualAdvance && this.visibleChars >= this.letters.length
      ? 'Scroll to read · Next line to continue. Click a word to edit it.' : 'Click a word to edit it.';
    if (this.el.hint.textContent !== text) this.el.hint.textContent = text;
  }

  measureBubble() {
    if (!this.current) return;
    const bounds = this.el.stage.getBoundingClientRect();
    const width = bounds.width || 512, height = bounds.height || width * 320 / 512;
    this.docked = width < 440;
    this.el.bubble.classList.toggle('city-bubble-docked', this.docked);
    if (this.docked && this.el.bubble.parentNode !== this.root) this.root.insertBefore(this.el.bubble, this.el.accessible);
    else if (!this.docked && this.el.bubble.parentNode !== this.el.stage) this.el.stage.append(this.el.bubble);
    this.el.leader.hidden = this.docked;
    if (this.docked) this.el.leader.setAttribute('hidden', ''); else this.el.leader.removeAttribute('hidden');
    this.el.bubble.style.width = this.docked ? '100%' : `${Math.min(430, width - 16, Math.max(260, width * 0.7))}px`;
    this.el.bubble.style.maxHeight = `${this.docked ? 260 : Math.max(48, height * 0.58)}px`;
    this.el.bubble.style.height = 'auto';
    // Reserve the whole line's height before typewriting so its anchor stays still.
    this.renderTextParts(this.letters.length);
    const bubble = this.el.bubble.getBoundingClientRect();
    this.bubbleBounds = { width: bubble.width, height: bubble.height, stageWidth: width, stageHeight: height };
    this.el.bubble.style.height = `${bubble.height}px`;
    this.manualAdvance = this.el.bubble.scrollHeight > this.el.bubble.clientHeight + 1;
    this.renderTextParts(this.visibleChars);
  }

  positionBubble() {
    if (!this.speakerActor || !this.bubbleBounds) return;
    if (this.docked) {
      this.el.bubble.style.left = ''; this.el.bubble.style.top = ''; return;
    }
    const bubble = this.bubbleBounds;
    const width = bubble.stageWidth, height = bubble.stageHeight;
    const anchorX = this.speakerActor.x / 512 * width, anchorY = (this.speakerActor.y - 25) / 320 * height;
    const left = clamp(anchorX - bubble.width / 2, 8, width - bubble.width - 8);
    const top = clamp(anchorY - bubble.height - 14, 8, height - bubble.height - 8);
    this.el.bubble.style.left = `${left}px`; this.el.bubble.style.top = `${top}px`;
    this.el.leader.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const bottom = top + bubble.height, tailX = clamp(anchorX, left + 16, left + bubble.width - 16);
    this.el.tail.setAttribute('d', anchorY > bottom ? `M${tailX - 7} ${bottom - 1} L${anchorX} ${anchorY} L${tailX + 7} ${bottom - 1} Z` : '');
  }

  render({ audible = false } = {}) {
    if (this.destroyed || !this.dialogue) return;
    const current = this.dialogue[this.index];
    if (this.current !== current) {
      this.current = current; this.letters = [...current.text]; this.visibleChars = 0;
      this.reducedAudioLine = null;
      this.el.speaker.textContent = resident(current.speaker).name;
      this.el.translation.textContent = current.english;
      this.el.translation.hidden = !this.english;
      this.el.text.setAttribute('dir', this.getLanguage()?.script?.direction === 'rtl' ? 'rtl' : 'ltr');
      this.el.bubble.scrollTop = 0;
      this.buildTextParts(); this.updateTranscript(); this.measureBubble();
    }
    const chars = this.motion.matches || this.revealed ? this.letters.length : Math.min(this.letters.length, Math.floor(this.elapsed / 43));
    if (audible && this.isActive() && this.sound && this.textAudio.supported && this.textAudio.ready && !this.revealed) {
      if (this.motion.matches) {
        if (this.reducedAudioLine !== current) {
          this.reducedAudioLine = current;
          this.textAudio.playText(current.text, { voiceId: current.speaker, maxDuration: Math.min(1200, current.duration - this.elapsed) });
        }
      } else {
        for (const character of this.letters.slice(this.visibleChars, chars)) {
          if (isAudibleCharacter(character)) this.textAudio.blip(character, current.speaker);
        }
      }
    }
    this.visibleChars = chars; this.renderTextParts(chars); this.updateHint();
    this.el.next.setAttribute('aria-label', chars < this.letters.length ? 'Reveal complete dialogue' : 'Next dialogue line');
    this.el.next.textContent = chars < this.letters.length ? 'Reveal line' : 'Next line';
    const sample = this.preset.sample(this.backgroundTime, { incident: current.incident, reduced: this.motion.matches });
    for (const actor of sample.actors) {
      const element = this.actorNodes.get(actor.id);
      element.style.left = `${actor.x / 512 * 100}%`; element.style.top = `${(actor.y - 28) / 320 * 100}%`;
      element.style.transform = 'translateX(-50%)';
      element.classList.toggle('city-speaking', actor.id === current.speaker);
      const markup = cityActorSVG(actor);
      if (this.actorMarkup.get(actor.id) !== markup) {
        element.innerHTML = markup; this.actorMarkup.set(actor.id, markup);
      }
    }
    this.renderProps(sample.props);
    this.speakerActor = sample.actors.find(actor => actor.id === current.speaker);
    this.positionBubble();
  }

  renderProps(props) {
    this.propNodes ??= new Map();
    const ids = new Set(props.map(prop => prop.id));
    for (const id of this.propNodes.keys()) if (!ids.has(id)) this.propNodes.delete(id);
    for (const prop of props) {
      const width = prop.width ?? 20, height = prop.height ?? 20;
      let entry = this.propNodes.get(prop.id);
      if (!entry) {
        const element = node('div', 'city-prop'); element.dataset.prop = prop.id;
        entry = { element }; this.propNodes.set(prop.id, entry);
      }
      const appearance = JSON.stringify([prop.type, prop.frame ?? 0, width, height]);
      if (entry.appearance !== appearance) {
        entry.element.innerHTML = this.preset.renderProp(prop); entry.appearance = appearance;
      }
      Object.assign(entry.element.style, {
        left: `${prop.x / 512 * 100}%`, top: `${(prop.y - height) / 320 * 100}%`,
        width: `${width / 512 * 100}%`, height: `${height / 320 * 100}%`,
        opacity: String(prop.opacity ?? 1), zIndex: prop.layer === 'front' ? '3' : '1',
      });
    }
    const order = props.map(prop => prop.id).join('|');
    if (this.propOrder !== order) {
      this.el.props.replaceChildren(...props.map(prop => this.propNodes.get(prop.id).element));
      this.propOrder = order;
    }
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true; cancelAnimationFrame(this.frame);
    for (const remove of [...this.listeners, ...this.wordListeners]) remove();
    this.listeners = []; this.wordListeners = [];
    this.resize.disconnect(); this.intersection.disconnect(); this.unsubscribeAudio?.();
    this.textAudio.stop(); if (this.ownsTextAudio) this.textAudio.destroy();
    this.container.replaceChildren();
  }
}
