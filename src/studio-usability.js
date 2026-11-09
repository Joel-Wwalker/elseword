import { validateLanguage } from './engine.js';
import { createStarterLanguages } from './starter-languages.js';

let examples;

/** An edited, imported or copied starter is the visitor's work, not an example. */
export function starterExampleName(language) {
  examples ??= createStarterLanguages().map(example => ({ id: example.id, name: example.name, json: JSON.stringify(example) }));
  const example = examples.find(item => item.id === language.id);
  if (!example) return '';
  const json = JSON.stringify(validateLanguage(language));
  return example.json === json ? example.name : '';
}

/** Keep the language validator authoritative while attaching its error to a control. */
export function validateRulesEdit(source, patch, fallbackField = 'sounds') {
  try {
    const language = validateLanguage({ ...source, ...patch });
    if (patch.sounds && JSON.stringify(language.sounds) !== JSON.stringify(source.sounds)) delete language.generationVersion;
    return { language, errors: {} };
  } catch (error) {
    const message = error.message;
    const field = fallbackField !== 'sounds' ? fallbackField
      : /vowel/i.test(message) ? 'vowels'
      : /consonant/i.test(message) ? 'consonants'
      : /syllable patterns/i.test(message) ? 'patterns'
      : /syllable counts|80 characters/i.test(message) ? 'max-syllables'
      : /^Seed\b/i.test(message) ? 'language-seed'
      : fallbackField;
    return { language: null, errors: { [field]: message } };
  }
}
