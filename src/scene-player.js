import { sampleCharacterIdle } from './scene-idle.js';
import { SCENES, CHARACTERS, getSceneEpisode, getSceneEpisodes, resolveSceneChoice } from './scenes.js';
import { renderWrittenSceneLine } from './scene-language.js';
import { getSceneLayout, getEpisodeTiming, sampleSceneLayout, shouldFlipCharacter } from './scene-layout.js';
import { TextAudio, isAudibleCharacter } from './text-audio.js';
import { sampleCamera, sampleAtmosphere } from './scene-direction.js';
import { sampleExpressions } from './scene-expressions.js';
import { resolveCharacterFace } from './character-faces.js';
import { faceMarkup } from './character-face-renderer.js';
import { episodeSoundEvents, crossedSoundEvents } from './scene-sound-events.js';

let facePlayerId = 0;

export const RAIN_CLIP_RECTS = [[27, 23, 330, 47], [27, 70, 58, 114], [296, 70, 61, 114], [27, 169, 330, 15]];

/** Authored grammar changes the speech; the exact original English remains its gloss. */
export function buildDialogue(scene, language) {
  let start = 0;
  const minimum = scene.episodeId && scene.episodeId !== 'original' ? 5000 : 2600;
  return scene.lines.map(line => {
    const translated = renderWrittenSceneLine(line, language);
    const reactionPause = Number.isInteger(line.reactionPauseMs) ? Math.max(0, Math.min(650, line.reactionPauseMs)) : 0;
    const duration = Math.max(minimum, [...translated.text].length * 43 + 1400) + reactionPause;
    const entry = { line, english: line.english, text: translated.text, tokens: translated.tokens, unknown: translated.unknown,
      start, duration, end: start + duration };
    start += duration;
    return entry;
  });
}

const rect = (x, y, w, h, fill) => `<path d="M${x} ${y}h${w}v${h}h-${w}Z" fill="${fill}"/>`;
const path = (d, fill) => `<path d="${d}" fill="${fill}"/>`;
const group = (x, y, body) => `<g transform="translate(${x} ${y})">${body}</g>`;
const svg = (body, kind = 'scene-room') => `<svg class="${kind}" viewBox="0 0 384 216" aria-hidden="true">${body}</svg>`;
const colors = { wood: '#9f7c60', light: '#d0ac7d', dark: '#483b47', sage: '#8d9c79', cream: '#d0c4a9' };

