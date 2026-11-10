// Locally drawn game art. Every interpolated value comes from this module's
// geometry or a closed set of resident states, never from language content.
const INK = '#29282e';
const rect = (x, y, w, h, color, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}"${extra}/>`;
const path = (d, color) => `<path d="${d}" fill="${color}"/>`;
const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" fill="none" shape-rendering="crispEdges" aria-hidden="true">${body}</svg>`;

function stonework(x, y, width, height, size = 16, dark = '#8e8984', light = '#aaa49a') {
  let result = '';
  for (let row = 0; row < height; row += 8) {
    const offset = (row / 8 % 2) * (size / 2);
    for (let col = -offset; col < width; col += size) {
      const left = Math.max(0, col);
      const right = Math.min(width, col + size - 1);
      if (right <= left) continue;
      const tint = ((row / 8 + col / (size / 2)) % 5 === 0) ? light : dark;
      result += rect(x + left, y + row, right - left, 1, tint);
      result += rect(x + right, y + row + 1, 1, Math.min(7, height - row - 1), tint);
    }
  }
  return result;
}

function windowPane(x, y, w = 20, h = 24) {
  return rect(x, y, w, h, '#423d42') + rect(x + 2, y + 2, w - 4, h - 4, '#b5b6a0') +
    rect(x + 3, y + 3, w - 6, 5, '#d0c9aa') + rect(x + w / 2 - 1, y + 1, 2, h - 2, '#605653') +
    rect(x + 1, y + h / 2, w - 2, 2, '#605653') + rect(x - 2, y + h, w + 4, 3, '#70675f');
}

function lamp(x, y) {
  return rect(x - 4, y - 1, 12, 3, '#77766f') + rect(x - 3, y - 3, 7, 3, '#404344') +
    rect(x - 1, y - 34, 3, 32, '#44484a') + rect(x, y - 33, 1, 27, '#787b70') +
    rect(x - 5, y - 45, 11, 3, '#343a3d') + rect(x - 4, y - 42, 9, 10, '#474c49') +
    rect(x - 2, y - 40, 5, 6, '#d2c79c') + rect(x - 5, y - 33, 11, 2, '#343a3d') +
    rect(x - 2, y - 48, 5, 3, '#44484a');
}

function tree(x, y, variant = false) {
  const dark = variant ? '#4b625b' : '#536851';
  const middle = variant ? '#647d6e' : '#708466';
  const light = variant ? '#839483' : '#8e9d78';
  return rect(x - 14, y - 2, 30, 4, '#73786a') + rect(x - 3, y - 32, 7, 32, '#5a5046') +
    rect(x, y - 30, 2, 26, '#8c7c61') +
    path(`M${x - 20} ${y - 27}v-20h6v-10h12v-6h16v7h10v10h5v20h-8v6h-29v-7z`, dark) +
    path(`M${x - 18} ${y - 45}h6v-10h12v-5h12v7h10v10h4v12h-15v5h-16v-7h-13z`, middle) +
    rect(x - 8, y - 54, 12, 5, light) + rect(x - 14, y - 46, 7, 8, light) +
    rect(x + 5, y - 48, 8, 4, light) + rect(x + 12, y - 32, 7, 3, '#8a967a') +
    rect(x - 7, y - 31, 7, 3, dark) + rect(x + 4, y - 42, 5, 3, dark);
}

