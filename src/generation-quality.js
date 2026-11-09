/** New defaults avoid long runs; explicit custom rules keep their own semantics. */
export function generationQuality(language) {
  const sounds = language.sounds;
  const rules = sounds.rules;
  const customRules = rules && (['initial', 'final', 'forbidden'].some(name => rules[name]?.length) || Object.keys(rules.weights ?? {}).length);
  if (language.generationVersion !== 2 || customRules
    || sounds.vowels.some(value => [...value].length !== 1)
    || !sounds.patterns.some(pattern => pattern.includes('C'))) return null;
  const vowels = new Set(sounds.vowels.map(value => value.toLocaleLowerCase('en-US')));
  const clean = value => {
    let previous = '', repeated = 0, vowelRun = 0;
    for (const letter of value.normalize('NFC').toLocaleLowerCase('en-US')) {
      repeated = letter === previous ? repeated + 1 : 1;
      vowelRun = vowels.has(letter) ? vowelRun + 1 : 0;
      if (repeated > 2 || vowelRun > 2) return false;
      previous = letter;
    }
    return true;
  };
  // A custom affix can intentionally contain a long run. Preserve it rather
  // than making every possible root fail the default spelling preference.
  const suffix = language.grammar?.plural ?? '';
  const checkSuffix = clean(suffix);
  return word => clean(word) && (!checkSuffix || clean(word + suffix));
}
