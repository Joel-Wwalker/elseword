const keyFor = value => String(value ?? '').normalize('NFC').toLocaleLowerCase('en-US');
export const GRAMMAR_MARKERS = ['plural', 'past', 'future', 'negative', 'question'];

/** Inventories can contain overlapping multi-letter sounds, so try every segmentation. */
export function usesSoundInventory(value, sounds) {
  const decomposed = value => [...String(value ?? '').normalize('NFD')].map(letter => letter.toLocaleLowerCase('en-US')).join('');
  const text = decomposed(value), soundsInUse = [...sounds.consonants, ...sounds.vowels].map(decomposed).filter(Boolean);
  const reachable = new Set([0]);
  for (let offset = 0; offset < text.length; offset++) {
    if (!reachable.has(offset)) continue;
    for (const sound of soundsInUse) if (text.startsWith(sound, offset)) reachable.add(offset + sound.length);
  }
  return reachable.has(text.length);
}

export function incompatibleMarkers(language) {
  return GRAMMAR_MARKERS.filter(key => !usesSoundInventory(language.grammar[key], language.sounds));
}

function distinctCapacity(sounds, limit = 10000) {
  const combinationsPerSyllable = sounds.patterns.reduce((sum, pattern) => sum + [...pattern].reduce((count, slot) => count * sounds[slot === 'C' ? 'consonants' : 'vowels'].length, 1), 0);
  let combinationUpperBound = 0;
  for (let size = sounds.minSyllables; size <= sounds.maxSyllables; size++) combinationUpperBound += combinationsPerSyllable ** size;
  // Counting combinations is cheap; enumerating a large space is not. Never
  // present this upper bound as the number of distinct or permitted spellings.
  if (combinationUpperBound > limit) return { capacity: null, combinationUpperBound };
  const syllables = new Set();
  for (const pattern of sounds.patterns) {
    let partial = [''];
    for (const slot of pattern) partial = partial.flatMap(prefix => sounds[slot === 'C' ? 'consonants' : 'vowels'].map(sound => prefix + sound));
    partial.forEach(value => syllables.add(value));
  }
  const { initial = [], final = [], forbidden = [] } = sounds.rules ?? {};
  const allowed = value => (!initial.length || initial.some(sound => value.startsWith(sound)))
    && (!final.length || final.some(sound => value.endsWith(sound))) && !forbidden.some(sound => value.includes(sound));
  let partial = new Set(['']);
  const spellings = new Set();
  for (let size = 1; size <= sounds.maxSyllables; size++) {
    partial = new Set([...partial].flatMap(prefix => [...syllables].map(syllable => prefix + syllable)));
    if (size >= sounds.minSyllables) for (const word of partial) {
      const normalized = word.normalize('NFC');
      if (allowed(normalized)) spellings.add(keyFor(normalized));
    }
  }
  return { capacity: spellings.size, combinationUpperBound };
}

/** Explain actual homonyms, without treating linked verb forms as separate words. */
export function generationDiagnostics(language) {
  const groups = new Map();
  const byId = new Map(language.words.map(word => [word.id, word]));
  for (const entry of language.words) {
    if (entry.family?.kind === 'alias' && keyFor(entry.word) === keyFor(byId.get(entry.family.rootId)?.word)) continue;
    const key = keyFor(entry.word);
    if (!groups.has(key)) groups.set(key, { word: entry.word, meanings: [] });
    groups.get(key).meanings.push(entry.english);
  }
  const collisions = [...groups.values()].filter(group => group.meanings.length > 1);
  return { ...distinctCapacity(language.sounds), collisions,
    sharedMeanings: collisions.reduce((total, group) => total + group.meanings.length, 0),
    incompatibleMarkers: incompatibleMarkers(language) };
}
