// Original miniature scenery. All geometry and colors are local constants;
// language content never becomes part of the SVG markup.
const INK = '#29282e';
const rect = (x, y, w, h, color, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}"${extra}/>`;
const path = (d, color) => `<path d="${d}" fill="${color}"/>`;
const svg = (body, width = 512, height = 320) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" fill="none" shape-rendering="crispEdges" aria-hidden="true">${body}</svg>`;

function windowPane(x, y, w, h, night = false) {
  const glass = night ? '#536878' : '#8caaa1';
  return rect(x - 2, y - 2, w + 4, h + 5, '#71665d') + rect(x, y, w, h, '#45494b') +
    rect(x + 3, y + 3, w - 6, h - 6, glass) + rect(x + 4, y + 4, w - 8, 5, night ? '#657b86' : '#b7c7b1') +
    path(`M${x + 4} ${y + h - 7}h${w - 8}v4H${x + 4}z`, night ? '#384e61' : '#6b8d80') +
    rect(x + Math.floor(w / 2) - 1, y + 2, 2, h - 3, '#6b655b') +
    rect(x + 2, y + Math.floor(h / 2), w - 4, 2, '#6b655b') +
    rect(x - 4, y + h, w + 8, 3, '#b5aa90') + rect(x - 3, y + h + 3, w + 6, 2, '#776d61');
}

function floorboards(x, y, w, h, base, seam) {
  let out = rect(x, y, w, h, base);
  for (let row = 0; row < h; row += 10) {
    out += rect(x, y + row, w, 1, seam);
    for (let col = row % 20 ? 33 : 9; col < w; col += 48) {
      out += rect(x + col, y + row + 1, 1, Math.min(9, h - row - 1), seam);
      if (col + 18 < w) out += rect(x + col + 8, y + row + 5, 10, 1, '#b3a081');
    }
  }
  return out;
}

function tiles(x, y, w, h, base, seam, accent) {
  let out = rect(x, y, w, h, base);
  for (let row = 0; row < h; row += 12) {
    out += rect(x, y + row, w, 1, seam);
    for (let col = 0; col < w; col += 18) {
      out += rect(x + col, y + row, 1, Math.min(12, h - row), seam);
      if ((col / 18 + row / 12) % 3 === 0 && col + 4 < w && row + 4 < h) {
        out += rect(x + col + 4, y + row + 4, Math.min(7, w - col - 4), Math.min(3, h - row - 4), accent);
      }
    }
  }
  return out;
}

function plant(x, y, pot = '#9d755e') {
  return rect(x - 6, y - 8, 13, 3, '#554f46') + rect(x - 5, y - 5, 11, 8, pot) +
    rect(x - 3, y - 4, 3, 6, '#b59a78') + rect(x - 1, y - 19, 2, 13, '#4d654f') +
    path(`M${x} ${y - 13}h-7v-3h-3v-4h5v3h5zM${x + 1} ${y - 17}v-7h3v-4h4v6h-3v5zM${x + 1} ${y - 9}v-5h5v-4h4v5h-3v4z`, '#6c8561') +
    rect(x - 6, y - 19, 4, 2, '#9ba680') + rect(x + 5, y - 25, 2, 3, '#9ba680');
}