function plant(x, y, c = '#7f946d') {
  return group(x, y, path('M0 0h3v-17H0zM-2-9h-5v-4h-4v-7h4v4h4v5h1zM3-11h4v-5h5v-7H7v4H3z', c)
    + path('M-7 0h18v4H9v12H-5V4H-7Z', '#a27460') + rect(-4, 4, 3, 10, '#c49a74'));
}
function books(x, y, count = 8) {
  const shades = ['#877e9c', '#aa836b', '#81927e', '#c0ad87', '#776c88'];
  return Array.from({ length: count }, (_, i) => {
    const h = 12 + (i % 3) * 3;
    return rect(x + i * 7, y - h, 5, h, shades[i % shades.length])
      + rect(x + i * 7 + 1, y - h + 3, 3, 1, '#d3bda5');
  }).join('');
}
function shelf(x, y, w = 82, content = '') {
  return content + rect(x, y, w, 4, '#ae8c6e') + rect(x + 3, y + 4, w - 6, 2, '#453442');
}
function windowPane(x, y, w = 73, h = 39, night = false) {
  let view = rect(x, y, w, h, '#433745') + rect(x + 3, y + 3, w - 6, h - 6, night ? '#3c425f' : '#88a49a');
  view += rect(x + w - 20, y + 7, 8, 8, night ? '#d3c9b1' : '#dfd6a0');
  view += path(`M${x + 5} ${y + h - 14}h10v-6h12v8h11v-4h16v7h${w - 59}v5H${x + 5}Z`, night ? '#252a43' : '#53776a');
  view += rect(x + Math.floor(w / 2), y + 3, 3, h - 6, '#ae8a72') + rect(x + 3, y + Math.floor(h / 2), w - 6, 3, '#ae8a72');
  return view + rect(x - 3, y + h, w + 6, 4, '#caab83');
}
function indoor(wall = '#6b565d', floor = '#4b414e', trim = '#a17b77') {
  let out = rect(28, 23, 328, 174, '#302a36') + rect(32, 27, 320, 164, wall) + rect(38, 75, 308, 116, floor);
  for (let y = 76; y < 191; y += 20) out += rect(38, y, 308, 1, '#362f3e');
  for (let x = 39; x < 346; x += 24) out += rect(x, 75, 1, 116, '#3b3240');
  out += rect(32, 27, 320, 5, trim) + rect(32, 32, 6, 161, trim) + rect(346, 32, 6, 161, trim)
    + rect(38, 69, 308, 6, '#463743') + rect(38, 69, 308, 2, trim)
    + rect(28, 191, 328, 6, trim) + rect(28, 197, 328, 4, '#483746');
  for (let y = 38; y < 68; y += 15) out += rect(39, y, 307, 1, '#7d626c');
  return out;
}
function counter(x = 196, y = 103, w = 139, color = '#98705c') {
  let out = rect(x + 2, y + 5, w - 2, 28, '#342d39') + rect(x, y, w, 27, color);
  for (let i = 9; i < w - 20; i += 31) out += rect(x + i, y + 9, 24, 14, '#ad8364');
  return out + rect(x - 3, y - 7, w + 6, 8, '#c4a17d') + rect(x - 3, y - 7, w + 6, 2, '#dcc3a0');
}
function bench(x, y, w = 71, color = '#8a927f') {
  return rect(x + 4, y + 9, 5, 15, '#59464d') + rect(x + w - 9, y + 9, 5, 15, '#59464d')
    + rect(x, y, w, 10, color) + rect(x + 2, y, w - 4, 2, '#b2ae94') + rect(x, y + 8, w, 3, '#5b5e59');
}
function cafeTable(x, y) {
  return rect(x + 17, y + 10, 5, 21, '#615153') + rect(x + 9, y + 30, 22, 3, '#4b3d47')
    + path(`M${x + 4} ${y}h33v3h4v10h-4v3H${x + 4}v-3h-4V${y + 3}h4Z`, '#ad8a6b')
    + rect(x + 5, y + 1, 30, 2, '#d0ae83');
}
function city() {
  let out = rect(27, 23, 330, 135, '#242438');
  const blocks = [[34, 62, 42, 91], [82, 43, 36, 110], [124, 76, 51, 78], [181, 57, 37, 97], [225, 36, 49, 118], [281, 69, 67, 85]];
  for (const [x, y, w, h] of blocks) {
    out += rect(x, y, w, h, '#343044');
    for (let j = y + 10; j < y + h - 6; j += 17) for (let i = x + 7; i < x + w - 6; i += 13)
      out += rect(i, j, 4, 5, (i + j) % 3 ? '#625368' : '#b69b71');
  }
  return out;
}
const bakeryBackground = `<svg class="scene-room" viewBox="0 0 384 216" aria-hidden="true">
<defs><pattern id="tile" width="24" height="20" patternUnits="userSpaceOnUse"><path d="M0 0h24v20H0z" fill="#4b414e"/><path d="M0 0h24v1H0zM0 0h1v20H0z" fill="#3d3441"/><path d="M2 2h20v1H2z" fill="#544957" opacity=".6"/></pattern><g id="breadSmall"><path d="M0 5h2V2h3V0h13v2h4v3h2v7H0z" fill="#bd894e"/><path d="M2 5h2V3h16v2h2v5H2z" fill="#dfb66d"/><path d="M7 3h2v4H7zM13 3h2v4h-2zM19 5h2v3h-2z" fill="#f4d896"/></g><g id="plant"><path d="M0 0h4v-12H0zM-4-15h4v-5h-7v-5h-4v7h4v4h3zM4-15h4v-4h5v-7H8v4H4zM0-18h4v-14H0z" fill="#80976e"/><path d="M-9 0h22v3h-2v15H-7V3h-2z" fill="#a36e58"/><path d="M-7 3h16v3H-7zM-5 6h3v9h-3z" fill="#c78d66"/></g></defs>
<!-- A small cutaway room, drawn on a 384 by 216 pixel grid. -->
<path d="M28 23h328v174H28z" fill="#302a36"/><path d="M32 27h320v164H32z" fill="#6c535d"/><path d="M38 74h308v117H38z" fill="url(#tile)"/>
<path d="M32 27h320v5H32zM32 32h6v161h-6zM346 32h6v161h-6z" fill="#a27c78"/><path d="M38 69h308v7H38z" fill="#503e4b"/><path d="M38 69h308v2H38z" fill="#a8847d"/>
<path d="M38 32h308v4H38z" fill="#7c6069"/><path d="M39 38h307v1H39zM39 58h307v1H39z" fill="#785c65"/><path d="M94 37h1v20h-1zM177 37h1v20h-1zM260 37h1v20h-1zM55 59h1v10h-1zM138 59h1v10h-1zM221 59h1v10h-1zM304 59h1v10h-1z" fill="#795e66"/>
<!-- Window, afternoon sky, and distant blocky trees. -->
<path d="M64 35h82v39H64z" fill="#453a44"/><path d="M67 37h76v34H67z" fill="#c49676"/><path d="M70 40h70v28H70z" fill="#8ba39a"/><path d="M72 42h25v2H72zM73 44h15v2H73z" fill="#c5c5a2"/><path d="M123 43h9v9h-9z" fill="#e1d7a0"/><path d="M70 60h8v-5h9v-4h9v5h10v7h12v-8h8v-3h6v6h8v10H70z" fill="#607c6e"/><path d="M70 64h14v-3h12v4h17v-5h10v4h17v4H70z" fill="#45675d"/><path d="M103 40h4v28h-4zM70 54h70v3H70z" fill="#b1876e"/><path d="M61 72h88v5H61z" fill="#d0a17b"/><path d="M64 77h82v3H64z" fill="#453742"/>
<!-- Bread shelves and an old oven. -->
<path d="M188 44h88v3h-88zM191 47h3v21h-3zM270 47h3v21h-3z" fill="#342d36"/><path d="M185 41h94v4h-94z" fill="#b38b6c"/><path d="M185 45h94v2h-94z" fill="#76554b"/>
<g transform="translate(192 31) scale(.65)"><use href="#breadSmall"/><use href="#breadSmall" x="42"/><use href="#breadSmall" x="84"/></g>
<path d="M184 65h96v5h-96z" fill="#b38b6c"/><path d="M184 70h96v2h-96z" fill="#4b3640"/><path d="M194 53h12v11h-12z" fill="#a7a384"/><path d="M194 51h12v3h-12z" fill="#cec2a3"/><path d="M212 56h10v8h-10z" fill="#a98079"/><path d="M211 54h12v3h-12z" fill="#d1b5a1"/><path d="M230 52h13v12h-13z" fill="#848a78"/><path d="M230 50h13v3h-13z" fill="#b9b59b"/>
<path d="M299 42h35v45h-35z" fill="#433a48"/><path d="M302 45h29v10h-29z" fill="#81717f"/><path d="M305 48h3v3h-3zM313 48h3v3h-3zM321 48h5v3h-5z" fill="#c6af98"/><path d="M303 59h27v22h-27z" fill="#2e2934"/><path d="M307 63h19v12h-19z" fill="#8f6252"/><path d="M308 68h17v6h-17z" fill="#c68b58"/><path d="M310 78h14v2h-14z" fill="#afa1a1"/><path d="M296 86h41v5h-41z" fill="#2c2631"/>
<!-- A left doorway, bench, rug, and plants create a little environmental depth. -->
<path d="M36 92h8v58h-8z" fill="#211e28"/><path d="M38 95h5v49h-5z" fill="#53404d"/><path d="M42 95h4v49h-4z" fill="#af8c72"/><path d="M45 104h4v30h-4z" fill="#312a37"/>
<path d="M52 156h38v27H52z" fill="#352f3d"/><path d="M55 158h32v22H55z" fill="#817282"/><path d="M58 160h26v18H58z" fill="#5b4d64"/><path d="M59 165h23v2H59zM59 173h23v2H59z" fill="#7a687e"/>
<path d="M64 95h71v11H64zM68 106h5v14h-5zM126 106h5v14h-5z" fill="#644f4d"/><path d="M62 91h75v8H62z" fill="#99a28b"/><path d="M65 89h69v3H65z" fill="#b1b39a"/><path d="M64 99h71v3H64z" fill="#798577"/>
<g transform="translate(73 82) scale(.55)"><use href="#plant"/></g><g transform="translate(327 170) scale(.85)"><use href="#plant"/></g>
<path d="M95 155h29v4H95zM99 159h4v14h-4zM116 159h4v14h-4z" fill="#58444b"/><path d="M92 149h35v9H92z" fill="#a3816b"/><path d="M95 147h29v3H95z" fill="#c09b78"/>
<!-- Small pools of window light are solid limited-palette pixels. -->
<path d="M79 80h18v2H79zM87 82h18v2H87zM95 84h18v2H95zM103 86h18v2h-18z" fill="#a9a085" opacity=".14"/>
<path d="M148 177h8v2h-8zM159 184h3v2h-3zM288 179h7v2h-7zM292 175h3v2h-3z" fill="#645265"/>
<!-- Front walls keep the room feeling like a little place inside the dark. -->
<path d="M28 191h328v6H28z" fill="#a17b77"/><path d="M28 197h328v4H28zM28 27h4v170h-4zM352 27h4v170h-4z" fill="#4a3a49"/>
</svg>`;
const bakeryForeground = `<svg class="scene-front" viewBox="0 0 384 216" aria-hidden="true"><path d="M199 108h137v28H199z" fill="#3d2f3a"/><path d="M197 100h137v29H197z" fill="#97725d"/><path d="M201 105h128v2H201z" fill="#ba9271"/><path d="M201 108h128v18H201z" fill="#86604f"/><path d="M205 111h25v12h-25zM236 111h25v12h-25zM267 111h25v12h-25zM298 111h25v12h-25z" fill="#9a735b"/><path d="M194 94h143v9H194z" fill="#bd9a76"/><path d="M194 94h143v3H194z" fill="#dec09a"/><path d="M197 102h137v3H197z" fill="#705244"/><path d="M311 88h12v6h-12z" fill="#d2c4a7"/><path d="M311 87h13v2h-13z" fill="#e7ddc1"/><path d="M314 82h7v5h-7zM321 83h3v3h-3z" fill="#9bb29d"/><path d="M292 82h12v12h-12z" fill="#6c785e"/><path d="M295 85h6v2h-6zM295 89h5v1h-5z" fill="#c6c7a0"/></svg>`;

