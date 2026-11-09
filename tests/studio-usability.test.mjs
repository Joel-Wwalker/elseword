import test from 'node:test';
import assert from 'node:assert/strict';
import { createLanguage } from '../src/engine.js';
import { createStarterLanguages } from '../src/starter-languages.js';
import { createViewNavigation } from '../src/studio-navigation.js';
import { validateRulesEdit, starterExampleName } from '../src/studio-usability.js';

function browser(initial = '#world') {
  const location = { hash: initial }, entries = [initial];
  let position = 0;
  return {
    location, entries,
    history: {
      pushState(_state, _title, hash) { entries.splice(++position, entries.length, hash); location.hash = hash; },
      replaceState(_state, _title, hash) { entries[position] = hash; location.hash = hash; },
    },
    back() { if (position) location.hash = entries[--position]; },
    forward() { if (position < entries.length - 1) location.hash = entries[++position]; },
  };
}

test('tab navigation records one entry per destination and restores Back and Forward without extra entries', () => {
  const page = browser(), rendered = [];
  const navigation = createViewNavigation({ ...page, render: view => rendered.push(view) });
  navigation.restore();
  navigation.go('words');
  navigation.go('editor');
  navigation.go('editor');
  assert.deepEqual(page.entries, ['#world', '#words', '#editor']);
  page.back(); navigation.restore();
  assert.equal(rendered.at(-1), 'words');
  page.back(); navigation.restore();
  assert.equal(rendered.at(-1), 'world');
  page.forward(); navigation.restore();
  assert.equal(rendered.at(-1), 'words');
  assert.deepEqual(page.entries, ['#world', '#words', '#editor']);
});

test('an invalid or empty route is normalized without adding a history entry', () => {
  for (const hash of ['', '#missing', '#main']) {
    const page = browser(hash), rendered = [];
    const navigation = createViewNavigation({ ...page, render: view => rendered.push(view) });
    navigation.restore();
    assert.equal(page.location.hash, '#world');
    assert.deepEqual(page.entries, ['#world']);
    assert.deepEqual(rendered, ['world']);
  }
});

test('failed editor navigation can replace its entry with the fallback', () => {
  const page = browser(), navigation = createViewNavigation({ ...page, render() {} });
  navigation.go('editor');
  navigation.go('world', { replace: true });
  assert.deepEqual(page.entries, ['#world', '#world']);
  assert.equal(page.location.hash, '#world');
});

test('sound validation identifies the field and keeps the original language unchanged', () => {
  const language = createLanguage(), original = structuredClone(language);
  const emptyVowels = validateRulesEdit(language, { sounds: { ...language.sounds, vowels: [] } });
  assert.equal(emptyVowels.language, null);
  assert.match(emptyVowels.errors.vowels, /vowel/i);
  const badConsonants = validateRulesEdit(language, { sounds: { ...language.sounds, consonants: ['m', '2'] } });
  assert.match(badConsonants.errors.consonants, /letters/i);
  const noPatterns = validateRulesEdit(language, { sounds: { ...language.sounds, patterns: [] } });
  assert.match(noPatterns.errors.patterns, /patterns/i);
  const reversed = validateRulesEdit(language, { sounds: { ...language.sounds, minSyllables: 3, maxSyllables: 1 } });
  assert.match(reversed.errors['max-syllables'], /minimum/i);
  assert.match(validateRulesEdit(language, { seed: '' }).errors['language-seed'], /empty/i);
  assert.deepEqual(language, original);
});

test('valid correction clears field errors and normalizes values with the existing validator', () => {
  const language = createLanguage();
  const result = validateRulesEdit(language, { sounds: { ...language.sounds, vowels: ['a', 'a'] }, seed: ' corrected ' });
  assert.deepEqual(result.errors, {});
  assert.deepEqual(result.language.sounds.vowels, ['a']);
  assert.equal(result.language.seed, 'corrected');
  assert.equal(language.seed, 'luma');
});

test('grammar errors stay attached to the edited control and custom markers remain permitted', () => {
  const language = createLanguage();
  const bad = validateRulesEdit(language, { grammar: { ...language.grammar, plural: 'x\u0000' } }, 'grammar-plural');
  assert.match(bad.errors['grammar-plural'], /control/i);
  assert.equal(bad.language, null);
  const custom = validateRulesEdit(language, { grammar: { ...language.grammar, plural: 'xyz' } }, 'grammar-plural');
  assert.equal(custom.language.grammar.plural, 'xyz');
  assert.deepEqual(custom.errors, {});
});

test('only untouched built-in starters receive the example cue', () => {
  for (const language of createStarterLanguages()) {
    assert.equal(starterExampleName(language), language.name);
    const renamed = structuredClone(language); renamed.name += ' changed';
    assert.equal(starterExampleName(renamed), '');
    const edited = structuredClone(language); edited.words[0].word += 'a'; edited.words[0].locked = true;
    assert.equal(starterExampleName(edited), '');
    const imported = structuredClone(language); imported.id = 'imported-copy';
    assert.equal(starterExampleName(imported), '');
    const reordered = structuredClone(language); reordered.revision++;
    assert.equal(starterExampleName(reordered), '');
  }
  assert.equal(starterExampleName(createLanguage({ name: 'Luma', seed: 'custom' })), '');
});