function kitchen() {
  let out = windowPane(133, 40, 36, 31) + rect(128, 38, 47, 3, '#6c6459') +
    rect(128, 41, 7, 27, '#c1aa8c') + rect(168, 41, 7, 27, '#c1aa8c') +
    rect(131, 43, 2, 21, '#9c826e') + rect(170, 43, 2, 21, '#9c826e');
  // Dishes, jars, and a small herb rail live on the rear wall.
  out += rect(43, 48, 66, 4, '#6b5848') + rect(46, 52, 3, 6, '#8e785b') + rect(102, 52, 3, 6, '#8e785b');
  for (const [x, color] of [[48, '#8b9d8a'], [62, '#bd9872'], [78, '#9d8474']]) {
    out += rect(x, 37, 9, 11, '#5d5c50') + rect(x + 1, 38, 7, 9, color) + rect(x + 1, 35, 7, 3, '#6c5949');
  }
  out += rect(92, 42, 12, 3, '#d4c5a1') + rect(94, 45, 9, 3, '#9f9d85') +
    rect(184, 44, 43, 3, '#725e4d') + rect(188, 47, 2, 10, '#796953') +
    path('M184 55h10v4h-2v7h-6v-7h-2z', '#6c805c') + rect(201, 47, 2, 9, '#796953') +
    path('M197 54h10v6h-2v5h-6v-5h-2z', '#879470') + rect(216, 47, 2, 7, '#796953') +
    rect(212, 54, 9, 13, '#a88368') + rect(214, 54, 2, 9, '#c5a27c');
  // The cooker is left of Kiln; the falling pan has a clear strip at x136..156.
  out += rect(40, 80, 64, 6, '#746655') + rect(43, 86, 58, 17, '#a48f70') +
    rect(45, 88, 24, 12, '#8c775d') + rect(73, 88, 25, 12, '#8c775d') +
    rect(55, 92, 5, 2, '#c4b18a') + rect(82, 92, 5, 2, '#c4b18a') +
    rect(46, 75, 28, 6, '#4f5d58') + rect(49, 76, 22, 3, '#b0b9a1') +
    rect(57, 67, 3, 9, '#6c7770') + rect(59, 66, 7, 3, '#909c8b');
  out += rect(70, 102, 24, 27, '#45454a') + rect(72, 104, 20, 22, '#727a75') +
    rect(70, 101, 24, 4, '#b2b5a1') + rect(73, 107, 18, 3, '#414a48') +
    rect(74, 113, 16, 10, '#343d3c') + rect(76, 115, 12, 6, '#9b6446') +
    rect(78, 117, 8, 3, '#d29b63') + rect(74, 128, 3, 3, '#4f4b46') + rect(88, 128, 3, 3, '#4f4b46');
  out += rect(72, 95, 19, 6, '#4c5554') + rect(75, 92, 13, 7, '#8c9b91') +
    rect(75, 92, 13, 2, '#c1c5ac') + rect(70, 96, 3, 2, '#424b4a') + rect(90, 96, 3, 2, '#424b4a');
  out += rect(185, 106, 40, 5, '#6b5745') + rect(187, 103, 36, 5, '#c0a479') +
    rect(189, 111, 4, 20, '#7d674e') + rect(217, 111, 4, 20, '#7d674e') +
    rect(192, 100, 13, 3, '#d1c4a5') + rect(195, 98, 8, 3, '#b5956c') +
    rect(211, 98, 6, 5, '#8a987a') + rect(212, 96, 4, 2, '#b4b59a');
  return out;
}

