import { validateLanguage, composeSentence, renderWriting } from './engine.js';
import { SCENES, CHARACTERS, getSceneEpisode, resolveSceneChoice } from './scenes.js';
import { renderSceneLine } from './scene-language.js';
import { getSceneLayout, shouldFlipCharacter } from './scene-layout.js';
import { isAudibleCharacter } from './text-audio.js';

export const SCENE_STORAGE_KEY = 'little-languages-sceneprojects-v1';
export const SCENE_RECOVERY_KEY = `${SCENE_STORAGE_KEY}-recovery`;
export const SCENE_PROPS = Object.freeze(['none', 'bread', 'basket', 'umbrella', 'book', 'cup', 'ticket', 'star', 'bottle']);
export const SCENE_ACTIONS = Object.freeze(['none', 'walk', 'turn', 'gesture', 'recoil', 'pass', 'drop']);
export const SCENE_CUES = Object.freeze(['start', 'end', 'word']);
const MAX_SCENE_BYTES = 1_000_000, MAX_STORE_BYTES = 10_000_000, MAX_SCENES = 20;
const TYPE_INTERVAL = 43, ACTION_DURATION = 700;
const utf8 = new TextEncoder();
const points = value => Array.from(value);
const keyOf = value => String(value ?? '').normalize('NFC').trim().toLocaleLowerCase('en-US').replace(/\s+/gu, ' ');
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const ease = value => { const p = clamp(value); return p * p * (3 - 2 * p); };
const oneOf = (value, options, label) => { if (!options.includes(value)) throw new Error(`Choose a valid ${label}.`); return value; };
const integer = (value, min, max, label) => { if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${label} must be an integer between ${min} and ${max}.`); return value; };
const object = (value, label) => { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`); return value; };

function text(value, label, maximum, { empty = true, multiline = false, fallback = '' } = {}) {
  const input = value === undefined ? fallback : value;
  if (typeof input !== 'string') throw new Error(`${label} must be text.`);
  const result = input.normalize('NFC').trim();
  if (!empty && !result) throw new Error(`${label} cannot be empty.`);
  if (points(result).length > maximum) throw new Error(`${label} is too long (maximum ${maximum} characters).`);
  if ((multiline ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u : /[\u0000-\u001F\u007F]/u).test(result)) throw new Error(`${label} contains control characters.`);
  return result;
}

function identifier(value, label) {
  const id = text(value, label, 80, { empty: false });
  if (!/^[A-Za-z0-9][\w-]*$/u.test(id)) throw new Error(`${label} may contain only letters, numbers, underscores and hyphens.`);
  return id;
}

function safeTree(value, depth = 0, budget = { nodes: 0 }, path = new WeakSet()) {
  if (depth > 16 || ++budget.nodes > 70000) throw new Error('Scene import exceeds the supported size or nesting limit.');
  if (!value || typeof value !== 'object') return;
  if (path.has(value)) throw new Error('Scene import cannot contain circular references.');
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) throw new Error('Scene import contains an unsafe object.');
  path.add(value);
  for (const key of Object.keys(value)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('Scene import contains an unsafe key.');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor.get || descriptor.set) throw new Error('Scene import cannot contain executable properties.');
    safeTree(value[key], depth + 1, budget, path);
  }
  path.delete(value);
}

function templateScene(reference) {
  object(reference, 'Template');
  const room = SCENES.find(scene => scene.id === reference.sceneId);
  if (!room) throw new Error('Template refers to an unknown room.');
  if (!room.episodes.some(episode => episode.id === reference.episodeId)) throw new Error('Template refers to an unknown episode.');
  let scene = getSceneEpisode(room.id, reference.episodeId);
  if (scene.choice) {
    if (!scene.choice.options.some(choice => choice.id === reference.choiceId)) throw new Error('Choose a reply branch for this template before saving or exporting.');
    scene = resolveSceneChoice(scene, reference.choiceId);
  } else if (reference.choiceId !== undefined) throw new Error('This template has no reply branch.');
  return scene;
}