function bakery() {
  let out = rect(39, 79, 135, 47, '#77766e') + rect(44, 63, 124, 58, '#c0b49c') +
    rect(158, 65, 10, 56, '#9c9481') + rect(46, 67, 112, 3, '#d6c8ab') +
    rect(44, 114, 124, 7, '#81796a') + rect(48, 116, 108, 2, '#9c9481');
  // Hand-stepped roof silhouette and long, slightly sloping slate courses.
  out += path('M34 65h5v-8h5v-8h5v-8h5v-8h5v-8h94v8h5v8h5v8h5v8h5v8h5v7H34z', INK) +
    path('M39 63h5v-8h5v-8h5v-8h5v-9h90v9h5v8h5v8h5v8h8v4H39z', '#657d75') +
    rect(59, 26, 94, 5, '#9bada0') + rect(45, 57, 119, 2, '#86988b') +
    rect(50, 47, 109, 2, '#86988b') + rect(56, 37, 98, 2, '#86988b') +
    rect(40, 65, 133, 4, '#445950');
  for (const [x, y] of [[70, 32], [102, 32], [132, 32], [62, 42], [87, 42], [116, 42], [145, 42], [55, 52], [77, 52], [105, 52], [133, 52], [158, 60]]) out += rect(x, y, 2, 5, '#50695f');
  out += rect(125, 14, 15, 24, '#716663') + rect(128, 17, 10, 18, '#ae9983') +
    rect(123, 12, 19, 5, '#615b59') + rect(125, 10, 15, 3, '#958778') +
    rect(128, 24, 6, 2, '#817068') + rect(133, 30, 5, 2, '#817068');
  out += windowPane(54, 83, 22, 22) + windowPane(122, 83, 24, 22) +
    rect(87, 83, 24, 38, '#6b6058') + rect(90, 85, 18, 36, '#373b3b') +
    rect(92, 87, 14, 15, '#8d9c91') + rect(98, 87, 2, 15, '#504f49') +
    rect(92, 104, 14, 2, '#615d51') + rect(104, 110, 2, 2, '#cbb682') +
    rect(84, 122, 30, 4, '#d1c2a6') + rect(83, 126, 32, 2, '#8d8574');
  // Linen canopy and a bread-shaped hanging sign, without baked-in language.
  out += rect(49, 74, 101, 4, '#4d5550') + rect(51, 78, 97, 7, '#a5b495');
  for (let x = 51; x < 148; x += 16) out += rect(x, 78, 8, 7, '#dfd1af') + rect(x, 85, 8, 2, '#c5b897');
  out += rect(157, 74, 19, 2, '#4d4845') + rect(173, 74, 2, 8, '#4d4845') +
    rect(160, 81, 25, 18, '#514b43') + rect(162, 83, 21, 14, '#b7a480') +
    path('M165 92v-5h3v-2h10v2h3v5z', '#79583e') + rect(167, 88, 11, 3, '#dbbe82') +
    rect(170, 86, 1, 3, '#906c47') + rect(175, 86, 1, 3, '#906c47');
  return out;
}

function shop() {
  let out = rect(215, 61, 114, 61, '#737875') + rect(219, 49, 102, 66, '#9caca4') +
    rect(310, 52, 11, 63, '#748a82') + rect(219, 108, 102, 7, '#596d67') +
    path('M207 51h6v-8h6v-8h6v-8h6v-9h77v9h6v8h6v8h6v8h5v7H207z', '#303e46') +
    path('M213 49h6v-8h6v-8h6v-9h73v9h6v8h6v8h9v4H213z', '#5f7985') +
    rect(232, 20, 76, 4, '#91a1a1') + rect(227, 33, 83, 2, '#7d9399') +
    rect(219, 43, 98, 2, '#7d9399') + rect(212, 53, 113, 4, '#405a64');
  for (const [x, y] of [[246, 25], [274, 25], [297, 25], [235, 36], [261, 36], [287, 36], [313, 45]]) out += rect(x, y, 2, 6, '#48636f');
  out += rect(228, 62, 82, 10, '#52655d') + rect(231, 64, 76, 6, '#c0c3a8') +
    rect(263, 63, 12, 8, '#657765') + rect(267, 64, 4, 5, '#e0d1a8') +
    windowPane(228, 80, 32, 22) + rect(276, 77, 24, 38, '#4b625b') +
    rect(279, 80, 18, 33, '#303f40') + rect(281, 82, 14, 19, '#8caa9e') +
    rect(287, 82, 2, 19, '#526d64') + rect(292, 106, 2, 2, '#d5c195') +
    rect(274, 115, 28, 4, '#b7b4a0') + rect(222, 74, 83, 4, '#594f60') +
    rect(223, 78, 81, 5, '#8d8092');
  for (let x = 223; x < 304; x += 18) out += rect(x, 78, 8, 6, '#c3b8b3');
  out += rect(240, 94, 5, 6, '#a87f68') + rect(249, 90, 5, 10, '#d1c49b') +
    rect(231, 95, 4, 5, '#6a8164') + rect(307, 100, 12, 10, '#73614d') +
    rect(307, 97, 12, 4, '#8d9d74') + rect(310, 94, 6, 4, '#a4af80');
  return out;
}

