import test from 'node:test';
import assert from 'node:assert/strict';
const rendering = await import('../src/character-face-renderer.js').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const face = { atlas: 'assets/expressions.png', atlasSize: [320, 128], sourceRect: [70, 8, 20, 16], targetRect: [25, 12, 20, 16], clip: [[25, 12], [45, 12], [42, 28], [27, 28]] };

test('canvas crops the requested expression into the clipped face without changing actor transforms', () => {
  assert.equal(typeof rendering.paintFace, 'function');
  const calls = [], context = Object.fromEntries(['save','restore','beginPath','moveTo','lineTo','closePath','clip','drawImage'].map(name => [name, (...args) => calls.push([name, ...args])]));
  const image = { width: 1600, height: 640 };
  rendering.paintFace(context, image, face);
  assert.deepEqual(calls, [
    ['save'], ['beginPath'], ['moveTo',25,12], ['lineTo',45,12], ['lineTo',42,28], ['lineTo',27,28], ['closePath'], ['clip'],
    ['drawImage',image,350,40,100,80,25,12,20,16], ['restore'],
  ]);
});

test('DOM face markup uses the same crop, destination and outline as canvas', () => {
  assert.equal(typeof rendering.faceMarkup, 'function');
  const markup = rendering.faceMarkup(face, 'face-0', 'http://localhost:58117/');
  assert.match(markup, /viewBox="0 0 64 64"/);
  assert.match(markup, /points="25,12 45,12 42,28 27,28"/);
  assert.match(markup, /clip-path="url\(#face-0\)"/);
  assert.match(markup, /x="25" y="12" width="20" height="16" viewBox="70 8 20 16"/);
  assert.match(markup, /width="320" height="128"/);
  assert.match(markup, /href="http:\/\/localhost:58117\/assets\/expressions.png"/);
});

test('neutral faces leave the original sprite untouched in both renderers', () => {
  assert.equal(typeof rendering.faceMarkup, 'function');
  assert.equal(rendering.faceMarkup(null, 'face-0', 'http://localhost/'), '');
  const calls = [];
  rendering.paintFace({ save: () => calls.push('save') }, null, null);
  assert.deepEqual(calls, []);
});