/** Room markup contains only local, hand-authored geometry, never user-supplied strings. */
export function renderRoom(id) {
  let background = '', foreground = '', ambient = '', rainLayer = '';
  const layout = getSceneLayout(id);
  if (id === 'bakery') return { background: bakeryBackground, foreground: bakeryForeground, ambient,
    positions: layout.positions };
  if (id === 'market') {
    background = rect(27, 23, 330, 174, '#6f7770') + rect(31, 27, 322, 116, '#90937e');
    background += rect(31, 122, 322, 72, '#70666a');
    for (let y = 128; y + 12 <= 194; y += 17) for (let x = 34 + (y % 2) * 11; x + 22 <= 353; x += 25)
      background += rect(x, y, 22, 12, (x + y) % 3 ? '#837574' : '#786c70');
    background += rect(45, 47, 91, 66, '#6b6263') + rect(51, 52, 79, 54, '#a39079') + windowPane(62, 61, 54, 34);
    background += rect(185, 47, 148, 8, '#66504f') + rect(188, 53, 4, 79, '#a18367') + rect(326, 53, 4, 79, '#a18367');
    for (let x = 182; x < 335; x += 17) background += rect(x, 45, 17, 19, x % 2 ? '#b99b7c' : '#867886');
    background += rect(182, 62, 153, 4, '#524451') + plant(56, 154) + plant(323, 169);
    background += shelf(56, 120, 70, rect(62, 109, 20, 10, '#b29b63') + rect(90, 109, 24, 10, '#889761'));
    foreground = counter(194, 107, 139, '#8c755f');
    for (let x = 261; x < 320; x += 32) foreground += rect(x, 96, 25, 7, '#5e544a') + rect(x + 3, 90, 6, 7, '#a2a46b') + rect(x + 11, 91, 7, 7, '#ba8b65');
  } else if (id === 'busstop') {
    background = city() + rect(27, 132, 330, 64, '#4d4c60') + rect(27, 184, 330, 12, '#333345') + rect(27, 184, 330, 3, '#879088');
    background += rect(81, 70, 224, 7, '#6a697b') + rect(86, 77, 5, 88, '#9b9696') + rect(291, 77, 5, 88, '#9b9696');
    background += rect(92, 79, 198, 61, '#626779') + rect(95, 82, 192, 55, '#586575');
    background += rect(185, 81, 4, 58, '#a09998') + bench(116, 145, 143, '#888080');
    background += rect(48, 72, 4, 94, '#93928c') + rect(38, 58, 25, 28, '#acb9a3') + rect(43, 65, 15, 11, '#546778') + rect(44, 77, 4, 3, '#546778') + rect(54, 77, 4, 3, '#546778');
    background += rect(255, 91, 22, 31, '#bbb6a3') + rect(258, 96, 15, 2, '#777480') + rect(258, 103, 15, 2, '#777480') + rect(258, 110, 10, 2, '#777480');
    background += rect(53, 175, 31, 2, '#7b8190') + rect(277, 170, 36, 2, '#7b8190');
    // The shelter blocks rain. Animate drops inside a fixed mask, not the mask itself.
    const rain = Array.from({ length: 34 }, (_, i) => rect(30 + (i * 73) % 320, 21 + (i * 37) % 160, 1, 7, '#a5b7c2')).join('');
    ambient = `<defs><clipPath id="rain-outside-shelter">${RAIN_CLIP_RECTS.map(bounds => rect(...bounds, '#fff')).join('')}</clipPath></defs><g clip-path="url(#rain-outside-shelter)"><g class="scene-rain-drops">${rain}</g></g>`;
    rainLayer = svg(rain, 'scene-ambient');
  } else if (id === 'library') {
    background = indoor('#655861', '#44424f', '#998583');
    for (const x of [51, 130, 209]) for (const y of [51, 72]) background += shelf(x, y, 70, books(x + 5, y, 9));
    background += windowPane(291, 37, 42, 39, true) + cafeTable(66, 137) + rect(72, 135, 15, 5, '#b9b39c');
    background += bench(104, 148, 34, '#82768f') + rect(47, 164, 17, 20, '#706b65') + books(49, 179, 2);
    foreground = counter(222, 113, 113, '#8b6d63') + books(306, 105, 3) + rect(275, 102, 20, 4, '#d2c3a1');
  } else if (id === 'cafe') {
    background = indoor('#86666d', '#55434e', '#b18b80') + windowPane(54, 37, 90, 40) + windowPane(161, 37, 47, 40);
    background += rect(271, 43, 52, 34, '#4c414b') + rect(275, 47, 44, 26, '#77757a') + rect(279, 52, 7, 6, '#bbb8a4') + rect(290, 52, 7, 6, '#bbb8a4') + rect(306, 54, 8, 12, '#35313c');
    background += shelf(226, 69, 33, rect(230, 60, 7, 9, '#acb8a0') + rect(244, 60, 7, 9, '#c3a393'));
    background += cafeTable(65, 126) + cafeTable(84, 156) + bench(52, 151, 23, '#8b8390') + plant(329, 172);
    foreground = counter(218, 111, 117, '#9d7766') + rect(292, 100, 8, 8, '#d2c7b2') + rect(302, 102, 3, 4, '#d2c7b2') + rect(247, 101, 25, 5, '#b69770');
  } else if (id === 'tickets') {
    background = indoor('#606674', '#494b59', '#979194') + rect(213, 35, 123, 100, '#403d4b') + rect(220, 43, 109, 79, '#696b76');
    background += rect(227, 50, 94, 58, '#3e424f') + rect(229, 51, 2, 55, '#a4a097') + rect(229, 51, 90, 2, '#a4a097');
    background += rect(56, 39, 126, 36, '#34343f') + rect(60, 43, 118, 28, '#222631');
    for (let y = 48; y < 68; y += 8) background += rect(66, y, 37, 2, '#b4b190') + rect(126, y, 18, 2, '#a6a185') + rect(155, y, 15, 2, '#89798e');
    background += bench(51, 117, 69, '#7e7f87') + rect(71, 152, 21, 27, '#706273') + rect(76, 147, 11, 5, '#9e8a8e') + rect(75, 157, 3, 17, '#9d8a8e');
    foreground = rect(216, 106, 117, 27, '#8a7e7f') + rect(214, 104, 121, 5, '#c1b1a0') + rect(241, 112, 58, 9, '#514752') + rect(227, 43, 3, 62, '#a5a197') + rect(319, 43, 3, 62, '#a5a197');
  } else if (id === 'rooftop') {
    background = city() + rect(50, 36, 2, 2, '#c3bba8') + rect(159, 30, 2, 2, '#c3bba8') + rect(206, 44, 2, 2, '#c3bba8') + rect(302, 32, 12, 12, '#c3beb3');
    background += rect(28, 119, 328, 78, '#52495b') + rect(28, 117, 328, 8, '#89808d') + rect(28, 125, 328, 4, '#3b3545');
    for (let x = 33; x < 350; x += 28) background += rect(x, 132, 1, 62, '#423a4d');
    for (let y = 145; y < 195; y += 24) background += rect(30, y, 324, 1, '#423a4d');
    background += rect(52, 91, 41, 42, '#786d7c') + rect(57, 96, 31, 37, '#302b3b') + rect(80, 112, 3, 3, '#9f997f');
    background += path('M285 151h4v-18h3v-6h12v4h-8v5h-4v15h4v3h-14v-3Z', '#a3a3a3') + rect(286, 122, 24, 8, '#7d8793') + rect(307, 120, 5, 12, '#bdbaa4');
    background += plant(325, 175, '#7e8b76') + bench(99, 166, 41, '#837882');
    ambient = rect(132, 48, 2, 2, '#e1d3b3') + rect(263, 29, 2, 2, '#e1d3b3') + rect(186, 50, 2, 2, '#e1d3b3');
  } else {
    background = indoor('#58505f', '#423c4d', '#8c7383') + windowPane(51, 37, 72, 42, true);
    for (let y = 48; y < 74; y += 23) {
      let bottles = '';
      for (let i = 0; i < 9; i++) {
        const x = 163 + i * 18, color = ['#879c87', '#9c829e', '#a7976d'][i % 3];
        bottles += rect(x + 2, y - 15, 4, 4, '#b0a28c') + rect(x, y - 11, 8, 11, color) + rect(x + 2, y - 6, 4, 3, '#d0bfa3');
      }
      background += shelf(156, y, 174, bottles);
    }
    background += plant(58, 171, '#788b73') + plant(83, 172, '#968ca0') + rect(89, 135, 39, 35, '#796455') + rect(86, 130, 45, 7, '#a18b6a');
    background += rect(103, 109, 10, 20, '#b9b192') + rect(106, 103, 4, 6, '#c2a679') + rect(107, 99, 2, 4, '#e0bd78');
    foreground = counter(207, 112, 127, '#7f675e') + rect(296, 99, 17, 8, '#8e9991') + rect(291, 96, 27, 4, '#b2b79d') + rect(301, 87, 5, 12, '#a5ab91');
  }
  return { background: svg(background), foreground: svg(foreground, 'scene-front'), ambient: svg(ambient, 'scene-ambient'), rainLayer, positions: layout.positions };
}