function normalizeBuilder(value, language) {
  const source = object(value ?? {}, 'Sentence options'), options = {};
  const ids = new Set(language.words.map(word => word.id));
  const meanings = new Set(language.words.map(word => word.english));
  for (const key of ['subject', 'verb', 'object', 'adjective']) {
    const reference = text(source[key], `Sentence ${key}`, 80);
    if (reference && !ids.has(reference) && !meanings.has(keyOf(reference))) throw new Error(`Sentence ${key} refers to a missing word.`);
    options[key] = ids.has(reference) ? reference : keyOf(reference);
  }
  options.tense = oneOf(source.tense ?? 'present', ['present', 'past', 'future'], 'sentence tense');
  for (const key of ['plural', 'negative', 'question']) {
    if (source[key] !== undefined && typeof source[key] !== 'boolean') throw new Error(`Sentence ${key} must be true or false.`);
    options[key] = source[key] ?? false;
  }
  return options;
}

/** Validate a portable snapshot before it reaches playback, local storage or the cloud. */
export function validateSceneProject(value) {
  if (typeof value === 'string') {
    if (value.length > MAX_SCENE_BYTES || utf8.encode(value).length > MAX_SCENE_BYTES) throw new Error('Scene import is too large (maximum 1 MB).');
    try { value = JSON.parse(value); } catch { throw new Error('Scene import is not valid JSON.'); }
  }
  safeTree(value);
  object(value, 'Scene project');
  if (utf8.encode(JSON.stringify(value)).length > MAX_SCENE_BYTES) throw new Error('Scene import is too large (maximum 1 MB).');
  if (value.format !== 'little-languages-scene' || value.version !== 1) throw new Error('Unsupported scene format or version.');
  const id = identifier(value.id, 'Scene ID');
  const name = text(value.name, 'Scene name', 80, { empty: false });
  const room = oneOf(value.room, SCENES.map(scene => scene.id), 'room');
  if (!Array.isArray(value.cast) || value.cast.length !== 2) throw new Error('A scene needs exactly two residents.');
  const cast = value.cast.map(id => oneOf(id, CHARACTERS.map(character => character.id), 'resident'));
  const prop = oneOf(value.prop ?? 'none', SCENE_PROPS, 'prop');
  const language = validateLanguage(value.language);
  const captions = oneOf(value.captions ?? 'both', ['both', 'language', 'english'], 'caption setting');
  if (value.sound !== undefined && typeof value.sound !== 'boolean') throw new Error('Scene sound must be true or false.');
  if (!Array.isArray(value.beats) || !value.beats.length || value.beats.length > 24) throw new Error('A scene needs between 1 and 24 lines.');
  const ids = new Set();
  const beats = value.beats.map(source => {
    object(source, 'Line');
    const id = identifier(source.id, 'Line ID');
    if (ids.has(id)) throw new Error('Line IDs must be unique.');
    ids.add(id);
    const beat = { id, speaker: integer(source.speaker ?? 0, 0, 1, 'Speaker'), mode: oneOf(source.mode, ['builder', 'literal', 'template'], 'dialogue mode') };
    if (beat.mode === 'builder') beat.options = normalizeBuilder(source.options, language);
    if (beat.mode === 'literal') {
      beat.text = text(source.text, 'Literal dialogue', 300, { multiline: true });
      beat.english = text(source.english, 'English caption', 300, { multiline: true });
    }
    if (beat.mode === 'template') {
      const input = object(source.template, 'Template');
      beat.template = { sceneId: identifier(input.sceneId, 'Template room'), episodeId: identifier(input.episodeId, 'Template episode'), lineIndex: integer(input.lineIndex, 0, 23, 'Template line') };
      if (input.choiceId !== undefined) beat.template.choiceId = identifier(input.choiceId, 'Template reply');
      const template = templateScene(beat.template);
      if (!template.lines[beat.template.lineIndex]) throw new Error('Template refers to a missing dialogue line.');
    }
    beat.action = oneOf(source.action ?? 'none', SCENE_ACTIONS, 'action');
    beat.cue = oneOf(source.cue ?? 'start', SCENE_CUES, 'action cue');
    beat.wordIndex = integer(source.wordIndex ?? 0, 0, 299, 'Action word index');
    beat.pauseMs = integer(source.pauseMs ?? 600, 0, 5000, 'Pause');
    return beat;
  });
  return { format: 'little-languages-scene', version: 1, id, name, room, cast, prop, language, captions, sound: value.sound ?? true, beats };
}

