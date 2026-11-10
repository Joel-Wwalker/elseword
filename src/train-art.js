// Original carriage art. Geometry and palette are local constants; dialogue is
// never interpolated into SVG. Window scenery uses local nested viewports so
// several carriages can be displayed together without sharing clipping IDs.
const INK = '#29282e';
const rect = (x, y, w, h, color, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}"${extra}/>`;
const path = (d, color) => `<path d="${d}" fill="${color}"/>`;
const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" fill="none" overflow="hidden" shape-rendering="crispEdges" aria-hidden="true">${body}</svg>`;
const frameOf = (value, last) => Number.isFinite(value) ? Math.max(0, Math.min(last, Math.floor(value))) : 0;

function landscape(frame) {
  let out = rect(0, 0, 110, 62, '#acbcb3') + rect(0, 20, 110, 24, '#a3b09d') +
    rect(0, 44, 110, 18, '#819078');
  // Distant hills sit behind looping rooftops and track sleepers. Moving layers
  // repeat across their own periods, including the frame-seven wraparound.
  for (let tile = -1; tile < 3; tile++) {
    const x = tile * 128;
    out += path(`M${x} 31v-8h10v-5h17v-4h16v6h13v5h19v-7h21v5h16v8h16v13H${x}z`, '#8d9e8e');
    out += rect(x + 21, 7, 18, 2, '#cbd1bf') + rect(x + 17, 9, 30, 3, '#cbd1bf');
  }
  for (let tile = -1; tile < 3; tile++) {
    const x = tile * 96 - frame * 12;
    out += rect(x + 8, 30, 28, 15, '#b3aa91') + rect(x + 30, 31, 6, 14, '#938f7d') +
      path(`M${x + 5} 30v-3h4v-4h4v-4h18v4h4v4h4v5H${x + 5}z`, '#657d75') +
      rect(x + 14, 32, 4, 6, '#6f817a') + rect(x + 24, 32, 4, 6, '#6f817a') +
      rect(x + 19, 39, 5, 6, '#6b6d60') + rect(x + 28, 17, 4, 8, '#968675') +
      rect(x + 59, 30, 3, 18, '#6a6e5b') +
      path(`M${x + 48} 35v-9h5v-6h13v5h6v11h-6v5H${x + 53}v-6z`, '#657d65') +
      rect(x + 54, 24, 9, 5, '#8e9d78') + rect(x + 50, 30, 5, 4, '#81946e');
  }
  out += rect(0, 47, 110, 3, '#a9ab8a') + rect(0, 51, 110, 2, '#647465') +
    rect(0, 55, 110, 7, '#969785');
  for (let x = -24 - (frame * 3 % 12); x < 122; x += 12) {
    out += rect(x, 56, 3, 6, '#777e6e');
  }
  out += rect(0, 56, 110, 1, '#c0bda3') + rect(0, 60, 110, 2, '#5e6b60');
  // Glass reflections stay still while the scenery passes behind them.
  out += path('M8 0h8L0 23v-9zM24 0h3L0 34v-5zM99 25h5L79 53h-5z', '#e0dfc6');
  return `<svg x="0" y="0" width="110" height="62" viewBox="0 0 110 62" overflow="hidden">${out}</svg>`;
}

function windowFrame(x, frame) {
  // The interior remains exactly 110 x 62; the dynamic prop covers this static
  // scenery during playback, while thumbnails retain the countryside view.
  return rect(x - 5, 21, 120, 74, '#63746d') + rect(x - 3, 23, 116, 70, '#394a48') +
    `<svg x="${x}" y="26" width="110" height="62" viewBox="0 0 110 62" overflow="hidden">${landscape(frame)}</svg>` +
    rect(x - 3, 23, 116, 2, '#c3c5ac') + rect(x - 3, 25, 2, 65, '#8e9c8d') +
    rect(x + 111, 25, 2, 65, '#4b615a') + rect(x - 4, 90, 118, 5, '#d0c7aa') +
    rect(x - 4, 95, 118, 2, '#7c7e6d') + rect(x + 45, 91, 20, 2, '#a4a68f');
}

