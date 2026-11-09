import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createLanguage, generateWord, validateLanguage } from '../src/engine.js';
import * as scenes from '../src/scenes.js';

let sceneLanguage;
try { sceneLanguage = await import('../src/scene-language.js'); }
catch (error) { sceneLanguage = { loadError: error.message }; }

function api() {
  assert.equal(typeof sceneLanguage.renderSceneLine, 'function', sceneLanguage.loadError);
  assert.equal(typeof sceneLanguage.ensureSceneVocabulary, 'function');
  return sceneLanguage;
}

function literalLanguage() {
  const language = createLanguage({ seed: 'grammar-episodes' });
  language.words = language.words.map(entry => ({ ...entry, word: entry.english.replaceAll(' ', '-') }));
  language.grammar = { order: 'SVO', adjective: 'before', plural: '-PL', past: 'PAST', future: 'FUT', negative: 'NEG', question: 'Q' };
  return language;
}

function episodeLine(sceneId, episodeId, index) {
  assert.equal(typeof scenes.getSceneEpisode, 'function');
  return scenes.getSceneEpisode(sceneId, episodeId).lines[index];
}

test('sixteen conversations resolve within eight unchanged room identities', () => {
  assert.equal(typeof scenes.getSceneEpisodes, 'function');
  assert.equal(scenes.SCENES.length, 8);
  assert.equal(scenes.SCENES.reduce((total, scene) => total + scenes.getSceneEpisodes(scene.id).length, 0), 16);
  for (const [sceneId, episodeId] of [
    ['busstop', 'introductions'], ['library', 'lost-property'], ['cafe', 'cold-tea'],
    ['bakery', 'substitution'], ['market', 'bargaining'], ['tickets', 'directions'],
    ['rooftop', 'uncertainty'], ['apothecary', 'instructions'],
  ]) {
    const episodes = scenes.getSceneEpisodes(sceneId);
    assert.deepEqual(episodes.map(episode => episode.id), ['original', episodeId]);
    const selected = scenes.getSceneEpisode(sceneId, episodeId);
    assert.equal(selected.id, sceneId);
    assert.equal(selected.episodeId, episodeId);
    assert.equal(selected.episodeIndex, 1);
    assert.equal(selected.episodeCount, 2);
    assert.ok(selected.title && selected.tag && selected.description && selected.animation.type);
    assert.equal(scenes.getSceneEpisode(sceneId, 'missing').episodeId, 'original');
  }
});

test('all authored conversations render from explicit syntax with exact English glosses', () => {
  const { renderSceneLine } = api();
  const language = literalLanguage();
  for (const scene of scenes.SCENES) {
    for (const episode of scenes.getSceneEpisodes(scene.id)) {
      assert.ok(episode.lines.length >= 4 && episode.lines.length <= 6);
      for (const line of [...episode.lines, ...(episode.choice?.options.flatMap(option => option.lines) ?? [])]) {
        assert.ok(Array.isArray(line.syntax) && line.syntax.length, `${scene.id}: ${line.english}`);
        const rendered = renderSceneLine(line, language);
        assert.equal(rendered.english, line.english);
        assert.deepEqual(rendered.unknown, [], `${scene.id}: ${line.english}`);
        assert.ok(rendered.text.length);
      }
    }
  }
});

test('new conversations keep their purposeful maker actions attached to actual dialogue beats', () => {
  const fixtures = [
    ['bakery', 'substitution', 1, 'pass', 'end'],
    ['market', 'bargaining', 2, 'gesture', 'start'],
    ['tickets', 'directions', 2, 'turn', 'start'],
    ['rooftop', 'uncertainty', 2, 'turn', 'end'],
    ['apothecary', 'instructions', 2, 'recoil', 'start'],
  ];
  for (const [room, episodeId, index, action, cue] of fixtures) {
    const scene = scenes.getSceneEpisode(room, episodeId);
    assert.equal(scene.episodeId, episodeId);
    assert.ok(scene.lines[index]);
    assert.equal(scene.makerActions[index].action, action);
    assert.equal(scene.makerActions[index].cue, cue);
    for (const option of scene.choice?.options ?? []) {
      const resolved = scenes.resolveSceneChoice(scene, option.id);
      assert.equal(resolved.lines.length, scene.lines.length);
      assert.ok(resolved.lines[index]);
      assert.deepEqual(resolved.makerActions, scene.makerActions);
    }
  }
});

test('all six orders rearrange authored subject, verb and object; modifiers follow nouns', () => {
  const { renderSceneLine } = api();
  const language = literalLanguage();
  const line = episodeLine('library', 'original', 0);
  const slots = { S: 'i', V: 'need', O: 'a quiet book' };
  for (const order of ['SVO', 'SOV', 'VSO', 'VOS', 'OSV', 'OVS']) {
    language.grammar.order = order;
    assert.equal(renderSceneLine(line, language).text, [...order].map(slot => slots[slot]).join(' ') + '.');
  }
  language.grammar.order = 'SOV';
  language.grammar.adjective = 'after';
  assert.equal(renderSceneLine(line, language).text, 'i a book quiet need.');
});