/** A background-only thumbnail without the player's positioning classes. */
export function renderSceneRoom(sceneId) {
  return renderRoom(sceneId).background.replace('class="scene-room"', '');
}

export function propSVG(type) {
  const shapes = {
    bread: path('M3 12h4V7h8V3h33v4h10v5h5v16h-4v5H8v-5H3Z', '#b78048')
      + path('M7 12h5V8h39v4h7v12h-5v4H12v-4H7Z', '#dfb46e')
      + rect(15, 7, 5, 13, '#f2d59b') + rect(29, 7, 5, 13, '#f2d59b') + rect(43, 8, 5, 13, '#f2d59b') + rect(9, 28, 48, 3, '#9c653e'),
    basket: path('M17 14h34v5h-3v16H20V19h-3Z', '#ac8b61') + path('M24 14V7h4V3h13v4h4v7h-3V8h-4V6H30v3h-3v5Z', '#d3b885') + rect(22, 23, 24, 2, '#79563d') + rect(22, 30, 24, 2, '#79563d'),
    umbrella: path('M29 17V8h3V4h5v3h2v9h-3V9h-3v10Z', '#c5b9aa')
      + path('M29 17h7l-8 49-7 4-3-5Z', '#8e819c')
      + path('M30 20h2l-8 44-3 3Z', '#ad9db8') + rect(20, 67, 7, 3, '#c5b9aa'),
    book: rect(20, 8, 26, 28, '#95809f') + rect(23, 8, 3, 28, '#62506b') + rect(29, 14, 12, 2, '#cfbda5') + rect(29, 20, 9, 2, '#cfbda5') + rect(23, 32, 23, 3, '#d6cdb0'),
    cup: rect(23, 12, 22, 20, '#c7bda3') + rect(45, 16, 7, 12, '#c7bda3') + rect(45, 19, 4, 6, '#51444e') + rect(25, 12, 18, 3, '#705a48') + rect(20, 33, 29, 3, '#a99b86'),
    ticket: rect(18, 14, 33, 17, '#d1c3a3') + rect(23, 18, 14, 2, '#807181') + rect(23, 24, 10, 2, '#807181') + rect(43, 16, 2, 13, '#aa927c'),
    star: path('M31 5h4v9h9v4h-9v9h-4v-9h-9v-4h9Z', '#d8cfab') + rect(29, 12, 8, 8, '#ede0bd'),
    bottle: rect(27, 5, 11, 5, '#b69b7b') + rect(28, 10, 9, 5, '#9da691') + path('M25 14h15v4h4v17H21V18h4Z', '#879d8c') + rect(24, 23, 17, 8, '#c2b99c') + rect(31, 25, 3, 4, '#787f70'),
  };
  return `<svg class="scene-prop" viewBox="0 0 66 ${type === 'umbrella' ? 76 : 40}" aria-hidden="true">${shapes[type] || shapes.bread}</svg>`;
}

const icons = {
  pause: '<path d="M2 1h3v10H2zm5 0h3v10H7Z"/>',
  play: '<path d="M2 1h2v2h3v2h3v2H7v2H4v2H2Z"/>',
  replay: '<path d="M3 1h6v2H3ZM1 3h2v6H1ZM3 9h6v2H3ZM9 3h2v6H9ZM0 0h2v5h4V3H2Z"/>',
};
const icon = name => `<svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">${icons[name]}</svg>`;
const steamSVG = `<svg class="scene-steam" viewBox="0 0 18 16" aria-hidden="true"><path d="M1 15v-4h2V7H1V3h2V0h2v4H3v3h2v5H3v3ZM8 14v-4h2V6H8V2h2v4h2v5h-2v3ZM14 16v-5h2V8h-2V4h2v4h2v4h-2v4Z" fill="#ddd4c2"/></svg>`;