function seat(x, y, width) {
  let out = rect(x - 3, y + 4, width + 6, 29, '#5e665b') +
    rect(x, y, width, 30, '#3e5752') + rect(x + 2, y + 1, width - 4, 17, '#637e70') +
    rect(x + 3, y + 2, width - 6, 3, '#97aa8c') +
    rect(x + 3, y + 6, width - 6, 10, '#718d78') +
    rect(x + 2, y + 18, width - 4, 9, '#90a18a') +
    rect(x + 4, y + 19, width - 8, 2, '#a7b29a') +
    rect(x + 2, y + 27, width - 4, 3, '#506b60') +
    rect(x + 4, y + 30, width - 8, 3, '#444e48') +
    rect(x - 3, y + 14, 4, 14, '#b1b09a') + rect(x + width - 1, y + 14, 4, 14, '#b1b09a') +
    rect(x - 3, y + 14, 4, 2, '#ded4b8') + rect(x + width - 1, y + 14, 4, 2, '#ded4b8');
  for (let stitch = x + 10; stitch < x + width - 6; stitch += 12) {
    out += rect(stitch, y + 7, 1, 7, '#587565');
  }
  return out;
}

function sideDoor(x) {
  let out = rect(x, 176, 25, 73, '#454e4b') + rect(x + 2, 178, 21, 68, '#949e8d') +
    rect(x + 3, 178, 2, 68, '#b8bd9f') + rect(x + 12, 179, 1, 65, '#58675e') +
    rect(x + 5, 183, 5, 24, '#405958') + rect(x + 15, 183, 5, 24, '#405958') +
    rect(x + 6, 184, 3, 21, '#8ba79b') + rect(x + 16, 184, 3, 21, '#8ba79b') +
    rect(x + 6, 186, 1, 10, '#c3cbb1') + rect(x + 16, 186, 1, 10, '#c3cbb1') +
    rect(x + 8, 214, 2, 8, '#535c54') + rect(x + 15, 214, 2, 8, '#535c54') +
    rect(x + 8, 214, 1, 6, '#d5ccb2') + rect(x + 15, 214, 1, 6, '#d5ccb2') +
    rect(x + 3, 242, 19, 3, '#c1b99e') + rect(x - 1, 249, 27, 3, '#626c60');
  for (let step = x + 2; step < x + 23; step += 5) out += rect(step, 247, 2, 2, '#d4c398');
  return out;
}