function construction() {
  let out = rect(382, 47, 107, 61, '#797b71') + rect(386, 50, 99, 55, '#a8a28d') +
    rect(389, 56, 91, 46, '#bbb49d') + rect(393, 61, 84, 37, '#c5bda5') +
    rect(385, 103, 104, 7, '#716d5f');
  for (let y = 66; y < 100; y += 10) out += rect(392, y, 86, 1, '#aaa58e');
  for (let x = 399; x < 480; x += 25) out += rect(x, 59, 1, 41, '#aaa58e');
  out += rect(384, 35, 6, 75, '#49443d') + rect(386, 35, 3, 73, '#b59970') +
    rect(433, 35, 6, 75, '#49443d') + rect(435, 36, 3, 72, '#b59970') +
    rect(481, 35, 6, 75, '#49443d') + rect(483, 35, 3, 73, '#b59970') +
    rect(379, 35, 113, 6, '#4f493e') + rect(381, 35, 109, 3, '#c0a37a') +
    rect(380, 60, 111, 5, '#635643') + rect(381, 60, 109, 2, '#c0a37a') +
    path('M390 41h4l39 54v8h-4l-39-54z', '#756247') +
    path('M440 94l36-48v-5h4v8l-36 49h-4z', '#756247') +
    rect(380, 93, 112, 5, '#6d5b44') + rect(381, 93, 109, 2, '#c0a37a') +
    rect(392, 39, 88, 2, '#d3b68b');
  // Material piles stay above the two workers' feet, clear of their heads.
  out += rect(350, 101, 24, 17, '#574f43') + rect(352, 103, 20, 13, '#ac9270') +
    rect(354, 104, 3, 11, '#74634c') + rect(366, 104, 3, 11, '#74634c') +
    rect(348, 117, 28, 3, '#7b735f') + rect(461, 114, 34, 4, '#7f6a4e') +
    rect(464, 110, 30, 4, '#baa078') + rect(466, 106, 25, 4, '#cfb38a') +
    rect(473, 104, 3, 14, '#675b4a');
  return out;
}

export function cityBackgroundSVG() {
  let out = rect(0, 0, 512, 320, '#95988a') + rect(0, 8, 512, 119, '#a7aa99') +
    rect(0, 116, 512, 28, '#b9b4a1') + rect(0, 132, 512, 12, '#827f75') +
    rect(0, 135, 512, 5, '#c9c1ab') + rect(0, 144, 512, 83, '#9b998c') +
    rect(0, 227, 512, 77, '#b5b1a1') + rect(0, 227, 512, 5, '#d1c9b2') +
    rect(0, 232, 512, 2, '#88877c') + rect(0, 301, 512, 5, '#777d6e') +
    rect(0, 306, 512, 14, '#818e73');
  out += stonework(0, 144, 512, 80, 18, '#919184', '#aaa698') +
    stonework(0, 235, 512, 65, 28, '#a5a395', '#c3beac') +
    stonework(0, 117, 512, 16, 22, '#a49f8e', '#cbc1aa');
  // Rear garden strips, alley, and shared edges unify the three buildings.
  out += rect(0, 5, 512, 3, '#7c8974') + rect(10, 10, 13, 112, '#7f8e70') +
    rect(184, 10, 17, 114, '#7f8979') + rect(187, 12, 10, 110, '#92998a') +
    rect(336, 15, 11, 105, '#8a927f') + rect(496, 9, 16, 113, '#7a886f');
  out += bakery() + shop() + construction();
  // Quiet detail at the perimeter keeps the action lanes unobstructed.
  out += tree(19, 193) + tree(494, 244, true) + lamp(197, 136) + lamp(375, 221);
  out += rect(14, 285, 20, 9, '#777a68') + rect(12, 281, 24, 5, '#aaa78e') +
    rect(15, 277, 18, 5, '#62785c') + rect(18, 274, 9, 5, '#829267') +
    rect(13, 298, 21, 3, '#9eac80');
  // A parked handcart, outside both pedestrian lanes.
  out += rect(423, 275, 42, 5, '#949181') + rect(426, 264, 34, 9, '#594e43') +
    rect(428, 257, 31, 12, '#a28a65') + rect(430, 259, 27, 3, '#bfa77e') +
    rect(430, 265, 27, 2, '#7b674d') + rect(433, 256, 2, 14, '#6a5b45') +
    rect(452, 256, 2, 14, '#6a5b45') + rect(431, 271, 7, 7, '#3e403c') +
    rect(451, 271, 7, 7, '#3e403c') + rect(433, 273, 3, 3, '#a49b7b') +
    rect(453, 273, 3, 3, '#a49b7b') + rect(460, 260, 15, 3, '#665a46') +
    rect(473, 257, 3, 6, '#4b473d');
  for (const [x, y] of [[37, 153], [179, 186], [229, 162], [337, 176], [400, 196], [106, 216], [68, 294], [359, 292], [479, 284], [395, 310], [88, 309], [198, 312]]) {
    out += rect(x, y, 3, 2, '#78856b') + rect(x + 4, y - 2, 2, 3, '#8c9879');
  }
  // Drain grates and curb joins add a little wear without competing with people.
  for (const [x, y] of [[60, 139], [335, 139], [188, 224], [465, 224]]) {
    out += rect(x, y, 15, 3, '#6a7069');
    for (let i = 2; i < 14; i += 4) out += rect(x + i, y, 1, 2, '#aca996');
  }
  return svg(512, 320, out);
}