test('plural suffixes apply to subject and fragment nouns; tense and question markers are productive', () => {
  const { renderSceneLine } = api();
  const language = literalLanguage();
  assert.equal(renderSceneLine(episodeLine('library', 'original', 1), language).text, 'all book-PL be quiet.');
  assert.equal(renderSceneLine(episodeLine('market', 'original', 1), language).text, 'two coin-PL.');
  assert.equal(renderSceneLine(episodeLine('market', 'original', 4), language).text, 'i FUT take the leaf.');
  assert.equal(renderSceneLine(episodeLine('busstop', 'original', 2), language).text, 'you PAST say that before.');
  assert.equal(renderSceneLine(episodeLine('busstop', 'original', 0), language).text, 'the bus be late Q?');
  assert.equal(renderSceneLine(episodeLine('cafe', 'cold-tea', 2), language).text, 'i PAST ask for cold tea.');
  language.grammar.past = '';
  language.grammar.question = '';
  assert.equal(renderSceneLine(episodeLine('busstop', 'original', 0), language).text, 'the bus be late?');
  assert.equal(renderSceneLine(episodeLine('busstop', 'original', 2), language).text, 'you say that before.');
});

test('negation, nested clauses, fragments and independent sentences retain authored meanings', () => {
  const { renderSceneLine } = api();
  const language = literalLanguage();
  const negative = { english: 'I did not read the books.', syntax: [{ type: 'clause', subject: 'i', verb: 'read', object: { type: 'noun', head: 'book', determiner: 'the', plural: true }, tense: 'past', negative: true }] };
  language.grammar.order = 'SOV';
  assert.equal(renderSceneLine(negative, language).text, 'i the book-PL NEG PAST read.');
  assert.equal(renderSceneLine(episodeLine('rooftop', 'original', 4), language).text, 'i the moon real be hope.');
  assert.equal(renderSceneLine(episodeLine('bakery', 'original', 3), language).text, 'yes. the bag small be.');
  assert.equal(renderSceneLine(episodeLine('library', 'lost-property', 1), language).text, 'no. it my book NEG be.');
  assert.equal(renderSceneLine(episodeLine('library', 'lost-property', 3), language).text, 'a unfortunate coincidence.');
  assert.equal(renderSceneLine(episodeLine('busstop', 'introductions', 2), language).text, 'i pleased to you meet be.');
  assert.equal(renderSceneLine(episodeLine('busstop', 'introductions', 3), language).text, 'that should pass.');
});

test('scene context words edit actual lexical roots; missing roots stay visibly unknown', () => {
  const { renderSceneLine } = api();
  const language = literalLanguage();
  const episode = scenes.getSceneEpisode('library');
  assert.ok(episode.words.includes('be') && episode.words.includes('book'));
  assert.ok(!episode.words.includes('books') && !episode.words.includes('are'));
  language.words.find(word => word.english === 'book').word = 'CUSTOM';
  assert.match(renderSceneLine(episode.lines[1], language).text, /CUSTOM-PL/);
  language.words = language.words.filter(word => word.english !== 'book');
  const missing = renderSceneLine(episode.lines[1], language);
  assert.deepEqual(missing.unknown, ['book']);
  assert.match(missing.text, /⟦book⟧-PL/);
  assert.throws(() => renderSceneLine({ english: 'Unstructured prose.' }, language), /syntax/i);
});

test('version-2 roots and legacy linked plural output stay stable', () => {
  api();
  const language = createLanguage({ name: 'Luma', seed: 'episode-compat', preset: 'soft' });
  // Existing documents retain this marker; new languages choose one from their sounds.
  language.grammar.plural = 'en';
  const words = validateLanguage(language).words.slice(0, 220);
  assert.equal(createHash('sha256').update(JSON.stringify(words)).digest('hex'), 'bdef97aad563785edfb87b4a812684d0a3024943c6cb2a5d978e5efd0d1419e0');
});

test('supplementation preserves old edits, metadata, missing old words, and colliding IDs', () => {
  const { ensureSceneVocabulary } = api();
  const language = createLanguage({ seed: 'old-save' });
  const oldWords = language.words.slice(0, 220).filter(word => word.english !== 'bread');
  const edited = oldWords.find(word => word.english === 'hello');
  edited.word = 'edited-hello';
  edited.notes = 'Keep my spelling.';
  edited.locked = true;
  edited.customMetadata = { createdBy: 'user' };
  oldWords.push({ id: 'meet', english: 'custom meaning', word: 'zuzu', pos: 'noun', category: 'Personal', locked: true, notes: 'Keep ID.' });
  language.words = oldWords;
  language.extraMetadata = { local: true };
  const before = structuredClone(language);
  const next = ensureSceneVocabulary(language);
  assert.deepEqual(language, before, 'Input is not mutated');
  assert.deepEqual(next.words.slice(0, oldWords.length), oldWords);
  assert.deepEqual(next.extraMetadata, language.extraMetadata);
  assert.ok(!next.words.some(word => word.english === 'bread'), 'Only new release vocabulary is added');
  const addedMeet = next.words.find(word => word.english === 'meet');
  assert.ok(addedMeet && addedMeet.id !== 'meet');
  assert.equal(new Set(next.words.map(word => word.id)).size, next.words.length);
  const roots = next.words.filter(word => !word.family);
  assert.equal(new Set(roots.map(word => word.word)).size, roots.length);
  assert.deepEqual(ensureSceneVocabulary(next), next, 'Migration is idempotent');
  assert.doesNotThrow(() => validateLanguage(next));
});