function repairRoom() {
  let out = windowPane(299, 39, 40, 32) + rect(282, 82, 76, 4, '#687770');
  out += rect(287, 76, 14, 6, '#ab9576') + rect(289, 70, 10, 6, '#bdaa87') +
    rect(309, 71, 8, 11, '#6b7d78') + rect(310, 69, 6, 3, '#aaa78a') +
    rect(330, 72, 15, 10, '#8f7c61') + rect(332, 74, 11, 2, '#b7a17b');
  // Broken vertical pipe ends at y85; the drip stays above the floor at y142.
  out += rect(386, 31, 8, 51, '#4f6664') + rect(388, 32, 4, 51, '#9bad9d') +
    rect(389, 32, 1, 48, '#c7c7a8') + rect(383, 48, 14, 5, '#667a70') +
    rect(385, 49, 10, 2, '#b2bba3') + rect(384, 77, 12, 5, '#647b70') +
    rect(387, 81, 7, 3, '#455d59') + rect(388, 84, 2, 2, '#b3bdaa') +
    rect(393, 55, 32, 6, '#60776e') + rect(394, 56, 30, 2, '#b3bda5') +
    rect(421, 58, 6, 22, '#71867a') + rect(422, 60, 2, 19, '#b3bda5');
  out += rect(415, 83, 35, 5, '#566b64') + rect(413, 88, 40, 9, '#b7baa0') +
    rect(417, 89, 32, 4, '#7c988a') + rect(417, 97, 4, 30, '#6e7b6e') +
    rect(446, 97, 4, 30, '#6e7b6e') + rect(429, 97, 5, 17, '#8e9f90') +
    rect(431, 110, 13, 5, '#8e9f90') + rect(440, 113, 4, 14, '#8e9f90') +
    rect(425, 78, 3, 11, '#4c6965') + rect(428, 78, 7, 3, '#93aaa0');
  out += rect(454, 40, 19, 35, '#7b8373') + rect(456, 42, 15, 31, '#b4b49a') +
    path('M461 46h3v8h3v4h-3v11h-3V58h-3v-4h3z', '#526769') +
    rect(459, 46, 2, 4, '#b4b49a') + rect(464, 46, 2, 4, '#b4b49a');
  out += rect(314, 120, 24, 11, '#5d5a4b') + rect(316, 119, 20, 10, '#9c8262') +
    rect(320, 115, 12, 5, '#5d5a4b') + rect(323, 117, 6, 2, '#b5a585') +
    rect(316, 122, 20, 2, '#bba17c') + rect(324, 122, 3, 4, '#d2bf93');
  // A shallow catch basin is beyond Brine's feet, under the leak.
  out += rect(380, 132, 24, 3, '#627771') + rect(383, 135, 18, 4, '#81998c') +
    rect(383, 132, 18, 2, '#bac4ad');
  return out;
}

function sittingRoom() {
  let out = windowPane(85, 174, 37, 29) + rect(80, 172, 47, 3, '#6e5d52') +
    rect(80, 175, 7, 25, '#9a8388') + rect(120, 175, 7, 25, '#9a8388') +
    rect(82, 178, 2, 17, '#b9a1a0') + rect(123, 178, 2, 17, '#b9a1a0');
  out += rect(37, 188, 33, 74, '#5d4e45') + rect(40, 191, 27, 68, '#9b8163');
  for (const y of [205, 224, 243]) {
    out += rect(40, y, 27, 3, '#5c5044');
    for (const [x, h, color] of [[43, 12, '#7c8c72'], [49, 10, '#b3a381'], [55, 13, '#927979'], [61, 9, '#86999a']]) {
      out += rect(x, y - h, 4, h, color) + rect(x, y - h + 2, 4, 1, '#c8b797');
    }
  }
  out += rect(43, 248, 21, 9, '#75624f') + rect(51, 250, 5, 2, '#c0a47a');
  out += rect(92, 251, 82, 21, '#8f7c78') + rect(95, 253, 76, 16, '#b4a08d') +
    rect(98, 255, 70, 12, '#7f8881') + rect(100, 257, 66, 8, '#929e90') +
    rect(100, 260, 66, 2, '#b8b098');
  // Hush sits at (118,263); the chair is intentionally behind that sprite.
  out += rect(103, 231, 30, 31, '#564b53') + rect(106, 233, 24, 22, '#827488') +
    rect(108, 235, 20, 17, '#a092a0') + rect(109, 237, 18, 2, '#b1a5ad') +
    rect(105, 254, 26, 8, '#695c72') + rect(108, 254, 20, 5, '#96869a') +
    rect(100, 246, 7, 17, '#5e5363') + rect(130, 246, 7, 17, '#5e5363') +
    rect(101, 245, 6, 5, '#a091a0') + rect(130, 245, 6, 5, '#a091a0') +
    rect(103, 263, 4, 5, '#605143') + rect(130, 263, 4, 5, '#605143');
  out += rect(147, 247, 21, 4, '#75604c') + rect(150, 251, 3, 13, '#75604c') +
    rect(162, 251, 3, 13, '#75604c') + rect(149, 243, 11, 4, '#c1b69a') +
    rect(151, 242, 8, 2, '#ded0ad') + rect(161, 239, 5, 8, '#877c66') +
    rect(162, 237, 3, 3, '#c8b48e');
  out += rect(181, 208, 42, 7, '#847467') + rect(185, 215, 34, 42, '#9e8e7a') +
    rect(190, 222, 24, 31, '#5b5350') + rect(193, 225, 18, 25, '#3a3e3c') +
    rect(180, 254, 45, 7, '#7c7365') + rect(178, 261, 49, 4, '#b1a48b') +
    rect(194, 246, 15, 3, '#8d6549') + rect(196, 240, 4, 7, '#b28456') +
    rect(202, 243, 5, 4, '#d8ac69');
  out += rect(193, 173, 20, 25, '#756451') + rect(196, 176, 14, 19, '#c1b493') +
    path('M198 191v-5h3v-5h3v5h4v5z', '#829174') + rect(202, 178, 3, 3, '#d5c299') + plant(235, 255);
  return out;
}

