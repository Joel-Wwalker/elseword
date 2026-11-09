import { createLanguage, regenerateLanguage, validateLanguage, PRESETS } from './engine.js';
import { validateCloudConfig } from './cloud-service.js';

export function languageFromBlueprint(value) {
  if (!value || value.version !== 1 || typeof value.name !== 'string' || typeof value.seed !== 'string'
    || !PRESETS.some(preset => preset.id === value.preset) || !value.sounds || !value.grammar) {
    throw new Error('The generated language was invalid. Please try again.');
  }
  const base = createLanguage({name:value.name, seed:value.seed, preset:value.preset});
  base.sounds = structuredClone(value.sounds);
  base.grammar = structuredClone(value.grammar);
  base.words.forEach(word => { word.locked = false; });
  // A catalog seed always expands with the same first vocabulary revision.
  return validateLanguage(regenerateLanguage(base));
}

export function createLanguageGenerator(input, {fetch: request = globalThis.fetch} = {}) {
  const config = validateCloudConfig(input);
  return async (recentSeeds = []) => {
    if (!config.url) throw new Error('Online language generation is not available here. You can still create a language yourself.');
    const excluded = [...new Set(recentSeeds.filter(seed => typeof seed === 'string' && /^oddtongue-catalog-v1-[0-9]{4}$/.test(seed)))].slice(-25);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await request(`${config.url}/rest/v1/rpc/pick_language_blueprint`, {
        method:'POST', credentials:'omit', signal:controller.signal,
        headers:{apikey:config.publishableKey,'Content-Type':'application/json'},
        body:JSON.stringify({excluded_seeds:excluded}),
      });
      if (!response.ok) throw new Error('Language generation is unavailable. Please try again, or create one yourself.');
      return languageFromBlueprint(await response.json());
    } catch (error) {
      if (error?.name === 'AbortError' || error instanceof TypeError) throw new Error('Could not reach the language generator. Check your connection and try again.');
      throw error;
    } finally { clearTimeout(timeout); }
  };
}
