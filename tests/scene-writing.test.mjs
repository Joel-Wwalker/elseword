import test from 'node:test';
import assert from 'node:assert/strict';
import { createLanguage, renderWriting } from '../src/engine.js';
import { WRITING_PRESETS, applyWritingPreset } from '../src/writing-presets.js';
import { SCENES, getSceneEpisodes, getSceneEpisode, resolveSceneChoice } from '../src/scenes.js';
import { renderSceneLine } from '../src/scene-language.js';
import { buildDialogue } from '../src/scene-player.js';
import { compilePresetDialogue } from '../src/world-dialogue.js';

test('every room conversation and reply branch uses the same alphabet as World scenes', () => {
  const language = createLanguage({ seed: 'scene-writing' });
  const words = structuredClone(language.words);
  for (const preset of WRITING_PRESETS) {
    language.script = applyWritingPreset(language.script, preset.id);
    for (const location of SCENES) for (const episode of getSceneEpisodes(location.id)) {
      const scene = getSceneEpisode(location.id, episode.id);
      for (const branch of [scene, ...(scene.choice?.options ?? []).map(option => resolveSceneChoice(scene, option.id))]) {
        const room = buildDialogue(branch, language);
        const world = compilePresetDialogue(branch, language);
        room.forEach((line, index) => {
          const raw = renderSceneLine(branch.lines[index], language);
          assert.equal(line.text, renderWriting(raw.text, language), `${location.id}/${episode.id}/${preset.id}`);
          assert.equal(line.text, world[index].text);
          assert.deepEqual(line.tokens, world[index].tokens);
          assert.equal(line.english, raw.english);
          assert.deepEqual(line.unknown, raw.unknown);
        });
      }
    }
  }
  assert.deepEqual(language.words, words, 'Display conversion must not change saved spellings');
});

test('room glyphs retain dictionary ownership and give expanded text enough reading time', () => {
  const language = createLanguage({ seed: 'expanded-scene-writing' });
  for (const word of language.words) word.word = word.english;
  Object.assign(language.grammar, { order: 'SVO', question: 'Q' });
  language.words.find(word => word.english === 'the').word = 'e\u0301';
  language.words.find(word => word.english === 'bus').word = 'sh'.repeat(10);
  language.script = { style: 'custom', direction: 'rtl', glyphs: {
    'é': '𐀀', sh: 'אבאבאבאב', be: '○△', late: '☽', q: '◇',
  } };
  const line = buildDialogue(getSceneEpisode('busstop'), language)[0];
  assert.equal(line.text, `𐀀 ${'אב'.repeat(40)} ○△ ☽ ◇?`);
  assert.deepEqual(line.tokens.map(({ key, marker, start, end }) => [key ?? marker, start, end]), [
    ['the', 0, 1], ['bus', 2, 82], ['be', 83, 85], ['late', 86, 87], ['question', 88, 89],
  ]);
  for (const token of line.tokens) {
    assert.equal([...line.text].slice(token.start, token.end).join(''), token.text);
    if (token.kind === 'word') assert.equal(language.words.find(word => word.id === token.wordId).english, token.key);
  }
  assert.equal(line.duration, 90 * 43 + 1400);
  assert.equal(line.english, 'Is the bus late?');
});