const RESIDENTS = {
  moss: { coat: '#667b51', light: '#9aaa73', skin: '#a6a779', shadow: '#69714f' },
  kiln: { coat: '#805d4a', light: '#bea184', skin: '#c58f67', shadow: '#815d49' },
  vesper: { coat: '#6a5d7c', light: '#aaa0b5', skin: '#c1b4a8', shadow: '#7f708a' },
  hush: { coat: '#57535f', light: '#8e8795', skin: '#e0d7b9', shadow: '#9d947f' },
  rook: { coat: '#4e626c', light: '#8e9e9f', skin: '#8f9b9d', shadow: '#53636d' },
  brine: { coat: '#666d73', light: '#a0aaa2', skin: '#7d9b91', shadow: '#526f6d' },
  slate: { coat: '#8a7660', light: '#b5a285', skin: '#a6a49a', shadow: '#747871' },
  shard: { coat: '#596d65', light: '#a2bba5', skin: '#acbdc3', shadow: '#6b8791' },
};

function residentHead(id, palette, direction, expression) {
  const side = direction === 'right';
  const back = direction === 'up';
  let out = '';
  if (id === 'moss') {
    out += path('M3 1h2v4h2v3H3zM15 1h2v7h-4V5h2z', INK) +
      rect(4, 2, 1, 4, '#c4c2a0') + rect(15, 2, 1, 4, '#c4c2a0') +
      path('M6 5h8v2h2v7h-3v2H7v-2H4V7h2z', INK) +
      rect(6, 6, 8, 8, palette.skin) + rect(5, 8, 10, 4, palette.skin) +
      rect(6, 6, 8, 2, '#c0bd8b') + rect(6, 13, 8, 2, palette.shadow);
  } else if (id === 'kiln') {
    out += path('M6 3h8v2h3v9h-3v2H6v-2H3V5h3z', INK) +
      rect(6, 4, 8, 10, palette.skin) + rect(4, 6, 12, 7, palette.skin) +
      rect(6, 5, 8, 2, '#ddae83') + rect(5, 12, 10, 2, palette.shadow) +
      rect(11, 5, 1, 4, '#96684f') + rect(12, 8, 2, 1, '#96684f');
  } else if (id === 'vesper') {
    out += path('M4 1h2v3h2v3H5V4H4zM14 1h2v3h-1v3h-3V4h2z', '#a397b0') +
      path('M7 5h6v2h3v7h-3v2H7v-2H4V7h3z', INK) +
      rect(7, 6, 6, 9, palette.skin) + rect(5, 8, 10, 5, palette.skin) +
      rect(7, 6, 6, 2, '#e0d4bc') + rect(9, 12, 2, 3, palette.shadow);
  } else if (id === 'hush') {
    out += path('M2 0h2v4h3v3H5V6H2zM16 0h2v6h-3v1h-2V4h3zM0 2h2v2H0zM18 2h2v2h-2z', '#b0aa90') +
      path('M6 5h8v2h2v6h-2v3H6v-3H4V7h2z', INK) +
      rect(6, 6, 8, 7, palette.skin) + rect(7, 13, 6, 3, palette.skin) +
      rect(6, 6, 2, 6, '#bcb69c') + rect(9, 13, 2, 2, palette.shadow);
  } else if (id === 'rook') {
    out += path('M7 2h6v2h3v3h1v8H3V7h1V4h3z', INK) +
      rect(7, 3, 6, 11, palette.skin) + rect(5, 5, 10, 9, palette.skin) +
      rect(7, 4, 7, 2, '#bdc2b6') + rect(4, 8, 12, 6, palette.shadow) +
      rect(9, 3, 2, 11, '#bbc1b7') + rect(3, 13, 14, 2, '#4c535b');
  } else if (id === 'brine') {
    out += path('M1 5h3V3h2v10H3v-2H1zM16 5h3v6h-2v2h-3V3h2z', INK) +
      rect(2, 6, 3, 4, '#769a8b') + rect(15, 6, 3, 4, '#769a8b') +
      path('M6 4h8v2h2v8h-3v2H7v-2H4V6h2z', INK) +
      rect(6, 5, 8, 9, palette.skin) + rect(5, 7, 10, 5, palette.skin) +
      rect(7, 5, 6, 2, '#a4b4a1') + rect(6, 13, 8, 2, palette.shadow);
  } else if (id === 'slate') {
    out += path('M5 3h10v2h2v9h-3v2H5v-2H3V6h2z', INK) +
      rect(6, 4, 9, 10, palette.skin) + rect(4, 7, 12, 6, palette.skin) +
      rect(6, 4, 8, 3, '#c9c6b7') + rect(4, 11, 3, 3, palette.shadow) +
      rect(8, 5, 1, 3, palette.shadow) + rect(9, 7, 2, 1, palette.shadow) +
      rect(13, 12, 3, 2, palette.shadow);
  } else {
    out += path('M8 0h4v3h3v3h2v7h-3v3H6v-3H3V6h2V3h3z', INK) +
      path('M9 1h2v3h3v3h2v5h-3v3H7v-3H4V7h2V4h3z', palette.skin) +
      path('M10 2h1v3h3v3h1v4h-4v2H9z', palette.shadow) +
      rect(7, 5, 2, 6, '#e0e6d7');
  }
  if (back) return out + rect(6, 9, 8, 4, palette.shadow) + rect(8, 7, 5, 4, palette.skin);
  const eyes = id === 'rook' ? '#242e35' : '#343338';
  if (side) out += rect(12, 9, 3, 2, eyes) + rect(15, 11, 2, 2, palette.skin);
  else out += rect(6, 9, 3, 2, eyes) + rect(11, 9, 3, 2, eyes);
  if (expression === 'surprised') out += rect(side ? 13 : 9, 12, 2, 2, '#514747');
  else if (id !== 'rook' && id !== 'hush') out += rect(side ? 12 : 8, 13, side ? 2 : 4, 1, palette.shadow);
  return out;
}

