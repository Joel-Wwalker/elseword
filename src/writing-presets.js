const alphabet = Array.from('abcdefghijklmnopqrstuvwxyz');
const glyphMap = symbols => Object.freeze(Object.fromEntries(alphabet.map((letter, index) => [letter, Array.from(symbols)[index]])));

export const RUNE_GLYPHS = glyphMap('ᚨᛒᚲᛞᛖᚠᚷᚺᛁᛃᚴᛚᛗᚾᛟᛈᛩᚱᛋᛏᚢᚡᚹᛪᛦᛉ');

export const WRITING_PRESETS = Object.freeze([
  Object.freeze({ id: 'latin', name: 'Latin letters', description: 'Show words as letters. Your saved symbols are kept under My own symbols.' }),
  Object.freeze({ id: 'runes', name: 'Runic symbols', description: 'A letter-by-letter mapping using runic characters.', glyphs: RUNE_GLYPHS }),
  Object.freeze({ id: 'angular', name: 'Angular', description: 'Corners and crossed lines.', glyphs: glyphMap('┌┐└┘├┤┬┴┼╱╲╳╔╗╚╝╠╣╦╩╬═║─│≡') }),
  Object.freeze({ id: 'geometric', name: 'Geometric', description: 'Circles, triangles, and patterned squares.', glyphs: glyphMap('○●◎◉◇◆◈□■▣▤▥▦▧▨▩△▲▽▼◁◀▷▶◐◑') }),
  Object.freeze({ id: 'dotted', name: 'Dotted', description: 'Braille-pattern symbols, used here as a visual alphabet.', glyphs: glyphMap('⠁⠃⠉⠙⠑⠋⠛⠓⠊⠚⠅⠇⠍⠝⠕⠏⠟⠗⠎⠞⠥⠧⠺⠭⠽⠵') }),
]);

/** Presets are plain custom maps, so existing backups and cloud saves need no new format. */
export function applyWritingPreset(script, id) {
  const direction = script?.direction ?? 'ltr';
  const glyphs = script?.style === 'runes' ? { ...RUNE_GLYPHS, ...(script.glyphs ?? {}) } : { ...(script?.glyphs ?? {}) };
  if (id === 'latin') return { style: 'latin', direction, glyphs };
  if (id === 'custom') return { style: 'custom', direction, glyphs };
  const preset = WRITING_PRESETS.find(item => item.id === id);
  if (!preset) throw new Error('Choose a writing preset from the list.');
  return { style: id === 'runes' ? 'runes' : 'custom', direction, glyphs: id === 'runes' ? {} : { ...preset.glyphs } };
}

export function identifyWritingPreset(script) {
  if (!script?.style || script.style === 'latin') return 'latin';
  const glyphs = script.style === 'runes' ? { ...RUNE_GLYPHS, ...(script.glyphs ?? {}) } : script.glyphs ?? {};
  const entries = Object.entries(glyphs);
  return WRITING_PRESETS.find(preset => preset.glyphs && entries.length === alphabet.length && entries.every(([letter, glyph]) => preset.glyphs[letter] === glyph))?.id ?? 'custom';
}
