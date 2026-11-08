import { CHARACTERS, SCENES } from './scenes.js';
import { renderRoom, propSVG } from './scene-player.js';
import { SCENE_PROPS, sampleSceneProject } from './scene-project.js';

export const SCENE_CANVAS_WIDTH = 768;
export const SCENE_CANVAS_HEIGHT = 720;
const LOGICAL_WIDTH = 384, LOGICAL_HEIGHT = 360;

/** Wrap long words as well as ordinary text without splitting surrogate pairs. */
export function wrapCaptionText(context, text, width) {
  const lines = [];
  for (const paragraph of String(text).split(/\r?\n/u)) {
    let line = '';
    for (const word of paragraph.match(/\S+\s*|\s+/gu) ?? ['']) {
      if (line && context.measureText(line + word).width > width) { lines.push(line.trimEnd()); line = ''; }
      for (const character of Array.from(word)) {
        if (line && context.measureText(line + character).width > width) { lines.push(line.trimEnd()); line = ''; }
        if (line || !/\s/u.test(character)) line += character;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('A local scene image could not be loaded. Reload the studio and try again.'));
    image.src = source;
  });
}

async function svgImage(markup, width = 384, height = 216) {
  if (!markup) return null;
  const svg = markup.replace(/<svg\b/u, `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" shape-rendering="crispEdges"`);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try { return await loadImage(url); } finally { URL.revokeObjectURL(url); }
}

let assetPromise;
function preloadAssets() {
  if (!assetPromise) assetPromise = (async () => {
    const [roomEntries, atlasEntries, propEntries] = await Promise.all([
      Promise.all(SCENES.map(async scene => {
        const room = renderRoom(scene.id);
        const [background, foreground, ambient] = await Promise.all([svgImage(room.background), svgImage(room.foreground), svgImage(room.ambient)]);
        return [scene.id, { background, foreground, ambient }];
      })),
      Promise.all([...new Set(CHARACTERS.map(character => character.atlas))].map(async atlas => [atlas, await loadImage(new URL(atlas, document.baseURI).href)])),
      Promise.all(SCENE_PROPS.filter(type => type !== 'none').map(async type => [type, await svgImage(propSVG(type), 66, type === 'umbrella' ? 76 : 40)])),
    ]);
    if (document.fonts?.load) await document.fonts.load('16px VT323');
    if (document.fonts?.ready) await document.fonts.ready;
    return { rooms: new Map(roomEntries), atlases: new Map(atlasEntries), props: new Map(propEntries) };
  })().catch(error => { assetPromise = null; throw error; });
  return assetPromise;
}

function fitCaption(context, text, width, height, maxSize, family) {
  for (let size = maxSize; size >= 7; size--) {
    context.font = `${size}px ${family}`;
    const lines = wrapCaptionText(context, text, width), lineHeight = Math.ceil(size * 1.15);
    if (lines.length * lineHeight <= height || size === 7) return { size, lines, lineHeight, capacity: Math.max(1, Math.floor(height / lineHeight)) };
  }
}

function drawCaption(context, fullText, visibleText, { x, y, width, height, color, maxSize = 16, family = 'VT323, monospace', direction = 'ltr', progress, cache }) {
  if (!fullText) return;
  const key = JSON.stringify([fullText, width, height, maxSize, family]);
  let layout = cache?.get(key);
  if (!layout) {
    layout = fitCaption(context, fullText, width, height, maxSize, family);
    if (cache) { if (cache.size >= 96) cache.clear(); cache.set(key, layout); }
  }
  context.font = `${layout.size}px ${family}`;
  // If an unusually long custom alphabet needs several pages, follow the reveal.
  // Earlier lines remain readable before the next page replaces them.
  const visible = wrapCaptionText(context, visibleText, width);
  const pageCount = Math.ceil(layout.lines.length / layout.capacity);
  const page = progress === undefined ? Math.max(0, Math.ceil(visible.length / layout.capacity) - 1)
    : Math.min(pageCount - 1, Math.floor(Math.max(0, progress) * pageCount));
  const lines = visible.slice(page * layout.capacity, (page + 1) * layout.capacity);
  context.fillStyle = color;
  context.textAlign = direction === 'rtl' ? 'right' : 'left';
  context.direction = direction;
  context.textBaseline = 'top';
  lines.forEach((line, index) => context.fillText(line, direction === 'rtl' ? x + width : x, y + index * layout.lineHeight));
}