export function cityActorSVG(actor = {}) {
  const id = Object.hasOwn(RESIDENTS, actor.id) ? actor.id : 'moss';
  const palette = RESIDENTS[id];
  const facing = ['left', 'right', 'up', 'down'].includes(actor.direction) ? actor.direction : 'down';
  const direction = facing === 'left' ? 'right' : facing;
  const activity = ['walk', 'hammer', 'carry', 'pockets'].includes(actor.activity) ? actor.activity : 'idle';
  const step = actor.step === 1 ? 1 : 0;
  const expression = actor.expression === 'surprised' ? 'surprised' : 'neutral';
  let body = rect(4, 26, 13, 2, '#5d635a', ' opacity=".4"');
  const walking = activity === 'walk';
  body += rect(6, 21, 4, 5, INK) + rect(11, 21, 4, 5, INK) +
    rect(walking && step ? 5 : 6, walking && !step ? 24 : 25, 5, 2, '#34343b') +
    rect(walking && step ? 12 : 11, walking && step ? 24 : 25, 5, 2, '#34343b');
  if (id === 'vesper') {
    body += path('M6 13h8v3h2v4h2v4h-5v-2h-2v2H8v-2H6v2H2v-4h2v-4h2z', INK) +
      path('M7 14h6v3h2v4h1v2h-3v-2H7v2H4v-3h2v-4h1z', palette.coat) +
      rect(5, 18, 2, 3, palette.light) + rect(13, 18, 2, 3, palette.light);
  } else {
    body += path('M6 13h8v2h2v8H4v-8h2z', INK) + rect(6, 14, 8, 8, palette.coat) +
      rect(5, 16, 10, 6, palette.coat) + rect(6, 15, 2, 6, palette.light);
  }
  if (id === 'kiln') body += rect(8, 14, 4, 3, '#d0bb94') + rect(7, 17, 7, 6, '#c0aa84') + rect(9, 19, 3, 2, '#967e62');
  if (id === 'moss') body += rect(10, 15, 1, 7, '#475d43') + rect(11, 18, 2, 1, '#c8bd89');
  if (id === 'hush') body += rect(9, 15, 2, 7, '#a59d91') + rect(6, 21, 8, 2, '#6f6677');
  if (id === 'rook') body += rect(5, 15, 10, 3, '#7d8989') + rect(8, 18, 4, 4, '#596b70') + rect(12, 18, 2, 2, '#b8ac7d');
  if (id === 'brine') body += rect(5, 14, 10, 3, '#a6b09e') + rect(12, 17, 2, 5, '#829583');
  if (id === 'slate') body += rect(10, 15, 2, 8, '#564e48') + rect(11, 19, 5, 5, '#6c6255') + rect(12, 19, 3, 1, '#c2ae85');
  if (id === 'shard') body += rect(6, 16, 9, 2, '#b1b8a0') + rect(9, 18, 2, 4, '#819488');
  // Arms follow the work, while feet remain on the model's fixed anchors.
  if (activity === 'pockets') {
    body += rect(3, 16, 3, 4, INK) + rect(14, 16, 3, 4, INK) +
      rect(4, 17, 3, 3, palette.coat) + rect(13, 17, 3, 3, palette.coat) +
      rect(6, 19, 3, 2, palette.skin) + rect(11, 19, 3, 2, palette.skin);
  } else if (activity === 'hammer') {
    body += rect(3, 16, 3, 6, palette.coat) + rect(14, step ? 12 : 17, 3, 5, palette.coat) +
      rect(15, step ? 11 : 19, 3, 2, palette.skin) + rect(17, step ? 6 : 15, 2, 8, '#a68c65') +
      rect(15, step ? 5 : 14, 5, 3, '#4e5960') + rect(15, step ? 5 : 14, 5, 1, '#a4afaa');
  } else {
    const armShift = walking && step ? 1 : 0;
    body += rect(3, 16 + armShift, 3, 5, palette.coat) + rect(14, 17 - armShift, 3, 5, palette.coat) +
      rect(3, 20 + armShift, 3, 2, palette.skin) + rect(14, 21 - armShift, 3, 2, palette.skin);
  }
  body += residentHead(id, palette, direction, expression);
  if (activity === 'carry') body += rect(5, 17, 12, 8, INK) + rect(6, 18, 10, 6, '#b29670') +
    rect(10, 18, 2, 6, '#dfc496') + rect(5, 19, 2, 3, palette.skin) + rect(15, 19, 2, 3, palette.skin);
  if (facing === 'left') body = `<g transform="translate(20 0) scale(-1 1)">${body}</g>`;
  return svg(20, 28, body);
}

export function cityPropSVG(type) {
  let body = '';
  if (type === 'plank') body = rect(1, 15, 18, 3, '#71654f') + rect(1, 12, 18, 3, '#bea075') + rect(3, 13, 14, 1, '#d1b78b') + rect(4, 16, 14, 1, '#9c825f');
  else if (type === 'parcel') body = rect(4, 8, 13, 11, '#675744') + rect(5, 7, 11, 10, '#bb9f7a') + rect(9, 7, 3, 10, '#dfc7a0') + rect(5, 11, 11, 2, '#ddc49d') + rect(10, 10, 2, 2, '#8f7658');
  else body = rect(2, 5, 16, 14, '#5c4d3e') + rect(3, 6, 14, 12, '#b39670') + rect(4, 8, 12, 1, '#d0b187') + rect(4, 13, 12, 1, '#816c50') + rect(5, 6, 2, 12, '#7c664b') + rect(13, 6, 2, 12, '#7c664b') + rect(3, 16, 14, 2, '#8d7454');
  return svg(20, 20, body);
}
