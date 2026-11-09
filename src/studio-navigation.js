const VIEWS = new Set(['world', 'words', 'rules', 'writing', 'editor']);
const normalizeView = view => VIEWS.has(view) ? view : 'world';

/** Browser history belongs to navigation, not to the views' render functions. */
export function createViewNavigation({ history, location, render }) {
  function go(requested, { replace = false } = {}) {
    const view = normalizeView(requested), hash = `#${view}`;
    if (location.hash !== hash) history[replace ? 'replaceState' : 'pushState'](null, '', hash);
    render(view);
  }
  function restore() {
    const view = normalizeView(location.hash.slice(1)), hash = `#${view}`;
    if (location.hash !== hash) history.replaceState(null, '', hash);
    render(view);
  }
  return { go, restore };
}