/** Assets and the caption font finish loading before playback or recording begins. */
export async function createSceneRenderer(canvas) {
  if (!canvas || typeof canvas.getContext !== 'function') throw new Error('Scene preview requires a canvas.');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas drawing is unavailable in this browser.');
  canvas.width = SCENE_CANVAS_WIDTH; canvas.height = SCENE_CANVAS_HEIGHT;
  const assets = await preloadAssets();
  const captionCache = new Map();
  let destroyed = false;
  const paintProp = prop => {
    if (!prop.opacity || prop.type === 'none') return;
    context.save(); context.globalAlpha = prop.opacity;
    context.drawImage(assets.props.get(prop.type), prop.x, prop.y, prop.width, prop.height);
    context.restore();
  };
  const paintActor = actor => {
    const character = CHARACTERS.find(character => character.id === actor.id);
    const atlas = assets.atlases.get(character.atlas), cellWidth = atlas.width / 4, cellHeight = atlas.height / 2;
    context.save(); context.translate(actor.x + (actor.flip ? 64 : 0), actor.y); context.scale(actor.flip ? -1 : 1, 1);
    context.drawImage(atlas, actor.pose * cellWidth, character.row * cellHeight, cellWidth, cellHeight, 0, 0, 64, 64);
    context.restore();
  };
  const draw = (compiled, time, options = {}) => {
    if (destroyed) throw new Error('This scene renderer has been closed.');
    const frame = sampleSceneProject(compiled, time, options), room = assets.rooms.get(compiled.project.room);
    context.setTransform(canvas.width / LOGICAL_WIDTH, 0, 0, canvas.height / LOGICAL_HEIGHT, 0, 0);
    context.imageSmoothingEnabled = false;
    context.fillStyle = '#08080b'; context.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    context.drawImage(room.background, 0, 0, 384, 216);
    if (frame.prop.mode !== 'counter') paintProp(frame.prop);
    paintActor(frame.actors[1]);
    if (room.foreground) context.drawImage(room.foreground, 0, 0, 384, 216);
    if (frame.prop.mode === 'counter') paintProp(frame.prop);
    paintActor(frame.actors[0]);
    if (room.ambient) context.drawImage(room.ambient, 0, 0, 384, 216);
    context.strokeStyle = '#d6d0dd'; context.lineWidth = 2; context.strokeRect(13, 223, 358, 124);
    const speaker = CHARACTERS.find(character => character.id === frame.speakerId);
    context.textAlign = 'left'; context.direction = 'ltr'; context.textBaseline = 'top'; context.font = '12px VT323, monospace'; context.fillStyle = speaker.color;
    context.fillText(speaker.name.toUpperCase(), 24, 232);
    const beat = compiled.beats[frame.beatIndex];
    const readingProgress = Math.min(1, (frame.time - beat.start) / Math.max(1, beat.end - beat.start - beat.pauseMs));
    if (frame.captions === 'both') {
      drawCaption(context, frame.text, frame.visibleText, { x: 24, y: 250, width: 336, height: 47, color: '#eee9e5', maxSize: 19, direction: frame.direction, cache: captionCache });
      drawCaption(context, frame.english, frame.english, { x: 24, y: 302, width: 336, height: 36, color: '#b5aabd', maxSize: 10, family: 'monospace', progress: readingProgress, cache: captionCache });
    } else if (frame.captions === 'language') {
      drawCaption(context, frame.text, frame.visibleText, { x: 24, y: 252, width: 336, height: 84, color: '#eee9e5', maxSize: 21, direction: frame.direction, cache: captionCache });
    } else {
      drawCaption(context, frame.english, frame.english, { x: 24, y: 252, width: 336, height: 84, color: '#eee9e5', maxSize: 17, family: 'monospace', progress: readingProgress, cache: captionCache });
    }
    context.fillStyle = '#282130'; context.fillRect(13, 353, 358, 2);
    context.fillStyle = '#9f8ab8'; context.fillRect(13, 353, 358 * frame.progress, 2);
    return frame;
  };
  return { draw, destroy() { destroyed = true; captionCache.clear(); } };
}
