// Browser boundaries only: production dialogue, motion and audio gating stay real.
export class BrowserElement extends EventTarget {
  constructor(tagName = 'div') {
    super(); this.tagName = tagName.toUpperCase(); this.children = []; this.attributes = {};
    this.style = {}; this.dataset = {}; this.hidden = false; this.disabled = false;
    this._text = ''; this._html = ''; this.writes = 0; this.htmlWrites = 0; this.measurements = 0; this.listeners = new Map();
    this.classList = { toggle: (name, force) => {
      const names = new Set((this.className || '').split(/\s+/).filter(Boolean));
      if (force ?? !names.has(name)) names.add(name); else names.delete(name);
      this.className = [...names].join(' ');
    } };
  }
  addEventListener(type, callback, options) {
    super.addEventListener(type, callback, options);
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(callback);
  }
  removeEventListener(type, callback, options) {
    super.removeEventListener(type, callback, options); this.listeners.get(type)?.delete(callback);
  }
  setAttribute(name, value) { this.attributes[name] = String(value); if (name === 'class') this.className = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }
  append(...nodes) {
    for (const node of nodes) {
      if (node.parentNode) node.parentNode.children = node.parentNode.children.filter(child => child !== node);
      node.parentNode = this; this.children.push(node);
    }
  }
  insertBefore(node, reference) {
    if (node.parentNode) node.parentNode.children = node.parentNode.children.filter(child => child !== node);
    node.parentNode = this;
    const index = this.children.indexOf(reference);
    this.children.splice(index < 0 ? this.children.length : index, 0, node);
  }
  replaceChildren(...nodes) { for (const child of this.children) child.parentNode = null; this.children = []; this._text = ''; this._html = ''; this.append(...nodes); }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  set textContent(value) { this.replaceChildren(); this._text = String(value); this.writes++; }
  get innerHTML() { return this._html; }
  set innerHTML(value) {
    this.replaceChildren(); this.htmlWrites++;
    // Browsers serialize self-closing SVG elements with explicit closing tags.
    this._html = String(value).replace(/<(\w+)([^>]*)\/>/g, '<$1$2></$1>');
  }
  contains(node) { return this === node || this.children.some(child => child.contains(node)); }
  querySelectorAll(selector) {
    const matches = node => selector.startsWith('.') ? (node.className || '').split(/\s+/).includes(selector.slice(1))
      : node.tagName.toLowerCase() === selector;
    return this.children.flatMap(child => [...(matches(child) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  focus() {
    const previous = document.activeElement; document.activeElement = this;
    for (let node = previous; node; node = node.parentNode) node.dispatchEvent(new Event('focusout'));
    for (let node = this; node; node = node.parentNode) node.dispatchEvent(new Event('focusin'));
  }
  getBoundingClientRect() {
    this.measurements++;
    const stage = this.className === 'city-stage';
    const width = stage ? 512 : Number.parseFloat(this.style.width) || 350;
    const height = stage ? 320 : Math.min(Number.parseFloat(this.style.maxHeight) || 180, 56 + Math.ceil(this.textContent.length / 35) * 22);
    return { x: 0, y: 0, top: 0, left: 0, width, height, right: width, bottom: height };
  }
}

export function browserBoundary(t, { reduced = false } = {}) {
  const document = new BrowserElement('document'), window = new BrowserElement('window');
  document.createElement = tag => new BrowserElement(tag);
  document.createElementNS = (_, tag) => new BrowserElement(tag);
  document.hidden = false; document.activeElement = null;
  const motion = new BrowserElement(); motion.matches = reduced;
  const frames = new Map(); let frameId = 0, time = 1000;
  class Observer {
    constructor(callback) { this.callback = callback; this.disconnected = false; }
    observe(target) { this.target = target; }
    disconnect() { this.disconnected = true; }
  }
  const globals = { document, window, matchMedia: () => motion, ResizeObserver: Observer, IntersectionObserver: Observer,
    requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame(id) { frames.delete(id); } };
  for (const [name, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    t.after(() => original ? Object.defineProperty(globalThis, name, original) : delete globalThis[name]);
  }
  const frame = delta => {
    time += delta; const pending = [...frames.values()]; frames.clear();
    for (const callback of pending) callback(time);
  };
  return { document, window, motion, frames, frame, host: new BrowserElement(),
    advance(milliseconds) { while (milliseconds > 0) { const delta = Math.min(43, milliseconds); frame(delta); milliseconds -= delta; } } };
}

export function audioBoundary({ enabled = true, supported = true, ready = true } = {}) {
  const listeners = new Set();
  return {
    enabled, supported, ready, calls: [], bursts: [], stops: 0, destroys: 0, unlocks: 0,
    subscribe(callback) { listeners.add(callback); callback(this); return () => listeners.delete(callback); },
    setEnabled(value) { this.enabled = Boolean(value); for (const callback of listeners) callback(this); },
    async unlock() { this.unlocks++; },
    blip(character, voiceId) { this.calls.push([character, voiceId]); },
    playText(text, options) { this.bursts.push({ text, ...options }); },
    stop() { this.stops++; }, destroy() { this.destroys++; },
    get subscribers() { return listeners.size; },
  };
}