function laundryRoom() {
  let out = windowPane(301, 172, 35, 29) + windowPane(415, 172, 35, 29);
  out += rect(281, 198, 192, 2, '#766f61') + rect(281, 195, 3, 7, '#a59a7c') + rect(471, 195, 3, 7, '#a59a7c');
  // Laundry ends above the residents' heads, leaving the floor open.
  for (const [x, color, shade, short] of [[292, '#c6c1a7', '#a0a892', false], [335, '#9a8e9d', '#7f7788', true], [376, '#a6b59b', '#7d9685', false], [433, '#c5ad8a', '#a38a72', true]]) {
    out += rect(x, 198, 3, 5, '#c0ac7f') + rect(x + 19, 198, 3, 5, '#c0ac7f');
    if (short) out += path(`M${x + 2} 201h18v4h5v8h-6v9h-16v-9h-6v-8h5z`, color) + rect(x + 5, 203, 2, 17, shade);
    else out += rect(x + 2, 201, 19, 22, color) + rect(x + 5, 202, 2, 19, shade) + rect(x + 17, 202, 2, 19, shade) + rect(x + 2, 220, 19, 3, shade);
  }
  out += rect(292, 249, 46, 5, '#5b665d') + rect(296, 254, 38, 12, '#869681') +
    rect(299, 255, 3, 10, '#bac0a3') + rect(328, 255, 3, 10, '#5f7568') +
    rect(295, 247, 40, 4, '#b0bda6') + rect(300, 245, 30, 4, '#718f84') +
    rect(303, 245, 22, 2, '#b1c5b1') + rect(301, 267, 4, 5, '#657060') + rect(325, 267, 4, 5, '#657060');
  out += rect(308, 231, 14, 17, '#6c6352') + rect(310, 232, 10, 14, '#b6aa8c');
  for (let y = 234; y < 245; y += 3) out += rect(311, y, 8, 1, '#807e6b');
  out += rect(408, 244, 31, 27, '#75644e') + rect(411, 245, 25, 23, '#b09b77') +
    rect(409, 243, 29, 4, '#d0b58a') + rect(412, 250, 23, 2, '#8e795b') +
    rect(412, 256, 23, 2, '#8e795b') + rect(412, 262, 23, 2, '#8e795b');
  for (const x of [415, 422, 429]) out += rect(x, 248, 2, 20, '#c2a77f');
  out += rect(413, 238, 12, 6, '#d4cbb2') + rect(421, 233, 12, 10, '#aaa6b4') +
    rect(424, 236, 9, 2, '#c5bdc4') + rect(449, 239, 16, 5, '#928469') +
    rect(451, 244, 3, 24, '#796c54') + rect(460, 244, 3, 24, '#796c54') +
    rect(451, 233, 11, 6, '#b6b9a1') + rect(453, 229, 7, 4, '#8b9d89') + plant(282, 265, '#8f8670');
  return out;
}

