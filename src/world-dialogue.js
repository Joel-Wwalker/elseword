import { renderWrittenSceneLine } from './scene-language.js';

/** Keep lexical provenance through custom alphabets, which can expand or join sounds. */
export function compilePresetDialogue(scene, language) {
  return scene.lines.map(line => {
    const { text, tokens, unknown } = renderWrittenSceneLine(line, language);
    return { id: line.id, speaker: line.speaker, incident: line.incident, text, english: line.english,
      tokens, unknown, duration: [...text].length * 43 + 2400 };
  });
}