export class ScenePlayer {
  constructor(container, { getLanguage, onLine = () => {}, onEnd = () => {}, onEpisodeChange = () => {}, onWordSelect = () => {}, textAudio } = {}) {
    if (!container || typeof getLanguage !== 'function') throw new TypeError('ScenePlayer needs a container and getLanguage callback.');
    this.container = container;
    this.getLanguage = getLanguage;
    this.onLine = onLine;
    this.onEnd = onEnd;
    this.onEpisodeChange = onEpisodeChange;
    this.onWordSelect = onWordSelect;
    this.motion = matchMedia('(prefers-reduced-motion: reduce)');
    this.paused = this.motion.matches;
    this.speed = 1;
    this.english = true;
    this.textAudio = textAudio || new TextAudio();
    this.ownsTextAudio = !textAudio;
    this.sound = this.textAudio.enabled;
    this.visible = false;
    this.elapsed = 0;
    this.lastTime = 0;
    this.reducedAudioLine = null;
    this.destroyed = false;
    this.abort = new AbortController();
    this.container.innerHTML = `<div class="world-player">
      <div class="scene-toolbar"><span class="scene-location"></span><span class="scene-status"></span></div>
      <div class="scene-conversation"><span class="scene-episode"></span><button class="scene-control scene-episode-next" type="button" aria-label="Next conversation">Next ›</button></div>
      <div class="scene-viewport" role="img"></div><div class="scene-dialogue-wrap"><div class="scene-dialogue"><div class="scene-speaker"></div><p class="scene-text"></p><p class="scene-translation"></p><p class="scene-sr-only scene-accessible" aria-live="polite" aria-atomic="true"></p><button class="scene-next" type="button" aria-label="Reveal dialogue or continue to next line">▾</button></div><div class="scene-choices" role="group" aria-label="Choose a reply" hidden><p class="scene-choice-prompt"></p><div class="scene-choice-options"></div></div><p class="scene-word-hint">Click a word to edit it.</p><div class="scene-progress-track"><div class="scene-progress"></div></div><div class="scene-controls"><div class="scene-playback"><button class="scene-control scene-pause" type="button">${icon('pause')}<span>PAUSE</span></button><button class="scene-control scene-replay" type="button">${icon('replay')}REPLAY</button><label class="scene-speed-label"><span class="scene-sr-only">Playback speed</span><select class="scene-speed" aria-label="Playback speed"><option value="0.75">0.75×</option><option value="1" selected>1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label></div><div class="scene-options"><button class="scene-control scene-sound" type="button" data-text-sound-toggle aria-pressed="false" aria-label="Enable text sounds" title="Text sound effects">SFX OFF</button><button class="scene-control scene-english" type="button" aria-pressed="true"><span class="scene-checkbox" aria-hidden="true"></span>ENGLISH</button></div></div></div></div>`;
    this.el = Object.fromEntries(['viewport', 'location', 'status', 'speaker', 'text', 'translation', 'accessible', 'next', 'progress', 'pause', 'replay', 'speed', 'sound', 'english'].map(name => [name, container.querySelector(`.scene-${name}`)]));
    this.el.episode = container.querySelector('.scene-episode');
    this.el.episodeNext = container.querySelector('.scene-episode-next');
    this.el.conversation = container.querySelector('.scene-conversation');
    this.el.choices = container.querySelector('.scene-choices');
    this.el.choicePrompt = container.querySelector('.scene-choice-prompt');
    this.el.choiceOptions = container.querySelector('.scene-choice-options');
    this.unsubscribeAudio = this.textAudio.subscribe(({ enabled }) => {
      this.sound = enabled;
      this.syncControls();
    });
    const listen = (el, type, callback) => el.addEventListener(type, callback, { signal: this.abort.signal });
    listen(this.el.pause, 'click', () => this.paused ? this.play() : this.pause());
    listen(this.el.replay, 'click', () => this.replay());
    listen(this.el.next, 'click', () => this.next());
    listen(this.el.episodeNext, 'click', () => this.nextEpisode());
    listen(this.el.speed, 'change', () => this.setSpeed(this.el.speed.value));
    listen(this.el.english, 'click', () => this.setEnglish(!this.english));
    listen(this.el.sound, 'click', () => this.setSound(!(this.sound && this.textAudio.ready)));
    listen(this.el.text, 'focusin', () => this.textAudio.stop());
    listen(document, 'visibilitychange', () => {
      this.lastTime = 0;
      if (document.hidden) this.textAudio.stop();
    });
    listen(this.motion, 'change', () => { if (this.motion.matches) this.pause(); this.render(); });
    this.resize = new ResizeObserver(() => this.render());
    this.resize.observe(this.el.viewport);
    this.intersection = new IntersectionObserver(entries => {
      this.visible = entries[0].isIntersecting;
      this.lastTime = 0;
      if (!this.visible) this.textAudio.stop();
    });
    this.intersection.observe(this.el.viewport);
    this.setScene(SCENES[0].id);
    this.tick = now => {
      if (this.destroyed) return;
      if (this.lastTime && !this.paused && !this.awaitingChoice && !this.hasWordFocus() && !document.hidden && this.visible) {
        this.elapsed += Math.min(now - this.lastTime, 100) * this.speed;
        const ended = this.elapsed >= this.duration;
        if (ended) {
          this.textAudio.stop();
          this.elapsed %= this.duration;
          this.resetChoice();
          this.previousIndex = -1;
          this.revealed = false;
          this.onEnd({ sceneId: this.scene.id });
        }
        this.render({ audible: !ended });
      }
      this.lastTime = now;
      this.frame = requestAnimationFrame(this.tick);
    };
    this.frame = requestAnimationFrame(this.tick);
  }