export function createSceneProject(language, { room = 'bakery', episodeId, choiceId } = {}) {
  const location = SCENES.find(scene => scene.id === room);
  if (!location) throw new Error('Choose a valid room.');
  const snapshot = validateLanguage(language);
  const uid = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  const base = { format: 'little-languages-scene', version: 1, id: `scene-${uid}`, name: 'New scene', room, cast: [...location.characters], prop: location.prop, language: snapshot, captions: 'both', sound: true, beats: [] };
  if (episodeId !== undefined) {
    if (!location.episodes.some(episode => episode.id === episodeId)) throw new Error('Choose a valid template episode.');
    const original = getSceneEpisode(room, episodeId);
    if (original.choice && !choiceId) throw new Error('Choose a reply branch before remixing this conversation.');
    const resolvedChoice = choiceId;
    const reference = { sceneId: room, episodeId, ...(resolvedChoice ? { choiceId: resolvedChoice } : {}) };
    const selected = templateScene(reference);
    base.name = selected.title;
    base.beats = selected.lines.map((line, index) => ({ id: `beat-${index + 1}`, speaker: line.speaker, mode: 'template', template: { ...reference, lineIndex: index }, action: index === 1 ? 'pass' : index === selected.lines.length - 1 ? 'recoil' : 'none', cue: 'end', wordIndex: 0, pauseMs: 600, ...(selected.makerActions?.[index] ?? {}) }));
  } else {
    const known = key => snapshot.words.some(word => word.english === key) ? key : '';
    base.beats = [{ id: 'beat-1', speaker: 0, mode: 'builder', options: { subject: known('i'), verb: known('see'), object: known('moon') }, action: 'none', cue: 'start', wordIndex: 0, pauseMs: 600 }];
  }
  return validateSceneProject(base);
}

