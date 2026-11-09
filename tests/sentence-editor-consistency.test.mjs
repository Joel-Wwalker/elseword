import test from 'node:test';
import assert from 'node:assert/strict';
import { createLanguage, composeSentence, translateText, validateLanguage } from '../src/engine.js';
import * as grammar from '../src/sentence-grammar.js';
import { ensureSceneVocabulary } from '../src/scene-language.js';
import { translateSentence } from '../src/sentence-translator.js';
import { createSceneProject, compileSceneProject } from '../src/scene-project.js';
import * as scenes from '../src/scene-project.js';
import { convertSceneBeat, parseSceneImport, serializeSceneProject } from '../src/scene-maker.js';
import { createVideoExporter } from '../src/scene-video.js';

function language() {
  const result = ensureSceneVocabulary(createLanguage({ seed: 'editor-consistency' }));
  for (const word of result.words) word.word = word.english.replaceAll(' ', '-');
  return result;
}

test('shared sentence choices omit inflected verbs and adjective objects without removing pronouns', () => {
  assert.equal(typeof grammar.sentenceChoices, 'function');
  const choices = grammar.sentenceChoices(language());
  assert.ok(choices.verb.some(word => word.english === 'ask'));
  assert.ok(!choices.verb.some(word => word.english === 'asked'));
  assert.ok(!choices.verb.some(word => word.english === 'is'));
  assert.ok(choices.object.some(word => word.english === 'you'));
  assert.ok(!choices.object.some(word => word.english === 'big'));
  assert.ok(choices.adjective.some(word => word.english === 'big'));
});

test('builder rejects wrong word types and missing references rather than inventing noun phrases', () => {
  const lang = language();
  for (const options of [
    { subject: 'he', verb: 'see', object: 'big' },
    { subject: 'big', verb: 'see', object: 'moon' },
    { subject: 'he', verb: 'moon', object: 'book' },
    { subject: 'he', verb: 'see', object: 'moon', adjective: 'book' },
    { subject: 'he', verb: 'see', object: 'missing-word-id' },
    { subject: 'he', verb: 'see', object: 'you', adjective: 'big' },
  ]) {
    const result = composeSentence(options, lang);
    assert.ok(result.error, JSON.stringify(options));
    assert.equal(result.text, '');
  }
  assert.equal(composeSentence({ subject: 'he', verb: 'be', adjective: 'big' }, lang).english, 'He is big.');
  assert.equal(composeSentence({ subject: 'he', verb: 'see', object: 'you' }, lang).english, 'He sees you.');
});

test('English object pronouns use object case while conlang roots and subjects stay unchanged', () => {
  const lang = language();
  for (const [object, english] of [
    ['i', 'You see me.'], ['he', 'You see him.'], ['she', 'You see her.'],
    ['we', 'You see us.'], ['they', 'You see them.'], ['you', 'You see you.'], ['it', 'You see it.'],
  ]) {
    const built = composeSentence({ subject: 'you', verb: 'see', object }, lang);
    assert.equal(built.english, english);
    assert.equal(built.text, `you see ${object}.`);
    const translated = translateSentence(lang, english);
    assert.equal(translated.supported, true, translated.warnings.join(' '));
    assert.equal(translated.text, built.text);
    assert.deepEqual(translated.addedWords, []);
  }
  for (const [subject, english] of [
    ['i', 'I see you.'], ['he', 'He sees you.'], ['she', 'She sees you.'],
    ['we', 'We see you.'], ['they', 'They see you.'],
  ]) assert.equal(composeSentence({ subject, verb: 'see', object: 'you' }, lang).english, english);
});

test('custom dictionary pronouns round-trip through builder captions and the translator', () => {
  const lang = language();
  lang.words.push({ id: 'custom-xe', english: 'xe', word: 'custom-pronoun', pos: 'pronoun', category: 'Custom', notes: '', locked: true });
  lang.words.push({ id: 'custom-constructor', english: 'constructor', word: 'another-pronoun', pos: 'pronoun', category: 'Custom', notes: '', locked: true });
  for (const [options, english, text] of [
    [{ subject: 'xe', verb: 'see', object: 'you' }, 'Xe sees you.', 'custom-pronoun see you.'],
    [{ subject: 'i', verb: 'see', object: 'xe' }, 'I see xe.', 'i see custom-pronoun.'],
    [{ subject: 'i', verb: 'see', object: 'constructor' }, 'I see constructor.', 'i see another-pronoun.'],
  ]) {
    assert.equal(composeSentence(options, lang).english, english);
    const translated = translateSentence(lang, english);
    assert.equal(translated.supported, true, translated.warnings.join(' '));
    assert.equal(translated.text, text);
    assert.deepEqual(translated.language, validateLanguage(lang));
  }
});

test('sparse builder scenes retain diagnostics for required normalized verbs and inserted articles', () => {
  for (const [missing, options] of [
    ['be', { subject: 'i', verb: 'is', adjective: 'big' }],
    ['a', { subject: 'i', verb: 'see', object: 'moon' }],
    ['the', { subject: 'cat', verb: 'sleep' }],
  ]) {
    const lang = language();
    lang.words = lang.words.filter(word => word.english !== missing);
    for (const word of lang.words) delete word.family;
    const scene = createSceneProject(lang);
    scene.beats[0].options = options;
    const restored = parseSceneImport(serializeSceneProject(scene), `sparse-${missing}`);
    const compiled = compileSceneProject(restored);
    assert.ok(compiled.beats[0].error.includes(`“${missing}”`), missing);
    assert.equal(compiled.beats[0].text, '');
    assert.throws(() => scenes.assertScenePlayable(compiled), /Line 1/);
    assert.throws(() => convertSceneBeat(restored, restored.beats[0].id, 'literal'), /Line 1/);
    assert.deepEqual(restored.language.words, validateLanguage(lang).words);
  }
});

