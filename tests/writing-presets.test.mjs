import test from 'node:test';
import assert from 'node:assert/strict';
import { createLanguage, renderWriting, validateLanguage } from '../src/engine.js';
import { serializePortableLanguage } from '../src/language-ui.js';
import { createSceneProject, compileSceneProject, validateSceneProject } from '../src/scene-project.js';
import { isAudibleCharacter } from '../src/text-audio.js';

const api = await import('../src/writing-presets.js').catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return {};
});
const tool = name => { assert.equal(typeof api[name], 'function', `${name} must be implemented`); return api[name]; };
const starter = () => createLanguage({ name: 'Luma', seed: 'writing-presets' });
const choose = (script, id) => tool('applyWritingPreset')(script, id);
const selected = script => tool('identifyWritingPreset')(script);

test('each new alphabet renders distinct symbols and survives an existing-format backup', () => {
  const outputs = new Set();
  for (const id of ['angular', 'geometric', 'dotted']) {
    const language = starter(), before = structuredClone(language);
    language.script = choose({ ...language.script, direction: 'rtl' }, id);
    assert.equal(language.script.style, 'custom');
    assert.equal(language.script.direction, 'rtl');
    const output = renderWriting('abcdefghijklmnopqrstuvwxyz', language);
    assert.equal([...output].length, 26);
    assert.equal(new Set(output).size, 26);
    assert.equal(/[a-z]/u.test(output), false);
    assert.ok(Array.from(output).every(isAudibleCharacter), 'symbols still trigger dialogue sounds');
    outputs.add(output);
    const restored = validateLanguage(serializePortableLanguage(language));
    assert.equal(selected(restored.script), id);
    assert.equal(renderWriting('aBc, 123!\nø🙂', restored), `${output[0]}${output[1]}${output[2]}, 123!\nø🙂`);
    assert.deepEqual(restored.words, before.words);
    assert.deepEqual(restored.grammar, before.grammar);
  }
  assert.equal(outputs.size, 3);
});

test('editing a preset makes it custom without changing other languages or the preset', () => {
  const first = choose(starter().script, 'geometric');
  const second = choose(starter().script, 'geometric');
  first.glyphs.a = 'sun';
  assert.equal(selected(first), 'custom');
  assert.equal(selected(second), 'geometric');
  assert.notEqual(second.glyphs.a, first.glyphs.a);
  const withDigraph = { ...second, glyphs: { ...second.glyphs, sh: 'moon' } };
  assert.equal(selected(withDigraph), 'custom');
  assert.equal(renderWriting('SHa', { script: withDigraph }), `moon${second.glyphs.a}`);
});

test('Latin temporarily hides edited symbols and My own symbols restores them', () => {
  const original = { style: 'custom', direction: 'rtl', glyphs: { sh: '☽', a: '△', b: '◇' } };
  const plain = choose(original, 'latin');
  assert.equal(selected(plain), 'latin');
  assert.equal(renderWriting('SHab!', { script: plain }), 'SHab!');
  assert.deepEqual(plain.glyphs, original.glyphs);
  const restored = choose(plain, 'custom');
  assert.equal(renderWriting('SHab!', { script: restored }), '☽△◇!');
  assert.deepEqual(restored, original);
  restored.glyphs.a = 'x';
  assert.equal(original.glyphs.a, '△');
});

test('changing presets clears old overrides while customizing runes preserves their appearance', () => {
  const edited = { style: 'custom', direction: 'ltr', glyphs: { a: 'custom', sh: 'override' } };
  const runes = choose(edited, 'runes');
  assert.equal(renderWriting('ab sh', { script: runes }), 'ᚨᛒ ᛋᚺ');
  const ownRunes = choose({ ...runes, glyphs: { a: '△' } }, 'custom');
  assert.equal(renderWriting('ab sh', { script: ownRunes }), '△ᛒ ᛋᚺ');
  assert.equal(selected(ownRunes), 'custom');
  const restoredRunes = choose(choose({ ...runes, glyphs: { a: '△' } }, 'latin'), 'custom');
  assert.equal(renderWriting('ab sh', { script: restoredRunes }), '△ᛒ ᛋᚺ');
  const angular = choose(edited, 'angular');
  assert.equal(Object.hasOwn(angular.glyphs, 'sh'), false);
  assert.equal(edited.glyphs.sh, 'override');
  assert.throws(() => choose(edited, 'missing'), /writing|alphabet|preset/i);
});

test('scene snapshots retain a chosen alphabet and render it independently from later edits', () => {
  const language = starter();
  language.script = choose(language.script, 'angular');
  const scene = createSceneProject(language);
  const before = compileSceneProject(scene).beats[0].text;
  assert.ok(before.length > 0);
  assert.equal(/[a-z]/iu.test(before), false);
  language.script = choose(language.script, 'latin');
  const restored = validateSceneProject(JSON.stringify(scene));
  assert.equal(selected(restored.language.script), 'angular');
  assert.equal(compileSceneProject(restored).beats[0].text, before);
});