export function apartmentsBackgroundSVG() {
  let out = rect(0, 0, 512, 320, '#8e9b8a') + rect(0, 0, 512, 286, '#a6ad9a') +
    rect(18, 14, 478, 272, '#666359') + rect(24, 24, 464, 254, '#b4a58e');
  out += rect(30, 28, 220, 64, '#c9b79a') + rect(262, 28, 220, 64, '#a6b6a3') +
    rect(30, 164, 220, 66, '#c3b09c') + rect(262, 164, 220, 66, '#b4b9a0');
  out += rect(30, 28, 220, 4, '#dcc9a6') + rect(262, 28, 220, 4, '#c6ccb1') +
    rect(30, 164, 220, 4, '#dac7ac') + rect(262, 164, 220, 4, '#d0ccb0');
  // Four different floor treatments make the stacked rooms easy to read.
  out += tiles(30, 92, 220, 50, '#c1b79c', '#a89f88', '#c9c1a5') +
    tiles(262, 92, 220, 50, '#a4b1a0', '#85998d', '#b7bfaa') +
    floorboards(30, 230, 220, 48, '#b39b7c', '#95836a') +
    tiles(262, 230, 220, 48, '#b7bba4', '#9da68f', '#c6c7ad');
  for (const y of [90, 228]) out += rect(30, y, 220, 3, '#897b66') + rect(262, y, 220, 3, '#819080');
  out += kitchen() + repairRoom() + sittingRoom() + laundryRoom();
  // Thick floor beams and exposed brick edges give the house its cutaway.
  out += rect(20, 142, 472, 19, '#6b5d50') + rect(26, 144, 460, 4, '#c2aa83') +
    rect(27, 151, 458, 5, '#8e765a') + rect(27, 157, 458, 4, '#504c46') +
    rect(20, 278, 472, 8, '#6d6252') + rect(25, 278, 462, 3, '#d1ba92') +
    rect(20, 22, 10, 256, '#8a7b66') + rect(482, 22, 10, 256, '#8a7b66') +
    rect(250, 23, 12, 255, '#73695b') + rect(252, 26, 6, 252, '#b6a083');
  for (let y = 30; y < 278; y += 12) out += rect(21, y, 8, 2, '#b4a184') + rect(483, y + 3, 8, 2, '#b4a184') + rect(252, y + 1, 6, 1, '#dac2a0');
  out += path('M13 24v-9h8V8h470v7h8v9z', '#46554e') + rect(21, 11, 470, 5, '#8e9c86') +
    rect(18, 20, 478, 5, '#56685c') + rect(23, 25, 466, 3, '#cec0a0');
  for (let x = 28; x < 483; x += 24) out += rect(x, 12, 2, 7, '#5f7667');
  out += rect(0, 286, 512, 34, '#b6b1a0') + rect(0, 286, 512, 4, '#d1c8b0') + rect(0, 290, 512, 2, '#8a8b7d');
  for (let x = 0; x < 512; x += 32) out += rect(x, 293, 1, 27, '#9b9d8e') + rect(x + 16, 306, 1, 14, '#9b9d8e');
  out += rect(0, 305, 512, 1, '#a2a393') + rect(11, 298, 19, 3, '#7c8777') +
    rect(13, 295, 8, 3, '#8e9e7d') + rect(475, 311, 17, 2, '#919c7f');
  return svg(out);
}

function lantern(x, y) {
  return rect(x - 8, y - 5, 16, 22, '#c5ae75', ' opacity=".08"') + rect(x - 6, y - 3, 12, 18, '#d1b97e', ' opacity=".10"') +
    rect(x - 1, y - 9, 2, 9, '#434b4c') + rect(x - 5, y - 2, 10, 3, '#384345') +
    rect(x - 4, y + 1, 8, 10, '#ab8e61') + rect(x - 2, y + 2, 4, 7, '#e1c48a') +
    rect(x - 4, y + 11, 8, 2, '#394647') + rect(x - 2, y + 13, 4, 2, '#9e7a57');
}

