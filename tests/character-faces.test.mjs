import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHARACTER_FACE_ATLASES, resolveCharacterFace } from '../src/character-faces.js';
import { CHARACTERS } from '../src/scenes.js';

const moods = ['curious', 'annoyed', 'pleased', 'worried', 'startled'];

test('every resident and pose has a bounded face patch in the matching expression cell', () => {
  assert.equal(CHARACTER_FACE_ATLASES.length, 4);
  for (const [index, character] of CHARACTERS.entries()) {
    const row = index % 2;
    for (let pose = 0; pose < 4; pose++) for (const [column, mood] of moods.entries()) {
      const face = resolveCharacterFace(character.id, pose, mood);
      const context = `${character.id} pose ${pose} ${mood}`;
      assert.ok(face, context);
      assert.equal(face.atlas, CHARACTER_FACE_ATLASES[Math.floor(index / 2)], context);
      assert.match(face.fill, /^#[0-9a-f]{6}$/i, context);
      const [atlasWidth, atlasHeight] = face.atlasSize;
      const [sx, sy, sw, sh] = face.sourceRect;
      assert.ok(face.sourceRect.every(Number.isFinite), context);
      assert.ok(sw > 0 && sh > 0, context);
      assert.ok(sx >= column * atlasWidth / 5 && sx + sw <= (column + 1) * atlasWidth / 5, context);
      assert.ok(sy >= row * atlasHeight / 2 && sy + sh <= (row + 1) * atlasHeight / 2, context);
      const [x, y, width, height] = face.targetRect;
      assert.ok(face.targetRect.every(Number.isFinite), context);
      assert.ok(x >= 0 && x + width <= 64 && y >= 0 && y + height <= 27, `${context}: head only`);
      assert.ok(width > 0 && height > 0, context);
      assert.ok(face.clip.length >= 3, context);
      for (const [px, py] of face.clip) {
        assert.ok(Number.isFinite(px) && Number.isFinite(py), context);
        assert.ok(px >= x && px <= x + width && py >= y && py <= y + height, context);
      }
    }
  }
});

test('face atlas dimensions match the PNG assets used by both renderers', () => {
  for (const atlas of CHARACTER_FACE_ATLASES) {
    const bytes = readFileSync(new URL(`../src/${atlas}`, import.meta.url));
    assert.equal(bytes.toString('ascii', 1, 4), 'PNG');
    assert.equal(bytes.readUInt32BE(16), 1774);
    assert.equal(bytes.readUInt32BE(20), 887);
    assert.equal(bytes[25], 6, 'RGBA PNG retains transparent surroundings');
  }
});

test('neutral and unknown faces leave the original artwork untouched', () => {
  for (const character of CHARACTERS) for (let pose = 0; pose < 4; pose++) {
    assert.equal(resolveCharacterFace(character.id, pose, 'neutral'), null);
  }
  for (const id of ['unknown', 'constructor', '__proto__', undefined]) {
    assert.equal(resolveCharacterFace(id, 0, 'curious'), null);
  }
  for (const pose of [-1, 4, .5, '0', undefined, NaN]) {
    assert.equal(resolveCharacterFace('moss', pose, 'curious'), null);
  }
  assert.equal(resolveCharacterFace('moss', 0, 'unknown'), null);
});

test('seeking and caller mutation cannot change a later facial descriptor', () => {
  const expected = resolveCharacterFace('moss', 2, 'worried');
  const mutated = resolveCharacterFace('moss', 2, 'worried');
  mutated.targetRect[0] = -1;
  mutated.sourceRect[0] = -1;
  mutated.atlasSize[0] = -1;
  mutated.clip[0][0] = -1;
  resolveCharacterFace('hush', 3, 'startled');
  resolveCharacterFace('moss', 0, 'neutral');
  assert.deepEqual(resolveCharacterFace('moss', 2, 'worried'), expected);
});
