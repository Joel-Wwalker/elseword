import { createLanguage, validateLanguage } from './engine.js';

export const STARTER_SET_VERSION = 1;

/** Return editable copies; starter definitions are never shared with a project. */
export function createStarterLanguages() {
  const velka = createLanguage({ name: 'Velka', seed: 'oddtongue-velka-v1', preset: 'crisp',
    grammar: { order: 'SOV', adjective: 'before', plural: 'ik', past: 'tek', future: 'ke', negative: 'za', question: 'chi' } });
  const oruni = createLanguage({ name: 'Oruni', seed: 'oddtongue-oruni-v1', preset: 'earthy',
    grammar: { order: 'VSO', adjective: 'after', plural: 'um', past: 'da', future: 'wo', negative: 'nu', question: 'ha' } });
  return [createLanguage(), validateLanguage(velka), validateLanguage(oruni)];
}

/** Preserve existing starter IDs, including renamed or edited copies. */
export function addNewStarters(languages, limit) {
  const ids = new Set(languages.map(language => language.id));
  const additions = createStarterLanguages().slice(1).filter(language => !ids.has(language.id));
  return [...languages, ...additions.slice(0, Math.max(0, limit - languages.length))];
}