function foodStall(x, vendorX, rose = false) {
  const canvas = rose ? '#928086' : '#819787';
  const shade = rose ? '#756571' : '#617f72';
  const trim = rose ? '#b6a095' : '#b8b69a';
  let out = rect(x + 5, 90, 126, 64, '#3e5053') + rect(x + 9, 97, 118, 45, '#67766a') +
    rect(x + 12, 99, 112, 3, '#899680') + rect(x + 7, 98, 4, 56, '#665e4d') + rect(x + 124, 98, 4, 56, '#665e4d') +
    rect(x + 8, 100, 1, 51, '#b0a17b') + rect(x + 125, 100, 1, 51, '#b0a17b');
  // Raised canvas roof with a scalloped linen valance.
  out += path(`M${x - 3} 93v-7h5v-7h5v-7h5v-6h111v6h5v7h5v7h5v7z`, '#33464c') +
    path(`M${x + 2} 90v-6h5v-7h5v-7h103v7h5v7h5v6z`, canvas) +
    rect(x + 12, 68, 103, 3, trim) + rect(x + 7, 79, 113, 2, shade) + rect(x + 1, 90, 130, 5, shade);
  for (let i = 0; i < 8; i++) {
    const left = x + 3 + i * 16;
    out += rect(left, 94, 14, 8, i % 2 ? trim : canvas) + rect(left + 2, 102, 10, 2, i % 2 ? '#9e9e85' : shade);
  }
  // Counter sections leave the vendor's 20px sprite unobstructed.
  const gapLeft = vendorX - 13;
  const gapRight = vendorX + 13;
  for (const [left, width] of [[x + 4, gapLeft - x - 4], [gapRight, x + 132 - gapRight]]) {
    out += rect(left, 130, width, 24, '#625c50') + rect(left + 2, 134, width - 4, 18, '#a18d69') +
      rect(left, 128, width, 6, '#c1b08a') + rect(left + 2, 130, width - 4, 2, '#d6c49b') +
      rect(left + 3, 148, width - 6, 2, '#7a7058');
    for (let board = left + 12; board < left + width - 3; board += 13) out += rect(board, 135, 1, 13, '#7e7359');
  }
  out += rect(x + 8, 153, 120, 3, '#384b4f') + rect(x + 12, 155, 111, 3, '#71817a');
  if (!rose) {
    out += rect(104, 113, 27, 5, '#394a4d') + rect(108, 107, 19, 9, '#7f958a') +
      rect(108, 106, 19, 3, '#bcc0a0') + rect(111, 108, 13, 2, '#ba9a62') +
      rect(103, 109, 5, 3, '#718b80') + rect(127, 109, 5, 3, '#718b80');
    for (let i = 0; i < 3; i++) out += rect(x + 17 + i * 2, 119 - i * 3, 17 - i * 4, 3, '#c6c7a8');
    out += rect(x + 98, 121, 23, 6, '#566a61') + rect(x + 100, 118, 19, 4, '#b8aa7d') +
      rect(x + 103, 116, 4, 3, '#e1c28a') + rect(x + 110, 117, 5, 3, '#d4ac79') +
      rect(x + 113, 109, 3, 8, '#8c7556') + rect(x + 112, 106, 5, 4, '#c8b58a');
  } else {
    out += rect(x + 65, 118, 42, 8, '#3b5153') + rect(x + 68, 116, 36, 3, '#778c7e');
    for (let i = 0; i < 4; i++) out += rect(x + 70 + i * 9, 109, 2, 14, '#c5ad7a') +
      rect(x + 68 + i * 9, 111, 6, 5, i % 2 ? '#b98960' : '#c7a677') + rect(x + 69 + i * 9, 111, 4, 1, '#e1bf88');
    out += rect(x + 17, 115, 9, 12, '#6d8a7d') + rect(x + 18, 114, 7, 3, '#b1b89a') +
      rect(x + 19, 119, 5, 5, '#9eae91') + rect(x + 29, 121, 8, 6, '#b99a73');
  }
  return out;
}

