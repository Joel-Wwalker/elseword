// Minimal browser boundary for the real scene renderer: descendants contribute
// to textContent and keep identity until their parent's markup is replaced.
export function element() {
  const result = new EventTarget(), children = new Map();
  let text = '', html = '';
  Object.assign(result, {
    hidden: false, disabled: false, style: {}, dataset: {}, attributes: {}, options: [],
    classList: { toggle() {} },
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; },
    querySelector(selector) {
      if (!children.has(selector)) children.set(selector, element());
      return children.get(selector);
    },
    contains(child) { return child === this || [...children.values()].some(item => item.contains(child)); },
    focus() { if (globalThis.document) document.activeElement = this; },
    replaceChildren() { children.clear(); text = ''; html = ''; },
  });
  Object.defineProperties(result, {
    innerHTML: { get: () => html, set(value) { html = value; children.clear(); text = ''; } },
    textContent: {
      get: () => text + [...children.entries()].filter(([key]) => key.startsWith('[data-scene-fragment=')).map(([, child]) => child.textContent).join(''),
      set(value) { text = String(value); children.clear(); html = ''; },
    },
  });
  return result;
}