export function compileSceneProject(value) {
  const project = validateSceneProject(value), audioEvents = [];
  let cursor = 0;
  const beats = project.beats.map(beat => {
    const source = beat.mode === 'builder' ? composeSentence(beat.options, project.language)
      : beat.mode === 'template' ? renderSceneLine(templateScene(beat.template).lines[beat.template.lineIndex], project.language)
        : { text: beat.text, english: beat.english };
    const text = beat.mode === 'literal' ? source.text : renderWriting(source.text, project.language);
    const english = source.english, characters = points(text), start = cursor;
    const speechEnd = start + characters.length * TYPE_INTERVAL;
    const words = [...source.text.matchAll(/[\p{L}\p{M}\p{N}]+(?:['’\-][\p{L}\p{M}\p{N}]+)*/gu)];
    const word = words[Math.min(beat.wordIndex, words.length - 1)];
    const prefix = word ? source.text.slice(0, word.index) : source.text;
    const writtenPrefix = beat.mode === 'literal' ? prefix : renderWriting(prefix, project.language);
    const wordAt = word ? start + (points(writtenPrefix).length + 1) * TYPE_INTERVAL : speechEnd;
    const actionAt = beat.cue === 'start' ? start : beat.cue === 'end' ? speechEnd : wordAt;
    const quiet = !text && !english;
    const end = quiet ? start + Math.max(100, (beat.action === 'none' ? 0 : ACTION_DURATION) + beat.pauseMs)
      : Math.max(start + 1200, speechEnd + 900, start + points(english).length * 28 + 450, beat.action === 'none' ? start : actionAt + ACTION_DURATION) + beat.pauseMs;
    if (project.sound) characters.forEach((character, index) => {
      if (isAudibleCharacter(character)) audioEvents.push({ time: start + (index + 1) * TYPE_INTERVAL, voice: project.cast[beat.speaker], character });
    });
    cursor = end;
    return { ...beat, text, english, romanized: source.text, start, end, speechEnd, actionAt, characters };
  });
  return { project, beats, duration: cursor, audioEvents };
}

const PROP_GEOMETRY = {
  bread: [3, 3, 63, 33], basket: [17, 3, 51, 35], umbrella: [18, 4, 39, 70], book: [20, 8, 46, 36],
  cup: [20, 12, 52, 36], ticket: [18, 14, 51, 31], star: [22, 5, 44, 27], bottle: [21, 5, 44, 35], none: [0, 0, 0, 0],
};
const COUNTER_SLOTS = { bakery: [194, 258, 94], market: [191, 255, 100], library: [219, 270, 106], cafe: [215, 244, 104], tickets: [214, 265, 104], apothecary: [204, 285, 105] };

function propFrame(project) {
  const type = project.prop, shape = PROP_GEOMETRY[type], layout = getSceneLayout(project.room);
  const native = SCENES.find(scene => scene.id === project.room).prop === type;
  let scale, x, y, supportY, mode, slot;
  if (native) {
    ({ x, y, supportY, mode } = layout.prop); scale = layout.prop.scale;
    slot = COUNTER_SLOTS[project.room]?.slice(0, 2) ?? (mode === 'sky' ? [130, 170] : [45, 90]);
  } else if (COUNTER_SLOTS[project.room]) {
    const [left, right, surface] = COUNTER_SLOTS[project.room];
    slot = [left, right]; supportY = surface; mode = 'counter';
    scale = Math.min(0.85, (right - left - 10) / Math.max(1, shape[2] - shape[0]), 48 / Math.max(1, shape[3] - shape[1]));
    x = (left + right - (shape[0] + shape[2]) * scale) / 2;
    y = supportY - shape[3] * scale;
  } else {
    slot = project.room === 'busstop' ? [46, 90] : [201, 222];
    supportY = 175; mode = 'ground';
    scale = Math.min(0.8, (slot[1] - slot[0] - 6) / Math.max(1, shape[2] - shape[0]), 60 / Math.max(1, shape[3] - shape[1]));
    x = (slot[0] + slot[1] - (shape[0] + shape[2]) * scale) / 2;
    y = supportY - shape[3] * scale;
  }
  return { type, x, y, scale, width: 66 * scale, height: (type === 'umbrella' ? 76 : 40) * scale, shape, slot, supportY: supportY ?? null, mode, opacity: type === 'none' ? 0 : 1 };
}

/** Every frame is rebuilt from the recipe; playing, seeking and export share this path. */
export function sampleSceneProject(compiled, time, { reduced = false } = {}) {
  const t = clamp(Number.isNaN(Number(time)) ? 0 : Number(time), 0, compiled.duration);
  const beatIndex = Math.max(0, compiled.beats.findIndex(beat => t < beat.end));
  const index = t >= compiled.duration ? compiled.beats.length - 1 : beatIndex;
  const beat = compiled.beats[index], project = compiled.project, layout = getSceneLayout(project.room);
  const actors = layout.positions.map(([x, y], role) => {
    const character = CHARACTERS.find(character => character.id === project.cast[role]);
    return { id: character.id, x, y, pose: role === beat.speaker && t < beat.speechEnd ? 1 : 0, flip: shouldFlipCharacter(character.row, role) };
  });
  const prop = propFrame(project);
  for (const action of compiled.beats) {
    if (t < action.actionAt || action.action === 'none') continue;
    const p = clamp((t - action.actionAt) / ACTION_DURATION), smooth = ease(p), actor = actors[action.speaker];
    const role = action.speaker, baseX = layout.positions[role][0];
    if (action.action === 'walk' && !reduced) {
      const target = Math.abs(actor.x - baseX) > 1 ? baseX : baseX + (role ? -6 : 6);
      actor.x += (target - actor.x) * smooth;
      if (p < 1) actor.pose = Math.floor((t - action.actionAt) / 140) % 2 ? 2 : 0;
    }
    if (action.action === 'turn' && p >= (reduced ? 0 : 0.5)) actor.flip = !actor.flip;
    if (action.action === 'gesture' && p < 1) actor.pose = actor.id === 'kiln' ? 2 : 1;
    if (action.action === 'recoil' && p < 1) {
      actor.pose = 3;
      if (!reduced) actor.x += (role ? 4 : -4) * Math.sin(p * Math.PI);
    }
    if (action.action === 'pass' && prop.type !== 'none') {
      const left = prop.slot[0] - prop.shape[0] * prop.scale + 1;
      const right = prop.slot[1] - prop.shape[2] * prop.scale - 1;
      const target = clamp(prop.x + (role ? -8 : 8), left, right);
      prop.x += (target - prop.x) * (reduced ? 1 : smooth);
      if (p < 1) actor.pose = actor.id === 'kiln' ? 2 : 1;
    }
    if (action.action === 'drop' && prop.type !== 'none') {
      if (prop.mode === 'sky') {
        const targetX = 211 - (prop.shape[0] + prop.shape[2]) * prop.scale / 2;
        const targetY = 175 - prop.shape[3] * prop.scale;
        prop.x += (targetX - prop.x) * (reduced ? 1 : ease(p * 3));
        prop.y += (targetY - prop.y) * (reduced ? 1 : ease((p - 1 / 3) * 1.5));
        if (p >= 1 || reduced) { prop.mode = 'ground'; prop.supportY = 175; prop.slot = [201, 222]; }
      } else if (!reduced) {
        // A short lift from the hand, then a drop onto the existing counter or ground.
        prop.y -= 10 * Math.sin(p * Math.PI);
      }
      if (p < 1) actor.pose = 1;
    }
  }
  // The rooftop bench reaches x=140; mirrored atlas poses can begin six pixels
  // inside their cell, so even a recoil must keep the cell at or beyond x=134.
  if (project.room === 'rooftop') actors[0].x = Math.max(134, actors[0].x);
  prop.bounds = prop.shape.map((point, index) => point * prop.scale + (index % 2 ? prop.y : prop.x));
  const visibleCount = clamp(Math.floor((t - beat.start) / TYPE_INTERVAL), 0, beat.characters.length);
  return { time: t, duration: compiled.duration, beatIndex: index, beatId: beat.id, speaker: beat.speaker, speakerId: project.cast[beat.speaker], visibleText: beat.characters.slice(0, visibleCount).join(''), text: beat.text, english: beat.english, actors, prop, speaking: t < beat.speechEnd, captions: project.captions, direction: project.language.script.direction, progress: compiled.duration ? t / compiled.duration : 0 };
}

export function loadSceneProjects(storage) {
  const empty = warning => ({ scenes: [], activeId: null, warning });
  let raw;
  try { raw = storage?.getItem(SCENE_STORAGE_KEY); } catch { return empty('Browser storage is unavailable. Download a scene backup to keep your work.'); }
  if (raw === null || raw === undefined) return empty(null);
  try {
    if (typeof raw !== 'string' || raw.length > MAX_STORE_BYTES || utf8.encode(raw).length > MAX_STORE_BYTES) throw new Error('Saved scenes exceed the 10 MB limit.');
    const value = JSON.parse(raw);
    if (!value || value.version !== 1 || !Array.isArray(value.scenes) || value.scenes.length > MAX_SCENES) throw new Error('Saved scenes have an unsupported shape.');
    const scenes = [], ids = new Set(); let skipped = 0;
    for (const candidate of value.scenes) {
      try {
        const scene = validateSceneProject(candidate);
        if (ids.has(scene.id)) throw new Error('Duplicate scene.');
        ids.add(scene.id); scenes.push(scene);
      } catch { skipped++; }
    }
    if (value.scenes.length && !scenes.length) throw new Error('No saved scenes could be recovered.');
    return { scenes, activeId: ids.has(value.activeId) ? value.activeId : scenes[0]?.id ?? null, warning: skipped ? `Recovered ${scenes.length} scenes; skipped ${skipped} damaged or duplicate entries. The original save is preserved.` : null, ...(skipped ? { recoveryRaw: raw } : {}) };
  } catch (error) { return { ...empty(`${error.message} The original save has not changed; it will be preserved before your next save.`), recoveryRaw: raw }; }
}

export function saveSceneProjects(storage, value) {
  if (!value || !Array.isArray(value.scenes) || value.scenes.length > MAX_SCENES) throw new Error('Keep at most 20 saved scenes on this device. Download backups before removing older scenes.');
  const scenes = value.scenes.map(validateSceneProject), ids = new Set(scenes.map(scene => scene.id));
  if (ids.size !== scenes.length) throw new Error('Saved scene IDs must be unique.');
  const normalized = { version: 1, scenes, activeId: ids.has(value.activeId) ? value.activeId : scenes[0]?.id ?? null };
  const raw = JSON.stringify(normalized);
  if (utf8.encode(raw).length > MAX_STORE_BYTES) throw new Error('Saved scenes exceed the 10 MB limit. Download backups and keep fewer scenes.');
  if (value.recoveryRaw !== undefined && typeof value.recoveryRaw !== 'string') throw new Error('Scene recovery data must be text.');
  try {
    if (!storage || typeof storage.setItem !== 'function') throw new Error('Storage unavailable.');
    if (typeof value.recoveryRaw === 'string' && storage.getItem(SCENE_RECOVERY_KEY) !== value.recoveryRaw) storage.setItem(SCENE_RECOVERY_KEY, value.recoveryRaw);
    storage.setItem(SCENE_STORAGE_KEY, raw);
  } catch { throw new Error('Browser storage could not save this scene. Your changes remain in this tab; download a backup.'); }
  return { ...normalized, ...(typeof value.recoveryRaw === 'string' ? { recoveryRaw: value.recoveryRaw } : {}) };
}
