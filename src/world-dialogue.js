import { renderWritingWithSpans } from './engine.js';
import { renderSceneLine } from './scene-language.js';

/** Keep lexical provenance through custom alphabets, which can expand or join sounds. */
export function compilePresetDialogue(scene, language) {
  return scene.lines.map(line => {
    const translated = renderSceneLine(line, language);
    const { text, spans } = renderWritingWithSpans(translated.text, language);
    const letters = [...text];
    const tokens = [];
    let previousOwner;
    for (const span of spans) {
      const owners = translated.tokens.filter(token => token.start < span.sourceEnd && token.end > span.sourceStart);
      // A glyph may consume punctuation beside a word. A glyph shared by two
      // words has no single inspection target, so keep that segment plain text.
      if (owners.length !== 1 || span.end <= span.start) { previousOwner = undefined; continue; }
      const owner = owners[0];
      const piece = letters.slice(span.start, span.end).join('');
      const previous = tokens.at(-1);
      if (previousOwner === owner && previous?.end === span.start) {
        previous.end = span.end;
        previous.text += piece;
      } else tokens.push({ ...owner, start: span.start, end: span.end, text: piece });
      previousOwner = owner;
    }
    return { id: line.id, speaker: line.speaker, incident: line.incident, text, english: line.english,
      tokens, unknown: translated.unknown, duration: letters.length * 43 + 2400 };
  });
}