  setScene(sceneId, castIds, episodeId = 'original') {
    const locationIndex = SCENES.findIndex(item => item.id === sceneId);
    if (locationIndex < 0) throw new RangeError(`Unknown scene: ${sceneId}`);
    this.textAudio?.stop();
    const currentCast = this.scene?.id === sceneId ? this.cast.map(character => character.id) : null;
    const scene = getSceneEpisode(sceneId, episodeId);
    this.baseScene = scene;
    this.scene = scene;
    this.choiceId = null;
    this.awaitingChoice = false;
    this.choiceNodes = null;
    if (this.el.choices) this.el.choices.hidden = true;
    this.room = renderRoom(scene.id);
    this.el.location.textContent = `${String(locationIndex + 1).padStart(2, '0')} / ${scene.location.toUpperCase()}`;
    this.el.episode.textContent = `${scene.title} · ${scene.episodeIndex + 1}/${scene.episodeCount}${scene.choice ? ' · 2 replies' : ''}`;
    this.el.conversation.hidden = scene.episodeCount < 2;
    this.el.episodeNext.hidden = scene.episodeCount < 2;
    this.el.viewport.innerHTML = `<div class="scene-shot">${this.room.background}<div class="scene-sprite scene-character-1" aria-hidden="true"></div><div class="scene-sprite scene-character-0" aria-hidden="true"></div>${this.room.foreground}${propSVG(scene.prop)}${scene.animation.type === 'cold-tea' ? steamSVG : ''}${this.room.ambient || ''}<svg class="scene-impact" viewBox="0 0 384 216" aria-hidden="true"></svg></div>`;
    this.shot = this.el.viewport.querySelector('.scene-shot');
    this.impact = this.el.viewport.querySelector('.scene-impact');
    this.el.viewport.dataset.location = scene.id;
    this.el.viewport.dataset.episode = scene.episodeId;
    this.sprites = [this.el.viewport.querySelector('.scene-character-0'), this.el.viewport.querySelector('.scene-character-1')];
    this.faceId ??= ++facePlayerId;
    this.prop = this.el.viewport.querySelector('.scene-prop');
    this.ambient = this.el.viewport.querySelector('.scene-ambient');
    this.rainDrops = this.el.viewport.querySelector('.scene-rain-drops');
    this.steam = this.el.viewport.querySelector('.scene-steam');
    this.elapsed = 0;
    this.lastTime = 0;
    this.dialogue = null;
    this.previousIndex = -1;
    this.visibleChars = 0;
    this.revealed = false;
    this.cast = [];
    this.setCast(castIds || currentCast || scene.characters, false);
    this.refresh();
    this.syncControls();
  }

  nextEpisode() {
    const episodes = getSceneEpisodes(this.scene.id);
    if (episodes.length < 2) return;
    const next = episodes[(this.scene.episodeIndex + 1) % episodes.length];
    this.setScene(this.scene.id, this.cast.map(character => character.id), next.id);
    this.onEpisodeChange({ sceneId: this.scene.id, episodeId: this.scene.episodeId });
  }

  setCast(castIds, render = true) {
    if (!Array.isArray(castIds) || castIds.length !== 2) throw new TypeError('Choose two cast members.');
    const cast = castIds.map(id => CHARACTERS.find(character => character.id === id));
    if (cast.some(character => !character)) throw new RangeError('Unknown cast member.');
    this.cast = cast;
    cast.forEach((character, i) => {
      this.sprites[i].style.backgroundImage = `url("${new URL(character.atlas, globalThis.document?.baseURI || import.meta.url).href}")`;
      this.sprites[i].style.left = `${this.room.positions[i][0] / 384 * 100}%`;
      this.sprites[i].style.top = `${this.room.positions[i][1] / 216 * 100}%`;
    });
    this.el.viewport.setAttribute('aria-label', `${this.scene.description} ${cast.map(character => `${character.name}: ${character.description}`).join(' ')}`);
    if (render) { this.textAudio?.stop(); this.previousIndex = -1; this.render(); }
  }

  refresh() {
    this.textAudio?.stop();
    const oldIndex = Math.max(0, this.dialogue?.findIndex(entry => this.elapsed < entry.end) ?? 0);
    const oldEntry = this.dialogue?.[oldIndex];
    const fraction = oldEntry ? Math.max(0, Math.min(1, (this.elapsed - oldEntry.start) / oldEntry.duration)) : 0;
    this.scene = resolveSceneChoice(this.baseScene || this.scene, this.choiceId);
    this.dialogue = buildDialogue(this.scene, this.getLanguage());
    this.timing = getEpisodeTiming(this.scene, this.dialogue);
    this.soundEvents = episodeSoundEvents(this.scene, this.timing);
    this.duration = this.dialogue.at(-1).end;
    const entry = this.dialogue[Math.min(oldIndex, this.dialogue.length - 1)];
    this.elapsed = this.awaitingChoice ? this.dialogue[this.scene.choice.afterLine].end - 1
      : Math.min(entry.end - 1, entry.start + fraction * entry.duration);
    this.choiceNodes = null;
    this.previousIndex = -1;
    this.visibleChars = 0;
    this.render();
  }

  play() { this.paused = false; this.lastTime = 0; this.reducedAudioLine = null; this.syncControls(); }
  pause() { this.paused = true; this.lastTime = 0; this.textAudio?.stop(); this.syncControls(); }
  hasWordFocus() {
    return typeof document !== 'undefined' && document.activeElement && this.el.text.contains(document.activeElement);
  }

  resetChoice() {
    this.choiceId = null;
    this.awaitingChoice = false;
    this.choiceNodes = null;
    if (this.el.choices) this.el.choices.hidden = true;
    if (this.baseScene?.choice) {
      this.scene = this.baseScene;
      this.dialogue = buildDialogue(this.scene, this.getLanguage());
      this.timing = getEpisodeTiming(this.scene, this.dialogue);
      this.soundEvents = episodeSoundEvents(this.scene, this.timing);
      this.duration = this.dialogue.at(-1).end;
    }
  }

  enterChoice(focus = false) {
    if (!this.scene.choice || this.choiceId) return;
    this.awaitingChoice = true;
    this.elapsed = this.dialogue[this.scene.choice.afterLine].end - 1;
    this.revealed = true;
    this.lastTime = 0;
    this.textAudio?.stop();
    this.renderChoices();
    this.syncControls();
    if (focus) this.choiceNodes?.[0]?.button.focus();
  }

  chooseReply(id) {
    if (!this.awaitingChoice || !this.scene.choice?.options.some(option => option.id === id)) return;
    this.textAudio?.stop();
    this.choiceId = id;
    this.awaitingChoice = false;
    this.scene = resolveSceneChoice(this.baseScene, id);
    this.dialogue = buildDialogue(this.scene, this.getLanguage());
    this.timing = getEpisodeTiming(this.scene, this.dialogue);
    this.soundEvents = episodeSoundEvents(this.scene, this.timing);
    this.duration = this.dialogue.at(-1).end;
    this.elapsed = this.dialogue[this.scene.choice.afterLine + 1].start;
    this.previousIndex = -1;
    this.visibleChars = 0;
    this.revealed = false;
    this.lastTime = 0;
    this.render();
    this.syncControls();
    this.el.next.focus();
  }

  replayLine() {
    this.textAudio?.stop();
    const index = Math.max(0, this.index ?? 0);
    this.awaitingChoice = false;
    this.elapsed = this.dialogue[index].start;
    this.previousIndex = -1;
    this.visibleChars = 0;
    this.revealed = false;
    this.lastTime = 0;
    this.render();
    this.syncControls();
  }