test('a normalized verb with the wrong dictionary role is reported instead of played', () => {
  const lang = language();
  for (const word of lang.words) delete word.family;
  lang.words.find(word => word.english === 'be').pos = 'noun';
  const result = composeSentence({ subject: 'i', verb: 'is', adjective: 'big' }, lang);
  assert.match(result.error, /be.*verb/i);
  assert.equal(result.text, '');
});

test('invalid builder drafts retain their diagnostic and selections through scene files', () => {
  const scene = createSceneProject(language());
  scene.beats[0].options = { subject: 'i', verb: 'go', object: 'moon' };
  const restored = parseSceneImport(serializeSceneProject(scene), 'restored');
  const compiled = compileSceneProject(restored);
  assert.match(compiled.beats[0].error, /object/i);
  assert.equal(compiled.errors[0].beatId, scene.beats[0].id);
  assert.equal(restored.beats[0].options.object, 'moon');
  assert.equal(compiled.beats[0].quiet, false);
  assert.equal(typeof scenes.assertScenePlayable, 'function');
  assert.throws(() => scenes.assertScenePlayable(compiled), /Line 1.*object/i);
});

test('a missing imported selection stays editable instead of discarding the scene', () => {
  const scene = createSceneProject(language());
  scene.beats[0].options.object = 'Removed-Word-ID';
  const restored = parseSceneImport(JSON.stringify(scene), 'restored');
  assert.equal(restored.beats[0].options.object, 'Removed-Word-ID');
  assert.match(compileSceneProject(restored).beats[0].error, /missing|no longer|dictionary/i);
});

test('invalid builder lines cannot be frozen into empty custom dialogue', () => {
  const scene = createSceneProject(language());
  scene.beats[0].options.verb = 'go';
  const before = structuredClone(scene);
  assert.throws(() => convertSceneBeat(scene, scene.beats[0].id, 'literal'), /Line 1.*object/i);
  assert.deepEqual(scene, before);
});

test('video export rejects invalid dialogue before opening browser capture resources', async () => {
  const scene = createSceneProject(language());
  scene.beats[0].options.verb = 'go';
  await assert.rejects(createVideoExporter({})(scene), /Line 1.*object/i);
});

test('intentional literal pauses remain valid and playable', () => {
  const scene = createSceneProject(language());
  scene.beats[0] = { ...scene.beats[0], mode: 'literal', text: '', english: '', pauseMs: 1500 };
  const compiled = compileSceneProject(scene);
  assert.deepEqual(compiled.errors, []);
  assert.equal(compiled.beats[0].quiet, true);
  assert.equal(compiled.duration, 1500);
  assert.equal(typeof scenes.assertScenePlayable, 'function');
  assert.doesNotThrow(() => scenes.assertScenePlayable(compiled));
});

test('plural-object control applies only to noun objects, including unchanged English plurals', () => {
  assert.equal(typeof grammar.canPluralizeObject, 'function');
  const lang = language();
  for (const object of ['', 'you', 'big', 'missing']) assert.equal(grammar.canPluralizeObject({ object }, lang), false, object);
  for (const object of ['book', 'fish']) assert.equal(grammar.canPluralizeObject({ object }, lang), true, object);
  const book = lang.words.find(word => word.english === 'book');
  assert.equal(grammar.canPluralizeObject({ object: book.id }, lang), true);
  assert.equal(composeSentence({ subject: 'cat', verb: 'sleep', plural: true }, lang).english, 'The cat sleeps.');
});

test('English articles follow the first spoken word in hour and adjective phrases', () => {
  const lang = language();
  for (const [object, adjective, expected] of [
    ['hour', '', 'I want an hour.'], ['hour', 'big', 'I want a big hour.'],
    ['book', 'old', 'I want an old book.'],
  ]) assert.equal(composeSentence({ subject: 'i', verb: 'want', object, adjective }, lang).english, expected);
});

test('word lookup uses the sentence article for an without overwriting a saved entry', () => {
  const lang = language();
  lang.words.find(word => word.english === 'an').word = 'kept-an';
  lang.words.find(word => word.english === 'an').locked = true;
  const before = structuredClone(lang);
  const result = translateText('An hour, a book.', lang);
  assert.equal(result.text, 'a hour, a book.');
  assert.equal(result.tokens[0].source, 'An');
  assert.equal(result.tokens[0].wordId, lang.words.find(word => word.english === 'a').id);
  assert.deepEqual(lang, before);
});

test('standalone replies use known words without creating a noun or changing the dictionary', () => {
  const lang = language();
  for (const expression of ['yes', 'no', 'please', 'maybe']) {
    const result = translateSentence(lang, `${expression}!`);
    assert.equal(result.supported, true, expression);
    assert.equal(result.text, `${expression}!`);
    assert.deepEqual(result.addedWords, []);
    assert.deepEqual(result.language, validateLanguage(lang));
  }
});

test('unsupported known words are explained as grammar limits without adding or reclassifying them', () => {
  const lang = language();
  for (const input of ['one', 'two', 'your', 'another', 'I want one bread']) {
    const result = translateSentence(lang, input);
    assert.equal(result.supported, false);
    assert.match(result.warnings.join(' '), /support|cannot use|not yet/i);
    assert.doesNotMatch(result.warnings.join(' '), /not a noun|add.+dictionary/i);
    assert.deepEqual(result.language, validateLanguage(lang));
  }
});
