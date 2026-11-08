import test from 'node:test';
import assert from 'node:assert/strict';
import { createLanguage } from '../src/engine.js';
import { getSceneEpisode, resolveSceneChoice } from '../src/scenes.js';
import { getSceneLineWords, renderSceneLine } from '../src/scene-language.js';

const conversations = [
  ['busstop', 'introductions', 1],
  ['library', 'lost-property', 0],
  ['cafe', 'cold-tea', 1],
  ['bakery', 'substitution', 1],
  ['market', 'bargaining', 1],
  ['rooftop', 'uncertainty', 1],
];

test('each interactive conversation offers two complete, distinct endings without changing its opening', () => {
  for (const [location, episodeId, afterLine] of conversations) {
    const scene = getSceneEpisode(location, episodeId);
    const before = structuredClone(scene);
    assert.equal(scene.choice.afterLine, afterLine);
    assert.equal(scene.choice.options.length, 2);
    assert.equal(new Set(scene.choice.options.map(option => option.id)).size, 2);
    assert.equal(new Set(scene.choice.options.map(option => option.lines.at(-1).english)).size, 2);
    for (const option of scene.choice.options) {
      const resolved = resolveSceneChoice(scene, option.id);
      assert.equal(resolved.choiceId, option.id);
      assert.equal(resolved.lines.length, 4, 'Existing animation cues retain four dialogue beats');
      assert.deepEqual(resolved.lines.slice(0, afterLine + 1), scene.lines.slice(0, afterLine + 1));
      assert.deepEqual(resolved.lines.slice(afterLine + 1), option.lines);
      assert.equal(option.lines[0].speaker, scene.lines[afterLine + 1].speaker);
      assert.deepEqual(resolved.animation, scene.animation);
      assert.deepEqual(new Set(resolved.words), new Set(resolved.lines.flatMap(getSceneLineWords)));
    }
    assert.deepEqual(scene, before, 'Selecting a reply must not alter shared conversation definitions');
  }
});

test('reply words and endings use existing vocabulary under every word order', () => {
  const language = createLanguage({ name: 'Choice test', seed: 'replies' });
  const dictionary = new Set(language.words.map(word => word.english));
  for (const [location, episodeId] of conversations) {
    const scene = getSceneEpisode(location, episodeId);
    for (const option of scene.choice.options) {
      for (const line of option.lines) {
        assert.deepEqual(line.keys, line.english.toLowerCase().match(/[a-z]+/g));
        for (const word of getSceneLineWords(line)) {
          assert.ok(dictionary.has(word), `Missing reply vocabulary: ${word}`);
          assert.ok(scene.words.includes(word), `Context editor hides ${word}`);
        }
        for (const order of ['SVO', 'SOV', 'VSO', 'VOS', 'OSV', 'OVS']) {
          language.grammar.order = order;
          assert.deepEqual(renderSceneLine(line, language).unknown, []);
        }
      }
    }
  }
});

test('reply rendering follows dictionary edits and the selected grammar', () => {
  const language = createLanguage({ seed: 'reply-grammar' });
  for (const word of language.words) word.word = word.english.toUpperCase().replaceAll(' ', '_');
  language.words.find(word => word.english === 'tea').word = 'CUSTOM_TEA';
  language.grammar = { ...language.grammar, order: 'SOV', adjective: 'after', past: 'PAST' };
  const scene = getSceneEpisode('cafe', 'cold-tea');
  const line = resolveSceneChoice(scene, scene.choice.options[0].id).lines[2];
  assert.equal(renderSceneLine(line, language).text, 'I FOR CUSTOM_TEA COLD PAST ASK.');
});

test('missing or invalid choices leave conversation definitions untouched', () => {
  const interactive = getSceneEpisode('cafe', 'cold-tea');
  const ordinary = getSceneEpisode('bakery');
  assert.equal(resolveSceneChoice(interactive), interactive);
  assert.equal(resolveSceneChoice(interactive, 'not-a-reply'), interactive);
  assert.equal(resolveSceneChoice(ordinary, 'anything'), ordinary);
});
