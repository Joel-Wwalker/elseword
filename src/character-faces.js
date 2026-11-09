/** Five independent facial states, painted over the original four body poses.
 * Source rectangles use global pixels in the 1774 × 887 expression sheets.
 * Target rectangles and clipping polygons use the original 64 × 64 sprite space.
 * Paint `fill` inside `clip` first: transparent image edges must not reveal old eyes.
 */
export const CHARACTER_FACE_ATLASES = Object.freeze([
  'assets/expression-moss-kiln.png',
  'assets/expression-vesper-slate.png',
  'assets/expression-rook-brine.png',
  'assets/expression-shard-hush.png',
]);

const MOODS = ['curious', 'annoyed', 'pleased', 'worried', 'startled'];
const ATLAS_SIZE = [1774, 887];
const CELL_WIDTH = ATLAS_SIZE[0] / MOODS.length;

// Polygons follow face interiors, leaving hair, fins, antlers and mask outlines
// in the original artwork. Each pose has its own head registration.
const FACES = {
  moss: {
    atlas: 0, source: [145, 208, 187, 174], fill: '#9a9b60',
    poses: [[30.5, 12.7, 14, 11.8], [30.5, 12.7, 14, 11.8], [30.8, 13.4, 14, 11.8], [29.3, 11.2, 14.5, 13]],
    shape: [[.09, 0], [.68, .02], [.98, .23], [.94, .72], [.73, 1], [.39, .98], [0, .67]],
  },
  kiln: {
    atlas: 0, source: [59, 610, 240, 184], fill: '#aa7059',
    poses: [[21.6, 9.8, 18.9, 11.2], [21.5, 9.8, 18.9, 11.2], [21.5, 10.1, 18.9, 11.2], [21.6, 9.2, 18.9, 11.2]],
    shape: [[0, .25], [.76, 0], [1, .39], [.97, .76], [.2, 1], [.02, .81]],
  },
  vesper: {
    atlas: 1, source: [145, 201, 193, 185], fill: '#8d7380',
    poses: [[32, 13.9, 14, 11.2], [32, 13.9, 14, 11.2], [32.7, 14.6, 14, 11.2], [31.3, 12.1, 14.7, 12.8]],
    shape: [[0, .04], [.59, 0], [1, .23], [.88, .66], [.67, 1], [.37, .89], [.1, .5]],
  },
  slate: {
    atlas: 1, source: [72, 600, 201, 185], fill: '#777987',
    poses: [[23, 10.2, 15.6, 11.5], [23, 9.6, 15.6, 11.5], [21.1, 10.6, 15.6, 11.5], [23, 8.7, 15.6, 12.6]],
    shape: [[0, .2], [.59, 0], [1, .05], [.86, .7], [.29, 1], [.13, .84]],
  },
  rook: {
    atlas: 2, source: [154, 185, 172, 145], fill: '#72666b',
    poses: [[29.8, 8.3, 12.8, 9.3], [27.8, 8.8, 12.8, 9.3], [28.9, 9.4, 12.8, 9.3], [26, 6.9, 12.8, 10.5]],
    shape: [[0, .02], [.72, .02], [1, .18], [.93, 1], [.36, .85], [.15, .53]],
  },
  brine: {
    atlas: 2, source: [26, 615, 185, 164], fill: '#9aa38d',
    poses: [[21, 7.5, 14.2, 12], [20.8, 7.4, 14.2, 12], [18.6, 8, 14.2, 12], [21.1, 5.9, 14.2, 13.2]],
    shape: [[0, .17], [.7, 0], [1, .24], [.89, .7], [.32, 1], [.1, .86]],
  },
  shard: {
    atlas: 3, source: [148, 186, 183, 188], fill: '#897487',
    poses: [[30.3, 12.8, 14.7, 12], [30, 12.6, 14.7, 12], [31.3, 13.8, 14.7, 12], [30.5, 10.4, 14.7, 13.6]],
    shape: [[0, 0], [.6, .01], [1, .17], [.9, .68], [.6, 1], [.15, .75], [.02, .5]],
  },
  hush: {
    atlas: 3, source: [70, 609, 148, 216], fill: '#d7c6ad',
    poses: [[23.4, 10.1, 9.5, 14], [22.9, 10.1, 9.7, 14], [21.9, 10.1, 9.7, 14.1], [23.1, 8.9, 9.9, 14.3]],
    shape: [[.1, .19], [.4, .02], [.72, 0], [.97, .13], [1, .4], [.77, .71], [.43, 1], [.17, .67], [0, .39]],
  },
};

export function resolveCharacterFace(characterId, pose, expression) {
  const character = Object.hasOwn(FACES, characterId) ? FACES[characterId] : null;
  const column = MOODS.indexOf(expression);
  if (!character || !Number.isInteger(pose) || pose < 0 || pose > 3 || column < 0) return null;
  const [x, y, width, height] = character.poses[pose];
  const [sourceX, sourceY, sourceWidth, sourceHeight] = character.source;
  return {
    atlas: CHARACTER_FACE_ATLASES[character.atlas],
    atlasSize: [...ATLAS_SIZE],
    sourceRect: [sourceX + column * CELL_WIDTH, sourceY, sourceWidth, sourceHeight],
    targetRect: [x, y, width, height],
    clip: character.shape.map(([px, py]) => [x + px * width, y + py * height]),
    fill: character.fill,
  };
}