test('supplementation preserves a release word edited under a different ID and normalized English key', () => {
  const { ensureSceneVocabulary } = api();
  const language = createLanguage();
  language.words = language.words.slice(0, 220);
  const existing = { id: 'user-meeting', english: '  MEET  ', word: 'custom-meet', locked: true, notes: 'Do not replace', pos: 'verb', category: 'Custom' };
  language.words.push(existing);
  const next = ensureSceneVocabulary(language);
  assert.deepEqual(next.words.find(word => word.id === 'user-meeting'), existing);
  assert.equal(next.words.filter(word => word.english.trim().toLowerCase() === 'meet').length, 1);
});

test('supplementation respects the 2000-word import bound even with partial capacity', () => {
  const { ensureSceneVocabulary } = api();
  const language = createLanguage();
  language.words = Array.from({ length: 1999 }, (_, index) => ({ id: `custom-${index}`, english: `custom ${index}`, word: `word-${index}`, pos: 'noun', category: 'Custom', locked: false, notes: '' }));
  const next = ensureSceneVocabulary(language);
  assert.equal(next.words.length, 2000);
  assert.deepEqual(next.words.slice(0, 1999), language.words);
  assert.doesNotThrow(() => validateLanguage(next));
  assert.deepEqual(ensureSceneVocabulary(next), next);
});

test('supplementation deterministically skips occupied generated words and repeated ID collisions', () => {
  const { ensureSceneVocabulary } = api();
  const language = createLanguage({ seed: 'occupied-form' });
  const firstGeneratedForm = generateWord(language, 'meet', '0:0');
  language.words = ['meet', 'scene-meet', 'scene-meet-2'].map((id, index) => ({
    id, english: `custom ${index}`, word: index ? `custom-form-${index}` : firstGeneratedForm,
    pos: 'noun', category: 'Custom', locked: true, notes: 'Keep exactly.',
  }));
  const next = ensureSceneVocabulary(language);
  const meeting = next.words.find(word => word.english === 'meet');
  assert.equal(meeting.id, 'scene-meet-3');
  assert.notEqual(meeting.word, firstGeneratedForm);
  assert.deepEqual(next.words.slice(0, 3), language.words);
  assert.equal(new Set(next.words.map(word => word.word)).size, next.words.length);
  assert.deepEqual(ensureSceneVocabulary(language), next);
  assert.doesNotThrow(() => validateLanguage(next));
});

test('supplementation keeps near-limit Unicode backups below the UTF-8 file import bound', () => {
  const { ensureSceneVocabulary } = api();
  const backupBytes = language => Buffer.byteLength(JSON.stringify(language, null, 2), 'utf8');
  for (const headroom of [50, 350]) {
    const source = createLanguage({ seed: 'unicode-boundary' });
    source.words = Array.from({ length: 700 }, (_, index) => ({
      id: `custom-${index}`, english: `custom ${index}`, word: `word-${index}`,
      pos: 'noun', category: 'Custom', locked: true, notes: '',
    }));
    let remaining = 1_000_000 - headroom - backupBytes(source);
    for (const entry of source.words) {
      const characters = Math.min(500, Math.floor(remaining / 3));
      entry.notes = '界'.repeat(characters);
      remaining -= characters * 3;
      if (remaining < 3 && characters < 500) {
        entry.notes += 'x'.repeat(remaining);
        remaining = 0;
      }
    }
    assert.equal(remaining, 0, 'Fixture uses valid notes to fill the byte budget');
    const language = validateLanguage(source);
    assert.equal(backupBytes(language), 1_000_000 - headroom);
    const before = structuredClone(language);
    const next = ensureSceneVocabulary(language);
    assert.ok(backupBytes(next) <= 1_000_000, `Backup grew beyond the file import bound with ${headroom} bytes available`);
    assert.deepEqual(language, before, 'Input is not mutated');
    assert.deepEqual(next.words.slice(0, language.words.length), language.words, 'Existing entries are never dropped or changed');
    if (headroom === 50) assert.equal(next.words.length, language.words.length, 'No addition fits');
    else assert.ok(next.words.length > language.words.length, 'Additions that fit are retained');
    assert.deepEqual(ensureSceneVocabulary(next), next, 'Capacity-limited supplementation is idempotent');
    assert.doesNotThrow(() => validateLanguage(JSON.stringify(next, null, 2)));
  }
});