export function nightMarketBackgroundSVG() {
  let out = rect(0, 0, 512, 320, '#526775') + rect(0, 0, 512, 94, '#384f61') +
    rect(0, 146, 512, 78, '#73847f') + rect(0, 224, 512, 79, '#788a88') + rect(0, 303, 512, 17, '#4f6669');
  // Quiet upper-storey silhouettes behind the canvas roofs.
  out += rect(25, 18, 173, 99, '#506568') + rect(28, 21, 167, 91, '#667c75') +
    rect(315, 12, 174, 109, '#4d6369') + rect(319, 17, 166, 98, '#64797a') +
    rect(206, 30, 96, 120, '#455e67') + rect(210, 35, 88, 110, '#6b7c78') +
    rect(203, 27, 102, 7, '#334c59') + rect(210, 29, 88, 2, '#8a9587');
  for (const x of [43, 94, 145, 333, 386, 439]) out += windowPane(x, 27, 27, 28, true);
  out += rect(28, 18, 167, 4, '#8e9885') + rect(319, 13, 166, 4, '#8e9885') +
    rect(26, 61, 171, 3, '#455f63') + rect(318, 62, 168, 3, '#455f63');
  out += path('M224 145V74h4V63h6v-7h12v-3h20v3h12v7h6v11h4v71z', '#3c535b') +
    path('M231 144V76h4V66h10v-5h22v5h10v10h4v68z', '#263f50') +
    rect(235, 80, 42, 64, '#314b59') + rect(239, 84, 34, 60, '#3b5660') +
    rect(246, 101, 22, 43, '#2a424f') + rect(249, 105, 16, 39, '#415b5f') +
    rect(231, 145, 50, 4, '#a0a691') + rect(225, 149, 62, 4, '#7d8b81') + rect(219, 153, 74, 4, '#929c8c');
  // Stepped cord and lanterns use the same square pixels as the residents.
  out += path('M0 21h58v2h58v2h70v2h73v-1h74v-2h70v-2h61v-2h48v2h-48v2h-61v2h-70v2h-74v1h-73v-2h-70v-2H58v-2H0z', '#293f4b');
  for (const [x, y] of [[39, 28], [99, 31], [159, 33], [221, 35], [282, 34], [343, 32], [405, 30], [468, 28]]) out += lantern(x, y);
  out += foodStall(55, 116) + foodStall(312, 357, true);
  // Hanging food emblems contain no lettering, so every language fits.
  for (const [x, rose] of [[199, false], [293, true]]) {
    out += rect(x - 1, 76, 2, 15, '#34484c') + rect(x - 12, 89, 24, 20, '#34484c') +
      rect(x - 10, 91, 20, 16, rose ? '#ab9980' : '#a3ae8d') +
      path(`M${x - 7} 98h14v4h-3v2h-8v-2h-3z`, '#4b6664') + rect(x - 5, 97, 10, 2, '#d4c08d') +
      rect(x - 3, 93, 1, 3, '#e0cf9e') + rect(x + 2, 94, 1, 2, '#e0cf9e');
  }
  out += lantern(75, 107) + lantern(173, 107) + lantern(331, 107) + lantern(431, 107);
  // All tall perimeter details end before the crossing and walking lanes.
  for (const x of [24, 485]) {
    out += rect(x - 4, 196, 10, 4, '#3e5658') + rect(x - 1, 141, 3, 56, '#334e57') + rect(x, 144, 1, 48, '#89978a') +
      rect(x - 8, 137, 17, 3, '#324b53');
    out += lantern(x, 144);
  }
  out += plant(19, 212, '#74796a') + plant(493, 208, '#777565');
  // Worn paving remains flat under the cat and both separate resident lanes.
  for (let row = 164; row < 303; row += 14) {
    const offset = row % 28 ? 0 : 16;
    out += rect(0, row, 512, 1, row < 224 ? '#697b78' : '#70827f');
    for (let x = offset; x < 512; x += 32) out += rect(x, row + 1, 1, Math.min(13, 303 - row - 1), '#697d7b');
  }
  out += rect(0, 222, 512, 2, '#909f91') + rect(0, 303, 512, 4, '#9caa99') + rect(0, 307, 512, 2, '#405c62');
  for (const [x, y] of [[68, 174], [131, 206], [284, 184], [402, 210], [55, 272], [219, 246], [365, 292], [464, 240]]) {
    out += rect(x, y, 10, 1, '#9ba89a') + rect(x + 13, y + 3, 4, 1, '#607776');
  }
  out += rect(37, 310, 33, 4, '#3b555b') + rect(443, 310, 33, 4, '#3b555b');
  for (const x of [40, 47, 54, 61, 446, 453, 460, 467]) out += rect(x, 310, 2, 3, '#869689');
  return svg(out);
}