  renderChoices() {
    if (!this.el.choices) return;
    this.el.choices.hidden = !this.awaitingChoice;
    if (!this.awaitingChoice) return;
    if (!this.choiceNodes) {
      this.el.choicePrompt.textContent = this.scene.choice.prompt || 'What do you say?';
      this.el.choiceOptions.innerHTML = this.scene.choice.options.map((_, i) => `<button class="scene-reply" type="button" data-reply="${i}"><span class="scene-reply-text"></span><span class="scene-reply-english"></span></button>`).join('');
      this.choiceNodes = this.scene.choice.options.map((option, i) => {
        const button = this.el.choiceOptions.querySelector(`[data-reply="${i}"]`);
        const text = button.querySelector('.scene-reply-text');
        const english = button.querySelector('.scene-reply-english');
        const language = this.getLanguage();
        const line = renderWrittenSceneLine(option.lines[0], language);
        text.setAttribute('dir', language.script?.direction === 'rtl' ? 'rtl' : 'ltr');
        text.textContent = line.text;
        english.textContent = line.english;
        button.addEventListener('click', () => this.chooseReply(option.id));
        return { button, text, english };
      });
    }
    for (const node of this.choiceNodes) node.english.hidden = !this.english;
  }

  buildTextParts(entry) {
    this.el.text.setAttribute('dir', this.getLanguage().script?.direction === 'rtl' ? 'rtl' : 'ltr');
    const letters = [...entry.text];
    const parts = [{ text: '* ', start: -2, end: 0 }];
    let cursor = 0;
    for (const token of entry.tokens ?? []) {
      if (token.kind !== 'word') continue;
      if (token.start > cursor) parts.push({ text: letters.slice(cursor, token.start).join(''), start: cursor, end: token.start });
      parts.push({ text: letters.slice(token.start, token.end).join(''), start: token.start, end: token.end, token });
      cursor = token.end;
    }
    if (cursor < letters.length) parts.push({ text: letters.slice(cursor).join(''), start: cursor, end: letters.length });
    this.el.text.innerHTML = parts.map((part, i) => part.token
      ? `<button type="button" class="scene-word" data-scene-fragment="${i}" disabled aria-hidden="true"></button>`
      : `<span data-scene-fragment="${i}" aria-hidden="true"></span>`).join('');
    this.textParts = parts.map((part, i) => {
      const node = this.el.text.querySelector(`[data-scene-fragment="${i}"]`);
      if (part.token) {
        node.addEventListener('click', () => { if (!node.disabled) this.onWordSelect?.(part.token); });
      }
      return { ...part, node };
    });
  }

  renderTextParts(chars) {
    for (const part of this.textParts ?? []) {
      const visible = part.start < 0 ? part.text : [...part.text].slice(0, Math.max(0, chars - part.start)).join('');
      if (part.node.textContent !== visible) part.node.textContent = visible;
      if (part.token) {
        const complete = chars >= part.end;
        part.node.disabled = !complete;
        part.node.setAttribute('aria-hidden', String(!complete));
        if (complete) part.node.setAttribute('aria-label', `${part.text}: inspect word`);
      }
    }
  }
  replay() {
    this.textAudio?.stop();
    this.resetChoice();
    this.elapsed = 0;
    this.previousIndex = -1;
    this.visibleChars = 0;
    this.revealed = false;
    this.paused = this.motion.matches;
    this.lastTime = 0;
    this.render();
    this.syncControls();
  }
  setSpeed(n) {
    const speed = Number(n);
    if (!Number.isFinite(speed)) return;
    this.speed = Math.max(0.5, Math.min(2, speed));
    if ([...this.el.speed.options].some(option => Number(option.value) === this.speed)) this.el.speed.value = String(this.speed);
  }
  setEnglish(bool) {
    this.english = Boolean(bool);
    this.el.translation.hidden = !this.english;
    this.el.english.setAttribute('aria-pressed', String(this.english));
    this.renderChoices();
    if (this.current) this.el.accessible.textContent = `${this.cast[this.current.line.speaker].name}: ${this.current.text}${this.english ? ` — ${this.current.english}` : ''}`;
  }
  setSound(bool) {
    this.textAudio.setEnabled(Boolean(bool));
    if (this.textAudio.enabled) void this.textAudio.unlock();
  }
  next() {
    this.textAudio?.stop();
    if (this.awaitingChoice) { this.choiceNodes?.[0]?.button.focus(); return; }
    if (!this.revealed && this.visibleChars < [...this.current.text].length) {
      this.revealed = true;
      this.render();
      return;
    }
    if (this.scene.choice && !this.choiceId && this.index === this.scene.choice.afterLine) {
      this.enterChoice(true); this.render(); return;
    }
    const next = this.dialogue[this.index + 1];
    if (!next) { this.onEnd({ sceneId: this.scene.id }); this.resetChoice(); }
    this.elapsed = next ? next.start : 0;
    this.previousIndex = -1;
    this.visibleChars = 0;
    this.revealed = false;
    this.render();
  }

  syncControls() {
    this.container.querySelector('.world-player').classList.toggle('scene-paused', this.paused);
    this.el.pause.innerHTML = `${icon(this.paused ? 'play' : 'pause')}<span>${this.paused ? 'RESUME' : 'PAUSE'}</span>`;
    this.el.pause.setAttribute('aria-label', this.paused ? 'Resume scene' : 'Pause scene');
    this.el.status.textContent = this.awaitingChoice ? 'YOUR REPLY' : this.paused ? 'SCENE PAUSED' : 'SCENE PLAYING';
    const supported = this.textAudio?.supported !== false;
    const enabled = this.sound && supported;
    const active = enabled && this.textAudio?.ready === true;
    this.el.sound.textContent = enabled ? (active ? 'SFX ON' : 'Enable sound') : 'SFX OFF';
    this.el.sound.setAttribute('aria-label', active ? 'Mute text sounds' : 'Enable text sounds');
    this.el.sound.setAttribute('aria-pressed', String(active));
    this.el.sound.disabled = !supported;
    this.el.sound.title = !supported ? 'Text sounds are unavailable in this browser' : enabled && !active ? 'Click to start text sounds.' : 'Text sound effects';
  }