export function trainBackgroundSVG() {
  let out = rect(0, 0, 512, 320, '#3f514d') + rect(6, 5, 500, 309, '#7e8c7b') +
    rect(10, 8, 492, 299, '#b4b59d') + rect(10, 108, 492, 199, '#9d9e8c') +
    rect(16, 114, 480, 187, '#afb09a') + rect(21, 119, 470, 176, '#aaa995');
  // Broad floorboards establish a shallow, slightly top-down carriage. Nothing
  // projects into the horizontal luggage lane at y213..233.
  for (let y = 124; y < 296; y += 18) {
    out += rect(22, y, 468, 1, '#969c87') + rect(22, y + 1, 468, 1, '#bdbaa3');
    for (let x = 44 + (y % 36 ? 0 : 43); x < 484; x += 86) out += rect(x, y + 2, 1, 16, '#a0a18c');
  }
  out += rect(40, 193, 432, 47, '#b7b49d') + rect(40, 194, 432, 2, '#c9c1a7') +
    rect(40, 239, 432, 2, '#919881');
  for (let x = 51; x < 462; x += 31) out += rect(x, 232, 13, 1, '#aeaf96');
  // Ivory wall panels, narrow timber belt, and inset window frames.
  out += rect(12, 12, 488, 96, '#b6bda3') + rect(12, 14, 488, 5, '#d4d3b5') +
    rect(12, 99, 488, 9, '#8a7d65') + rect(12, 99, 488, 2, '#b4a080') +
    rect(12, 108, 488, 4, '#677365');
  for (const x of [39, 182, 326, 470]) {
    out += rect(x, 20, 4, 78, '#929e8a') + rect(x, 21, 1, 75, '#d0d0b2');
  }
  out += windowFrame(57, 0) + windowFrame(201, 2) + windowFrame(345, 4);
  // Slatted luggage racks and two modest bags stay above the window openings.
  out += rect(51, 7, 122, 5, '#66796d') + rect(195, 7, 122, 5, '#66796d') +
    rect(339, 7, 122, 5, '#66796d');
  for (let x = 56; x < 459; x += 12) {
    if ((x > 172 && x < 195) || (x > 316 && x < 339)) continue;
    out += rect(x, 8, 2, 7, '#b0b89c');
  }
  out += rect(76, 4, 22, 8, '#786c59') + rect(78, 4, 18, 6, '#a4906f') +
    rect(83, 4, 2, 7, '#d0b98f') + rect(91, 4, 2, 7, '#d0b98f') +
    rect(404, 3, 27, 9, '#5d6d60') + rect(406, 4, 23, 6, '#89977d') +
    rect(417, 4, 3, 7, '#c4b897');
  // Seat backs finish above the six model anchors. Each rider's feet have an
  // unobstructed patch of floor, with space between the two rows and the aisle.
  out += seat(91, 122, 48) + seat(168, 122, 48) + seat(243, 122, 48) +
    seat(347, 122, 48) + seat(402, 122, 48) +
    seat(56, 236, 48) + seat(321, 236, 48) + seat(399, 236, 48);
  // Uprights are outside the people and luggage routes; small overhead straps
  // explain the open standing space without crossing a resident's silhouette.
  for (const x of [48, 307, 464]) {
    out += rect(x, 112, 3, 78, '#667a6b') + rect(x, 112, 1, 74, '#d1c9ad') +
      rect(x - 3, 187, 9, 3, '#8a907c') + rect(x - 1, 187, 5, 1, '#c4bfa2');
  }
  for (const x of [151, 229, 326]) {
    out += rect(x, 112, 2, 11, '#8d987e') + rect(x - 3, 121, 8, 2, '#d1c7a6') +
      rect(x - 4, 123, 2, 6, '#aaab8b') + rect(x + 4, 123, 2, 6, '#aaab8b') +
      rect(x - 3, 129, 8, 2, '#d1c7a6');
  }
  out += sideDoor(13) + sideDoor(474);
  // A blank route diagram uses stops and a line, keeping the world language
  // independent. The bottom edge is the near cutaway wall, below every rider.
  out += rect(153, 253, 96, 23, '#727d6b') + rect(155, 255, 92, 19, '#d0c9aa') +
    rect(165, 264, 72, 2, '#7a8d78');
  for (const x of [167, 188, 211, 232]) {
    out += rect(x, 261, 4, 8, '#7a8d78') + rect(x + 1, 263, 2, 4, '#d0c9aa');
  }
  out += rect(12, 298, 488, 4, '#7f806a') + rect(12, 302, 488, 8, '#c1b59a') +
    rect(12, 302, 488, 2, '#e0d1af') + rect(12, 310, 488, 4, '#647262') +
    rect(5, 13, 7, 298, '#64786b') + rect(500, 13, 7, 298, '#64786b') +
    rect(7, 15, 2, 292, '#9ba78e') + rect(501, 15, 2, 292, '#9ba78e');
  return svg(512, 320, out);
}

export function trainPropSVG(prop = {}) {
  if (prop?.type === 'train-window') return svg(110, 62, landscape(frameOf(prop.frame, 7)));
  if (prop?.type !== 'train-bag') return svg(20, 20, '');
  const frame = frameOf(prop.frame, 1);
  let out = rect(2, 18, 16, 2, '#727c69', ' opacity=".45"') +
    rect(7, 1, 6, 2, INK) + rect(6, 2, 2, 4, INK) + rect(12, 2, 2, 4, INK) +
    rect(8, 2, 4, 1, '#b6a480') + rect(3, 5, 14, 12, INK) +
    rect(4, 6, 12, 10, '#98795c') + rect(4, 6, 12, 2, '#c3a579') +
    rect(5, 9, 10, 5, '#b08d66') + rect(6, 6, 2, 10, '#635d4e') +
    rect(12, 6, 2, 10, '#635d4e') + rect(6, 10, 2, 2, '#d3ba87') +
    rect(12, 10, 2, 2, '#d3ba87') + rect(8, 7, 4, 1, '#d1b587') +
    rect(4, 16, 4, 3, '#3c4541') + rect(12, 16, 4, 3, '#3c4541') +
    rect(frame ? 6 : 5, 17, 1, 1, '#a6ad93') + rect(frame ? 14 : 13, 17, 1, 1, '#a6ad93') +
    rect(15, 8, 3, 4, '#d6c8a1') + rect(16, 8, 1, 2, '#88785e');
  return svg(20, 20, out);
}