export function neighborhoodPropSVG(prop = {}) {
  const frame = [0, 1, 2, 3].includes(prop.frame) ? prop.frame : 0;
  let out = '';
  if (prop.type === 'apartment-pan') {
    const pan = path('M3 7h10v2h6v3h-6v3H3v-2H1V9h2z', '#39494a') +
      rect(3, 8, 9, 5, '#83938b') + rect(4, 9, 7, 3, '#b4b8a1') + rect(14, 10, 4, 1, '#a99a79');
    const transforms = ['', 'rotate(45 10 10)', 'rotate(90 10 10)', 'translate(0 3)'];
    out = frame === 0 ? pan : `<g transform="${transforms[frame]}">${pan}</g>`;
    if (frame === 3) out += rect(2, 19, 14, 1, '#6f7669', ' opacity=".35"');
  } else if (prop.type === 'apartment-drip') {
    const tops = [3, 5, 7, 4];
    const y = tops[frame];
    out = path(`M9 ${y}h2v3h1v4h-1v2H9v-2H8v-4h1z`, '#699897') + rect(9, y + 3, 1, 4, '#c0d2bb');
    if (frame === 3) out += rect(4, 16, 3, 1, '#8db8ab') + rect(13, 17, 3, 1, '#8db8ab') + rect(9, 18, 3, 1, '#b4ceba');
  } else if (prop.type === 'market-steam') {
    const shift = frame % 2;
    const rise = frame > 1 ? 2 : 0;
    out = path(`M${5 + shift} ${17 - rise}v-4h-2V9h2V5h2v5H5v3h2v4z`, '#d6d4b4') +
      path(`M${12 - shift} ${19 - rise}v-5h2v-4h-2V6h2v3h2v6h-2v4z`, '#b8c6b1') +
      rect(7 + shift, 1 + rise, 2, 3, '#b8c6b1');
  } else if (prop.type === 'market-bowl') {
    out = rect(3, 17, 14, 2, '#425c5d', ' opacity=".45"') + path('M2 9h16v5h-3v3H5v-3H2z', '#5e7971') +
      rect(2, 8, 16, 3, '#c5c7a8') + rect(4, 9, 12, 2, '#b38e57') + rect(6, 8, 3, 2, '#e0bd7e') +
      rect(11, 9, 3, 2, '#80986c') + rect(5, 13, 10, 2, '#9fb39a');
  } else if (prop.type === 'market-critter') {
    const step = frame % 2;
    out = rect(3, 18, 15, 2, '#425c5d', ' opacity=".4"') +
      path('M3 12H1V6h2v4h3V9h8V6h2V3h2v4h1v7h-3v2H5v-2H3z', '#3d494b') +
      rect(5, 10, 10, 6, '#8e9589') + rect(7, 10, 3, 5, '#b5b7a1') + rect(13, 7, 5, 7, '#a7ac9b') +
      rect(16, 5, 1, 3, '#b59d87') + rect(16, 9, 2, 1, '#303a3d') + rect(18, 12, 2, 1, '#344346') +
      rect(step ? 4 : 6, 15, 3, step ? 3 : 4, '#586867') + rect(step ? 13 : 12, 15, 3, step ? 4 : 3, '#586867') +
      rect(1, 5, 2, 3, '#afb29b');
    if (frame >= 2) out += rect(14, 14, 6, 3, '#866744') + rect(15, 13, 5, 3, '#d3af76') + rect(17, 13, 1, 2, '#9c754d');
  }
  return svg(out, 20, 20);
}