  render({ audible = false } = {}) {
    if (!this.dialogue || this.destroyed) return;
    const gate = this.scene.choice && !this.choiceId ? this.dialogue[this.scene.choice.afterLine].end : Infinity;
    if (this.elapsed >= gate) this.enterChoice();
    const t = this.elapsed;
    const index = Math.max(0, this.dialogue.findIndex(entry => t < entry.end));
    const current = this.dialogue[index], speaker = this.cast[current.line.speaker];
    this.index = index;
    this.current = current;
    if (index !== this.previousIndex) {
      this.previousIndex = index;
      this.revealed = false;
      this.visibleChars = 0;
      this.el.speaker.textContent = `${speaker.name.toUpperCase()} · ${speaker.title.toUpperCase()}`;
      this.el.speaker.style.color = speaker.color;
      this.el.translation.textContent = current.english;
      this.el.accessible.textContent = `${speaker.name}: ${current.text}${this.english ? ` — ${current.english}` : ''}`;
      this.buildTextParts(current);
      this.onLine({ speaker, english: current.english, text: current.text, progress: t / this.duration, index });
    }
    const letters = [...current.text];
    const chars = this.motion.matches || this.revealed ? letters.length
      : Math.min(letters.length, Math.max(0, Math.floor((t - current.start) / 43)));
    if (audible && !this.revealed && !this.paused && this.visible
      && !document.hidden && this.sound && this.textAudio?.supported) {
      if (this.motion.matches) {
        // Reduced motion keeps text instant, but explicit playback still voices
        // each line once. Redraws must not restart or truncate its short burst.
        if (this.reducedAudioLine !== current && this.textAudio.ready) {
          this.reducedAudioLine = current;
          this.textAudio.playText(current.text, { voiceId: speaker.id, maxDuration: (current.end - t) / this.speed });
        }
      } else {
        for (const character of letters.slice(this.visibleChars, chars)) {
          if (isAudibleCharacter(character)) this.textAudio.blip(character, speaker.id);
        }
      }
    }
    if (audible && !this.paused && !this.awaitingChoice && this.visible && !this.hasWordFocus()
      && !document.hidden && this.sound && this.textAudio?.ready) {
      this.textAudio.setAmbience?.(this.scene.id, t);
      for (const event of crossedSoundEvents(this.soundEvents ?? [], this.effectTime, t, {reduced:this.motion.matches})) {
        this.textAudio.effect?.(event.effect);
      }
    }
    // Silent renders mark seeks/rebuilds too, so skipped cues never become a backlog.
    this.effectTime = t;
    this.visibleChars = chars;
    this.renderTextParts(chars);
    this.renderChoices();
    this.el.next.classList.toggle('scene-next-ready', chars >= letters.length);
    this.el.next.setAttribute('aria-label', this.awaitingChoice ? 'Choose a reply' : chars >= letters.length ? 'Next dialogue line' : 'Reveal complete dialogue');
    const reduced = this.motion.matches;
    const layout = sampleSceneLayout(this.scene.id, { ...this.timing, time: t, reduced });
    const original = this.timing.episodeType === 'original';
    const waiting = this.timing.episodeType === 'cold-tea' && t >= this.timing.coolStart;
    const alternateEnding = this.choiceId && this.scene.choice?.options.findIndex(option => option.id === this.choiceId) > 0
      && index === this.dialogue.length - 1;
    const customerPose = alternateEnding && current.line.speaker !== 0 ? 3 : waiting ? 0 : layout.characters[0].reacting ? 3 : layout.walking ? (layout.step && this.cast[0].id !== 'kiln' ? 2 : 0)
      : current.line.speaker === 0 ? 1 : 0;
    // Kiln alone has an offering pose in column 2; the other atlases use it for walking.
    const returningBook = this.timing.episodeType === 'lost-property' && t >= this.timing.returnStart && t < this.timing.returnStart + 1100;
    const secondPose = alternateEnding && current.line.speaker !== 1 ? 3 : waiting ? 0 : layout.characters[1].reacting ? 3
      : (original && index === 1 || returningBook) && this.cast[1].id === 'kiln' ? 2
      : current.line.speaker === 1 || returningBook ? 1 : 0;
    const expressions = sampleExpressions({ time: t, start: current.start, speaker: current.line.speaker,
      expressions: current.line.expressions, reactionTimes: layout.reactionTimes });
    this.sprites.forEach((sprite, i) => {
      sprite.dataset.expression = expressions[i];
      const pose = i ? secondPose : customerPose, faceKey = `${this.cast[i].id}:${pose}:${expressions[i]}`;
      if (sprite.faceKey !== faceKey) {
        sprite.innerHTML = faceMarkup(resolveCharacterFace(this.cast[i].id, pose, expressions[i]),
          `scene-face-${this.faceId}-${i}`, globalThis.document?.baseURI || import.meta.url);
        sprite.faceKey = faceKey;
      }
      sprite.style.backgroundPosition = `${pose * 100 / 3}% ${this.cast[i].row * 100}%`;
      sprite.style.left = `${layout.characters[i].x / 384 * 100}%`;
      sprite.style.top = `${layout.characters[i].y / 216 * 100}%`;
      const direction = shouldFlipCharacter(this.cast[i].row, i) ? -1 : 1;
      let quietSince = layout.idleAfter[i];
      for (const entry of this.dialogue) if (entry.start <= t && entry.line.speaker === i) {
        quietSince = Math.max(quietSince, entry.start + [...entry.text].length * 43);
      }
      const idle = sampleCharacterIdle(this.cast[i].id, t, { quietSince, reduced });
      sprite.style.transform = `rotate(${(layout.characters[i].lean ?? 0) + idle.lean * (i ? -1 : 1)}deg) scaleX(${direction * (layout.characters[i].turnScale ?? 1)}) scaleY(${idle.scaleY})`;
    });
    const camera = sampleCamera({ time: t, speaker: current.line.speaker, previousSpeaker: this.dialogue[Math.max(0, index - 1)].line.speaker,
      lineStart: current.start, impact: layout.impact, reduced });
    this.shot.style.transform = `translate(${camera.x / 384 * 100}%, ${camera.y / 216 * 100}%) scale(${camera.scale})`;
    this.impact.innerHTML = layout.effects.map(mark => `<path d="M${mark.x} ${mark.y}h${mark.width}v${mark.height}h-${mark.width}Z" fill="${mark.color}" opacity="${mark.opacity}"/>`).join('');
    this.prop.style.left = `${layout.prop.x / 384 * 100}%`;
    this.prop.style.top = `${layout.prop.y / 216 * 100}%`;
    this.prop.style.width = `${layout.prop.width / 384 * 100}%`;
    this.prop.style.height = `${layout.prop.height / 216 * 100}%`;
    this.prop.style.opacity = String(layout.prop.opacity);
    this.prop.style.zIndex = String(layout.prop.zIndex);
    if (this.steam && layout.steam) {
      this.steam.style.left = `${layout.steam.x / 384 * 100}%`;
      this.steam.style.top = `${layout.steam.y / 216 * 100}%`;
      this.steam.style.width = `${layout.steam.width / 384 * 100}%`;
      this.steam.style.height = `${layout.steam.height / 216 * 100}%`;
      this.steam.style.opacity = String(layout.steam.opacity);
    }
    if (this.ambient) {
      const atmosphere = sampleAtmosphere(this.scene.id, t, { reduced });
      this.ambient.style.opacity = String(atmosphere.opacity);
      if (this.rainDrops) this.rainDrops.setAttribute('transform', `translate(${atmosphere.x} ${atmosphere.y})`);
    }
    this.el.progress.style.transform = `scaleX(${t / this.duration})`;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.frame);
    this.abort.abort();
    this.resize.disconnect();
    this.intersection.disconnect();
    this.unsubscribeAudio?.();
    this.textAudio?.stop();
    if (this.ownsTextAudio) this.textAudio.destroy();
    this.container.replaceChildren();
  }
}
