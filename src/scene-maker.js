import { validateSceneProject, createSceneProject, compileSceneProject, assertScenePlayable, loadSceneProjects, saveSceneProjects, SCENE_PROPS } from './scene-project.js';
import { sentenceChoices, canPluralizeObject } from './sentence-grammar.js';
import { CHARACTERS, SCENES, getSceneEpisodes } from './scenes.js';
import { TextAudio } from './text-audio.js';
import { CloudLibrary } from './cloud-library.js';
import { SCENE_EXPRESSIONS } from './scene-expressions.js';

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = prefix => `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`}`;
const option = (value, label, selected = false) => `<option value="${escapeHTML(value)}"${selected ? ' selected' : ''}>${escapeHTML(label)}</option>`;
const timeLabel = value => `${Math.floor(value / 60000)}:${String(Math.floor(value / 1000) % 60).padStart(2, '0')}`;
const CURRENT_KEY = 'little-languages-scene-current-v1';
const PREVIEW_HIDDEN_KEY = 'elseword-editor-preview-hidden-v1';
const slotKeys = ['subject', 'verb', 'object', 'adjective'];
const actions = { none: 'No action', walk: 'Walk closer', turn: 'Turn', gesture: 'Gesture', recoil: 'Recoil', pass: 'Pass the prop', drop: 'Drop the prop' };

function beatIndex(project, id) { const index = project.beats.findIndex(beat => beat.id === id); if (index < 0) throw new Error('That line is no longer in this scene.'); return index; }
export function moveSceneBeat(project, id, direction) {
  const next = structuredClone(project), index = beatIndex(next, id), target = Math.max(0, Math.min(next.beats.length - 1, index + direction));
  const [beat] = next.beats.splice(index, 1); next.beats.splice(target, 0, beat); return validateSceneProject(next);
}
export function duplicateSceneBeat(project, id, newId = uid('beat')) {
  const next = structuredClone(project), index = beatIndex(next, id);
  next.beats.splice(index + 1, 0, { ...structuredClone(next.beats[index]), id: newId }); return validateSceneProject(next);
}
export function removeSceneBeat(project, id) {
  if (project.beats.length <= 1) throw new Error('Keep at least one line. Clear its dialogue to make a quiet pause.');
  const next = structuredClone(project); next.beats.splice(beatIndex(next, id), 1); return validateSceneProject(next);
}
function builderOptions(language) {
  const pick = (meaning, pos) => language.words.find(word => word.english === meaning)?.id ?? language.words.find(word => word.pos === pos)?.id ?? '';
  return { subject: pick('i', 'pronoun'), verb: pick('see', 'verb'), object: pick('moon', 'noun'), adjective: '', tense: 'present', plural: false, negative: false, question: false };
}
export function convertSceneBeat(project, id, mode) {
  if (!['literal', 'builder'].includes(mode)) throw new Error('Choose custom text or the sentence builder.');
  const next = structuredClone(project), index = beatIndex(next, id), beat = next.beats[index];
  const resolved = compileSceneProject(project).beats[index];
  if (mode === 'literal' && resolved.error) throw new Error(`Line ${index + 1}: ${resolved.error}`);
  delete beat.template; delete beat.options; delete beat.text; delete beat.english;
  beat.mode = mode;
  if (mode === 'literal') { beat.text = resolved.text; beat.english = resolved.english; }
  else beat.options = builderOptions(next.language);
  return validateSceneProject(next);
}
export function parseSceneImport(text, id = uid('scene')) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > 1_000_000) throw new Error('Choose a scene file smaller than 1 MB.');
  const scene = validateSceneProject(JSON.parse(text)); scene.id = id; return validateSceneProject(scene);
}
export function serializeSceneProject(project) {
  // Validation and import share the compact UTF-8 limit. Pretty-printing can
  // make an otherwise valid snapshot too large to open again.
  return JSON.stringify(validateSceneProject(project));
}

/** A dedicated workspace; saving an editable scene and recording a video are separate. */
export async function mountSceneMaker({ host, getLanguage, notify, cloudService, onClose = () => {} }) {
  let storage;
  try { storage = localStorage; } catch { storage = { getItem: () => null, setItem: () => { throw new Error('Storage is unavailable.'); } }; }
  let local = loadSceneProjects(storage), project = null, compiled = null, selected = 0, history = [];
  let opened = false, disposed = false, playing = false, position = 0, lastTick = 0, frame = 0, audioIndex = 0;
  let previewCollapsed = false, resumeAfterPreview = false;
  try { previewCollapsed = storage.getItem(PREVIEW_HIDDEN_KEY) === 'true'; } catch { /* Display preferences are optional. */ }
  let recording = null, videoURL = null, fileEpoch = 0, statusMessage = '', libraryDelete = null;
  let recoveryWarning = local.warning ?? '', currentRecoveryRaw = null, renderer;
  const events = new AbortController(), audio = new TextAudio({ storage: null });
  // Scene sound is part of the portable project, independent of studio SFX preferences.
  audio.setEnabled(true);
  const $ = id => host.querySelector(`#sm-${id}`);
  const listen = (node, type, callback) => node.addEventListener(type, callback, { signal: events.signal });
  const report = error => { statusMessage = error.message ?? String(error); $('error').textContent = statusMessage; };
  const safe = callback => event => { try { callback(event); } catch (error) { report(error); } };
  const cloud = cloudService ? new CloudLibrary({ service: cloudService, storage, validateDocument: validateSceneProject, cachePrefix: 'little-languages-scene-links-v1:', resource: 'scene' }) : null;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  host.innerHTML = `<div class="scene-maker">
    <header class="sm-header"><div class="sm-heading"><h1 tabindex="-1" id="sm-title">Scene editor</h1><p id="sm-local-status" role="status"></p></div><div class="sm-actions"><button class="primary-button" id="sm-save-local" title="Save this scene on this device">Save</button><button class="secondary-button" id="sm-video-export" aria-controls="sm-video-panel">Export video</button><button class="text-button" id="sm-undo" disabled>Undo</button><button class="text-button" id="sm-close">Back to world</button></div></header>
    <p id="sm-error" class="sm-error" role="alert"></p><p id="sm-notice" class="sm-notice" role="status"></p><p id="sm-video-limit" class="sm-notice" role="status"></p>
    <details class="sm-setup"><summary>Scene settings <span id="sm-setup-summary">Name, room, cast and language</span></summary>
      <div class="sm-setup-grid"><label>Scene name<input id="sm-name" maxlength="80"></label><label>Room<select id="sm-room">${SCENES.map(scene => option(scene.id, scene.name)).join('')}</select></label><label>First character<select id="sm-cast-0">${CHARACTERS.map(person => option(person.id, person.name)).join('')}</select></label><label>Second character<select id="sm-cast-1">${CHARACTERS.map(person => option(person.id, person.name)).join('')}</select></label><label>Prop<select id="sm-prop">${SCENE_PROPS.map(prop => option(prop, prop[0].toUpperCase() + prop.slice(1))).join('')}</select></label><label>Captions<select id="sm-captions"><option value="both">Both languages</option><option value="language">Your language</option><option value="english">English</option></select></label><label class="sm-checkbox"><input id="sm-sound" type="checkbox"> Scene sounds</label><div class="sm-language"><p id="sm-language-name"></p><button class="text-button" id="sm-use-language">Update from studio language</button><small>The scene keeps a copy of its language. Update it to use your latest words and grammar.</small></div></div>
      <div class="sm-remix"><label>Start from a conversation<select id="sm-template"></select></label><label id="sm-choice-label" hidden>Reply<select id="sm-choice"></select></label><button class="secondary-button" id="sm-remix">Use conversation</button><button class="text-button" id="sm-blank">Start blank</button><span class="sm-help">Undo restores the previous scene.</span></div>
    </details>
    <div class="sm-workspace">
      <section class="sm-preview" aria-label="Scene preview"><div class="scene-window-bar"><span>Scene preview</span><button id="sm-toggle-preview" class="quiet-button" type="button" aria-expanded="true" aria-controls="sm-preview-content">Hide scene</button></div><div id="sm-preview-content"><canvas id="sm-canvas" width="960" height="720" aria-label="Animated scene preview" aria-describedby="sm-caption sm-preview-help"></canvas><div class="sm-playback"><button class="primary-button" id="sm-play" aria-label="Play scene">Play</button><button class="secondary-button" id="sm-restart">Restart</button><label class="sr-only" for="sm-seek">Scene playback position</label><input id="sm-seek" type="range" min="0" max="1" value="0" step="50"><output id="sm-time">0:00 / 0:00</output></div><div id="sm-caption" class="sr-only" aria-live="off"></div><p id="sm-preview-help" class="sr-only">Focus the preview and press Space to play or pause. Use the left and right arrow keys to move through the scene.</p></div>
        <details class="sm-video" id="sm-video-panel" hidden><summary>Video export <span>Up to 60 seconds</span></summary><div class="sm-video-content"><p id="sm-video-status" role="status" tabindex="-1"></p><progress id="sm-video-progress" max="1" value="0" hidden></progress><button class="text-button" id="sm-cancel-export" hidden>Cancel recording</button><div id="sm-video-result" hidden><video id="sm-video-player" controls playsinline preload="metadata"></video><a id="sm-video-download" class="secondary-button" download>Download video</a></div><p class="sm-help">Recording takes as long as the scene; keep this tab visible.</p></div></details>
      </section>
      <section class="sm-storyboard" aria-labelledby="sm-storyboard-title"><div class="sm-section-heading"><h2 id="sm-storyboard-title">Storyboard</h2><span id="sm-beat-count"></span></div><ol id="sm-beats" class="sm-beats"></ol><div class="sm-actions"><button class="secondary-button" id="sm-add-beat">Add line</button><button class="text-button" id="sm-add-pause">Add a pause</button></div><section id="sm-beat-editor" class="sm-beat-editor" aria-label="Selected line editor"></section></section>
    </div>
    <details class="sm-saves"><summary>Saved scenes <span>On this device</span></summary><div class="sm-save-content"><p class="sm-help">Your draft saves automatically. Use Save to keep it in this list, or save a copy to keep another version.</p><label>Saved scene<select id="sm-local-list"></select></label><div class="sm-actions"><button class="secondary-button" id="sm-open-local">Open</button><button class="secondary-button" id="sm-copy-local">Save a copy</button><button class="text-button danger-button" id="sm-delete-local">Delete saved scene</button></div></div></details>
    <details class="sm-saves"><summary>Scene files <span>Import or download</span></summary><div class="sm-save-content"><p class="sm-help">A scene file includes its storyboard and language. Open it here to keep editing.</p><div class="sm-actions"><button class="secondary-button" id="sm-export-json">Download scene file</button><button class="secondary-button" id="sm-import-json">Open scene file</button><button class="text-button" id="sm-export-recovery" hidden>Download recovered data</button></div><input id="sm-file" type="file" accept="application/json,.json" hidden></div></details>
    <details class="sm-saves"><summary>Cloud scenes <span>Private saves across devices</span></summary><div id="sm-cloud"></div></details>
  </div>`;
  host.hidden = true;
  renderPreviewVisibility();
  $('canvas').tabIndex = 0;
  try {
    const { createSceneRenderer } = await import('./scene-renderer.js');
    renderer = await createSceneRenderer($('canvas'));
  } catch (error) { events.abort(); audio.destroy(); cloud?.destroy(); host.replaceChildren(); throw error; }

  function snapshot() { return { kind: 'edit', project: structuredClone(project), selected }; }
  function checkpoint(entry = snapshot()) { history.push(entry); if (history.length > 20) history.shift(); }
  function clearError() { statusMessage = ''; $('error').textContent = ''; }
  function recoverCurrent() {
    try {
      currentRecoveryRaw = storage.getItem(`${CURRENT_KEY}-recovery`);
      const raw = storage.getItem(CURRENT_KEY); if (!raw) return null;
      try { if (new TextEncoder().encode(raw).byteLength > 1_000_000) throw new Error(); return validateSceneProject(JSON.parse(raw)); }
      catch { currentRecoveryRaw = raw; recoveryWarning = 'The last working draft could not be opened. Its original data is available to download.'; return null; }
    } catch { return null; }
  }
  function saveCurrent() {
    try {
      if (currentRecoveryRaw) storage.setItem(`${CURRENT_KEY}-recovery`, currentRecoveryRaw);
      storage.setItem(CURRENT_KEY, JSON.stringify(project));
      $('local-status').textContent = 'Draft saved on this device.';
      $('local-status').classList.remove('is-error');
    } catch {
      $('local-status').textContent = 'Could not save this draft. Download a scene file to keep it.';
      $('local-status').classList.add('is-error');
    }
  }
  function persistLibrary() { saveSceneProjects(storage, local); }
  function apply(next, { remember = true, editor = true } = {}) {
    if (recording) throw new Error('Finish or cancel the recording before changing this scene.');
    const valid = validateSceneProject(next), timeline = compileSceneProject(valid);
    if (remember && project) checkpoint();
    pause(); project = valid; compiled = timeline; selected = Math.min(selected, project.beats.length - 1);
    position = Math.min(position, compiled.duration); clearError(); saveCurrent(); render({ editor });
  }
  function patch(mutator, config) { const next = structuredClone(project); mutator(next); apply(next, config); }
  function flushForm() {
    if (!project || recording) return;
    const next = structuredClone(project);
    for (const key of ['name', 'room', 'prop', 'captions']) next[key] = $(key).value;
    next.cast = [$('cast-0').value, $('cast-1').value]; next.sound = $('sound').checked;
    const beat = next.beats[selected];
    $('beat-editor').querySelectorAll('[data-sm-field], [data-sm-option]').forEach(control => {
      const field = control.dataset.smField, key = control.dataset.smOption;
      if (key) { beat.options ??= {}; beat.options[key] = control.type === 'checkbox' ? control.checked : control.value; }
      else beat[field] = ['speaker', 'wordIndex', 'pauseMs'].includes(field) ? Number(control.value) * (field === 'pauseMs' ? 1000 : 1) - (field === 'wordIndex' ? 1 : 0) : control.value;
    });
    const valid = validateSceneProject(next);
    if (JSON.stringify(valid) !== JSON.stringify(project)) apply(valid, { editor: false });
    return valid;
  }
  function selectBeat(index) { flushForm(); pause(); selected = index; position = compiled.beats[index].start; renderBoard(); renderEditor(); draw(); }
  function undo() {
    if (recording || !history.length) return;
    const previous = history.at(-1);
    if (previous.kind === 'delete') {
      const nextLocal = { ...local, scenes: [...local.scenes] };
      if (nextLocal.scenes.some(scene => scene.id === previous.scene.id)) throw new Error('A scene with that identity is already saved.');
      nextLocal.scenes.splice(previous.index, 0, previous.scene); saveSceneProjects(storage, nextLocal); local = nextLocal; history.pop(); renderLibrary(); $('undo').disabled = !history.length; notify('Deleted device scene restored.');
    } else { history.pop(); selected = previous.selected; apply(previous.project, { remember: false }); }
  }
  function draw() {
    if (!compiled || disposed) return;
    const state = renderer.draw(compiled, position, { reduced: reduced() });
    $('seek').max = String(compiled.duration); $('seek').value = String(position);
    $('seek').setAttribute('aria-valuetext', `${timeLabel(position)} of ${timeLabel(compiled.duration)}`);
    $('time').textContent = `${timeLabel(position)} / ${timeLabel(compiled.duration)}`;
    const beat = compiled.beats[state?.beatIndex ?? Math.max(0, compiled.beats.findIndex(item => position < item.end))] ?? compiled.beats.at(-1);
    const person = CHARACTERS.find(item => item.id === project.cast[beat?.speaker ?? 0]);
    const caption = beat ? `<strong>${escapeHTML(person?.name)}</strong>${project.captions !== 'english' ? `<p dir="${project.language.script.direction}">${escapeHTML(beat.text)}</p>` : ''}${project.captions !== 'language' ? `<p class="sm-english">${escapeHTML(beat.english)}</p>` : ''}` : '';
    if ($('caption').innerHTML !== caption) $('caption').innerHTML = caption;
    const active = compiled.beats.findIndex(beat => position >= beat.start && position < beat.end);
    host.querySelectorAll('[data-sm-beat]').forEach(button => button.classList.toggle('is-playing', playing && Number(button.dataset.smBeat) === active));
  }
  function resetAudioIndex() { audioIndex = compiled.audioEvents.findIndex(event => event.time > position); if (audioIndex < 0) audioIndex = compiled.audioEvents.length; }
  function tick(now) {
    if (!playing || disposed || !opened) return;
    const elapsed = Math.min(250, now - lastTick); lastTick = now; position = Math.min(compiled.duration, position + elapsed);
    if (project.sound) audio.setAmbience(project.room, position);
    while (audioIndex < compiled.audioEvents.length && compiled.audioEvents[audioIndex].time <= position) {
      const event = compiled.audioEvents[audioIndex++];
      if (project.sound && position - event.time < 150) {
        if (event.effect) { if (!reduced() || !event.motionOnly) audio.effect(event.effect); }
        else audio.blip(event.character, event.voice);
      }
    }
    draw();
    if (position >= compiled.duration) pause(); else frame = requestAnimationFrame(tick);
  }
  function play() {
    if (!project || recording || playing || previewCollapsed || !opened) return;
    try { flushForm(); assertScenePlayable(compiled); } catch (error) { report(error); return; }
    $('video-player').pause();
    if (position >= compiled.duration) position = 0;
    playing = true; if (project.sound) void audio.unlock(); resetAudioIndex(); lastTick = performance.now();
    $('play').textContent = 'Pause'; $('play').setAttribute('aria-label', 'Pause scene'); frame = requestAnimationFrame(tick);
  }
  function pause() { playing = false; resumeAfterPreview = false; cancelAnimationFrame(frame); audio.stop(); $('play').textContent = 'Play'; $('play').setAttribute('aria-label', 'Play scene'); }
  function renderPreviewVisibility() {
    // Recording needs a visible preview, but does not change the saved preference.
    const hidden = previewCollapsed && !recording;
    $('preview-content').hidden = hidden;
    host.querySelector('.sm-workspace').classList.toggle('is-preview-collapsed', hidden);
    $('toggle-preview').setAttribute('aria-expanded', String(!hidden));
    $('toggle-preview').textContent = hidden ? 'Show scene' : 'Hide scene';
  }
  function render({ editor = true } = {}) {
    $('name').value = project.name; $('room').value = project.room; $('cast-0').value = project.cast[0]; $('cast-1').value = project.cast[1]; $('prop').value = project.prop;
    $('captions').value = project.captions; $('sound').checked = project.sound;
    $('setup-summary').textContent = `${project.name} · ${SCENES.find(scene => scene.id === project.room)?.name ?? project.room}`;
    $('language-name').textContent = `Scene language: ${project.language.name}`;
    $('undo').disabled = !history.length || Boolean(recording); $('add-beat').disabled = $('add-pause').disabled = project.beats.length >= 24 || Boolean(recording);
    $('beat-count').textContent = `${project.beats.length} / 24 lines · ${timeLabel(compiled.duration)}`;
    const overVideoLimit = compiled.duration > 60000;
    const invalid = compiled.errors.length > 0;
    $('video-export').disabled = Boolean(recording) || overVideoLimit || invalid;
    $('play').disabled = invalid;
    $('video-limit').textContent = invalid ? 'Fix the marked lines before playing or exporting. You can still save this draft.' : overVideoLimit ? 'This scene is over 60 seconds. Shorten dialogue or pauses to export it.' : '';
    if (overVideoLimit || invalid) $('video-export').setAttribute('aria-describedby', 'sm-video-limit'); else $('video-export').removeAttribute('aria-describedby');
    if (invalid) $('play').setAttribute('aria-describedby', 'sm-video-limit'); else $('play').removeAttribute('aria-describedby');
    renderTemplates(); renderBoard(); if (editor) renderEditor(); else renderBuilderFeedback(); renderLibrary(); renderCloud(); draw();
    $('notice').textContent = recoveryWarning;
    $('export-recovery').hidden = !(local.recoveryRaw || currentRecoveryRaw);
  }
  function renderTemplates() {
    const select = $('template'), previous = select.value;
    select.innerHTML = getSceneEpisodes(project.room).map(episode => option(episode.id, episode.title, episode.id === previous)).join(''); renderChoices();
  }
  function renderChoices() {
    const episode = getSceneEpisodes(project.room).find(item => item.id === $('template').value), previous = $('choice').value;
    const choices = episode?.choice?.options ?? [];
    $('choice-label').hidden = !choices.length;
    $('choice').innerHTML = (choices.length ? option('', 'Choose a reply', !previous) : '') + choices.map(choice => option(choice.id, choice.label ?? choice.english ?? choice.id, choice.id === previous)).join('');
  }
  function renderBoard() {
    $('beats').innerHTML = compiled.beats.map((beat, index) => `<li><button type="button" data-sm-beat="${index}" class="sm-beat${index === selected ? ' selected' : ''}" aria-pressed="${index === selected}"><span class="sm-beat-number">${index + 1}</span><span><strong>${escapeHTML(CHARACTERS.find(person => person.id === project.cast[beat.speaker])?.name)} <small>${escapeHTML(beat.mode === 'template' ? 'Conversation' : beat.mode === 'builder' ? 'Sentence builder' : 'Custom text')}</small></strong><span>${escapeHTML(beat.error ? `Fix line: ${beat.error}` : beat.english || beat.text || 'A quiet pause')}</span><small>${actions[beat.action]} · ${beat.error ? 'Needs editing' : timeLabel(beat.end - beat.start)}</small></span></button></li>`).join('');
  }
  function wordOptions(key, current) {
    const words = sentenceChoices(project.language)[key];
    const existing = project.language.words.find(word => word.id === current || word.english === current);
    const retained = current && !words.some(word => word.id === current || word.english === current)
      ? option(current, `${existing?.english ?? current} (${existing ? 'saved choice' : 'unavailable'})`, true) : '';
    return option('', 'None', !current) + retained + words.map(word => option(word.id, word.english, word.id === current || word.english === current)).join('');
  }
  function renderBuilderFeedback() {
    const beat = project.beats[selected], resolved = compiled.beats[selected];
    if (beat?.mode !== 'builder') return;
    $('line-error').textContent = resolved.error;
    const plural = $('beat-editor').querySelector('[data-sm-option="plural"]');
    plural.disabled = !canPluralizeObject(beat.options, project.language);
    plural.title = 'Applies to the noun in “To what”.';
    $('beat-editor').querySelector('[data-sm-convert="literal"]').disabled = Boolean(resolved.error);
  }
  function renderEditor() {
    const beat = project.beats[selected]; if (!beat) return;
    const resolved = compiled.beats[selected];
    const dialogue = beat.mode === 'template' ? `<p class="sm-help">This line uses the scene's words and grammar.</p><p class="sm-template-quote">${escapeHTML(resolved.english)}</p><div class="sm-actions"><button class="secondary-button" data-sm-convert="literal">Edit text</button><button class="text-button" data-sm-convert="builder">Use sentence builder</button></div>` : beat.mode === 'literal' ? `<div class="sm-editor-grid"><label>${escapeHTML(project.language.name)} dialogue<textarea data-sm-field="text" rows="3" maxlength="300" dir="${project.language.script.direction}">${escapeHTML(beat.text)}</textarea></label><label>English caption<textarea data-sm-field="english" rows="3" maxlength="300">${escapeHTML(beat.english)}</textarea></label></div><p class="sm-help">Your text stays as written. Enter both languages yourself; grammar changes will not update this line.</p><button class="text-button" data-sm-convert="builder">Use sentence builder</button>` : `<div class="sm-editor-grid">${slotKeys.map(key => `<label>${({ subject: 'Who', verb: 'Does what', object: 'To what', adjective: 'Description' })[key]}<select data-sm-option="${key}">${wordOptions(key, beat.options?.[key])}</select></label>`).join('')}<label>Time<select data-sm-option="tense">${[['present', 'Now'], ['past', 'Before'], ['future', 'Later']].map(([value, label]) => option(value, label, value === (beat.options?.tense ?? 'present'))).join('')}</select></label></div><div class="sm-actions">${['plural', 'negative', 'question'].map(key => `<label class="sm-checkbox"><input type="checkbox" data-sm-option="${key}"${beat.options?.[key] ? ' checked' : ''}>${({ plural: 'Plural object', negative: 'Negative', question: 'Question' })[key]}</label>`).join('')}</div><button class="text-button" data-sm-convert="literal">Edit text directly</button>`;
    $('beat-editor').innerHTML = `<div class="sm-section-heading"><h2>Line ${selected + 1}</h2><div class="sm-actions sm-beat-actions"><button data-sm-move="-1" aria-label="Move line up"${selected === 0 ? ' disabled' : ''}>↑</button><button data-sm-move="1" aria-label="Move line down"${selected === project.beats.length - 1 ? ' disabled' : ''}>↓</button><button data-sm-duplicate aria-label="Duplicate line"${project.beats.length >= 24 ? ' disabled' : ''}>Copy</button><button data-sm-remove aria-label="Delete line"${project.beats.length <= 1 ? ' disabled' : ''}>Delete</button></div></div><div class="sm-editor-grid"><label>Character<select data-sm-field="speaker">${project.cast.map((id, index) => option(index, CHARACTERS.find(person => person.id === id)?.name, index === beat.speaker)).join('')}</select></label><label>Expression<select data-sm-field="expression">${SCENE_EXPRESSIONS.map(value => option(value, value === 'auto' ? 'Automatic' : value[0].toUpperCase() + value.slice(1), value === beat.expression)).join('')}</select></label></div><div class="sm-dialogue-editor">${dialogue}${beat.mode === 'builder' ? '<p id="sm-line-error" class="sm-error" role="status" aria-live="polite"></p>' : ''}</div><details class="sm-action-settings"${beat.action !== 'none' || beat.pauseMs !== 600 ? ' open' : ''}><summary>Action and timing</summary><div class="sm-editor-grid"><label>Action<select data-sm-field="action">${Object.entries(actions).map(([value, label]) => option(value, label, value === beat.action)).join('')}</select></label><label>When<select data-sm-field="cue">${[['start', 'At the start'], ['end', 'After speaking'], ['word', 'At a word']].map(([value, label]) => option(value, label, value === beat.cue)).join('')}</select></label><label>Word number<input data-sm-field="wordIndex" type="number" min="1" max="300" value="${beat.wordIndex + 1}"${beat.cue !== 'word' ? ' disabled' : ''}></label><label>Pause after (seconds)<input data-sm-field="pauseMs" type="number" min="0" max="5" step="0.1" value="${beat.pauseMs / 1000}"></label></div><p class="sm-help">Characters move within the room. Leave the dialogue blank to add a quiet pause.</p></details>`;
    renderBuilderFeedback();
  }
  function renderLibrary() {
    const select = $('local-list'), previous = select.value || local.activeId;
    select.innerHTML = option('', local.scenes.length ? 'Choose a saved scene' : 'No saved scenes yet') + local.scenes.map(scene => option(scene.id, scene.name, scene.id === previous)).join('');
    for (const name of ['open-local', 'delete-local']) $(name).disabled = !select.value || Boolean(recording);
  }
  function renderCloud() {
    const element = $('cloud');
    if (!cloud) { element.innerHTML = '<p class="sm-help">Cloud saves are unavailable. You can save on this device or download a scene file.</p>'; return; }
    const state = cloud.state, busy = state.busy || state.loading || Boolean(recording);
    const active = document.activeElement?.dataset.smCloudFocus;
    if (!state.user) {
      element.innerHTML = `<p class="sm-help">${state.configured ? 'Sign in to save private scenes across devices.' : 'Cloud saves are unavailable. You can save scenes on this device.'}</p>${state.configured ? '<button class="secondary-button" data-sm-signin>Sign in</button>' : ''}${state.error ? `<p class="sm-error" role="alert">${escapeHTML(state.error)}</p>` : ''}`; return;
    }
    const status = project ? cloud.savedState(project) : 'local';
    element.innerHTML = `<div class="sm-section-heading"><div><h2>${escapeHTML(state.user.email || 'Your scenes')}</h2><p class="sm-help">${status === 'saved' ? 'Saved online.' : status === 'changed' ? 'You have changes to save.' : 'This scene is on your device.'}</p></div><button class="text-button" data-sm-cloud-refresh data-sm-cloud-focus="refresh"${busy ? ' disabled' : ''}>${state.loading ? 'Loading…' : 'Refresh'}</button></div><div class="sm-actions"><button class="primary-button" data-sm-cloud-save data-sm-cloud-focus="save"${busy ? ' disabled' : ''}>${state.busy ? 'Saving…' : 'Save online'}</button><button class="secondary-button" data-sm-cloud-copy data-sm-cloud-focus="copy"${busy ? ' disabled' : ''}>Save a new copy</button></div>${state.error ? `<p class="sm-error" role="alert">${escapeHTML(state.error)}</p>` : ''}${state.warning ? `<p class="sm-help">${escapeHTML(state.warning)}</p>` : ''}${state.conflict ? '<p class="sm-help">Save a new copy to keep both versions.</p>' : ''}<ul class="sm-cloud-list">${state.items.map(record => `<li><div><strong>${escapeHTML(record.document.name)}</strong><small>${record.document.beats.length} lines · ${escapeHTML(new Date(record.updated_at).toLocaleDateString())}</small></div><div class="sm-actions"><button class="secondary-button" data-sm-cloud-open="${record.id}" data-sm-cloud-focus="open-${record.id}"${busy ? ' disabled' : ''}>Open a copy</button><button class="text-button danger-button" data-sm-cloud-delete="${record.id}"${busy ? ' disabled' : ''}>Remove</button></div></li>`).join('') || `<li class="sm-help">${state.loading ? 'Loading your scenes…' : 'No saved cloud scenes yet.'}</li>`}</ul>${libraryDelete ? `<div class="sm-delete-confirm"><p>Remove &quot;${escapeHTML(libraryDelete.document.name)}&quot; from your cloud scenes? Copies on your device will stay.</p><div class="sm-actions"><button class="secondary-button" data-sm-cloud-cancel>Keep it</button><button class="secondary-button danger-button" data-sm-cloud-confirm${busy ? ' disabled' : ''}>Remove cloud copy</button></div></div>` : ''}`;
    if (active) [...element.querySelectorAll('[data-sm-cloud-focus]')].find(button => button.dataset.smCloudFocus === active)?.focus({ preventScroll: true });
  }
  function download(blob, filename) {
    const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const fileName = extension => `${project.name.replace(/[^\p{L}\p{N}_-]/gu, '-').slice(0, 60) || 'little-scene'}.${extension}`;
  function saveLocal(asCopy = false) {
    flushForm();
    const saved = validateSceneProject(project);
    if (asCopy) { saved.id = uid('scene'); saved.name = `${saved.name.slice(0, 72)} (copy)`; }
    const scenes = local.scenes.filter(scene => scene.id !== saved.id);
    const nextLocal = { ...local, scenes: [...scenes, saved], activeId: saved.id };
    saveSceneProjects(storage, nextLocal); local = nextLocal;
    if (asCopy) apply(saved); else renderLibrary();
    $('local-list').value = saved.id; $('local-status').textContent = `"${saved.name}" saved on this device.`; $('local-status').classList.remove('is-error');
    notify(asCopy ? 'Scene copy saved on this device.' : 'Scene saved on this device.');
  }
  async function recordVideo() {
    if (recording) return;
    flushForm();
    assertScenePlayable(compiled);
    if (compiled.duration > 60000) throw new Error('Shorten the scene to 60 seconds or less before recording.');
    const frozen = validateSceneProject(project), controller = new AbortController(); recording = controller; pause(); $('video-player').pause();
    renderPreviewVisibility();
    $('video-panel').hidden = false; $('video-panel').open = true;
    host.querySelectorAll('input,select,textarea,button').forEach(control => { if (!['sm-cancel-export', 'sm-close'].includes(control.id)) { control.dataset.smWasDisabled = String(control.disabled); control.disabled = true; } });
    $('cancel-export').hidden = false; $('video-progress').hidden = false; $('video-progress').value = 0; $('video-status').textContent = 'Preparing video…';
    $('cancel-export').focus({ preventScroll: true }); $('video-panel').scrollIntoView({ block: 'nearest', behavior: reduced() ? 'instant' : 'smooth' });
    try {
      const { exportSceneVideo } = await import('./scene-video.js');
      if (controller.signal.aborted) throw new DOMException('Recording cancelled.', 'AbortError');
      const result = await exportSceneVideo(frozen, { canvas: $('canvas'), renderer, signal: controller.signal, onProgress: value => {
        if (disposed || controller.signal.aborted) return;
        const progress = typeof value === 'number' ? value : value.progress ?? value.ratio ?? 0;
        $('video-progress').value = Math.max(0, Math.min(1, progress)); $('video-status').textContent = `Recording ${Math.round(progress * 100)}%…`;
      } });
      if (disposed || controller.signal.aborted) return;
      if (videoURL) URL.revokeObjectURL(videoURL); videoURL = URL.createObjectURL(result.blob);
      $('video-player').src = videoURL; $('video-download').href = videoURL; $('video-download').download = fileName(result.extension);
      $('video-result').hidden = false; $('video-status').textContent = `${result.extension.toUpperCase()} video ready. Preview it here or download it.`;
      download(result.blob, fileName(result.extension)); notify('Video ready.');
    } catch (error) { if (!disposed) $('video-status').textContent = error.name === 'AbortError' ? 'Recording cancelled.' : error.message ?? String(error); }
    finally {
      recording = null;
      if (!disposed) {
        host.querySelectorAll('[data-sm-was-disabled]').forEach(control => { control.disabled = control.dataset.smWasDisabled === 'true'; delete control.dataset.smWasDisabled; });
        $('video-panel').open = true;
        if (document.activeElement === $('cancel-export')) $('video-status').focus({ preventScroll: true });
        $('cancel-export').hidden = true; $('video-progress').hidden = true; renderPreviewVisibility(); renderCloud(); draw();
      }
    }
  }

  listen($('close'), 'click', close); listen($('undo'), 'click', safe(undo));
  for (const name of ['name', 'room', 'prop', 'captions', 'sound']) listen($(name), 'change', safe(event => patch(next => { next[name] = name === 'sound' ? event.target.checked : event.target.value; })));
  for (const index of [0, 1]) listen($(`cast-${index}`), 'change', safe(event => patch(next => { next.cast[index] = event.target.value; })));
  listen($('use-language'), 'click', safe(() => { patch(next => { next.language = structuredClone(getLanguage()); }); notify('Scene language updated.'); }));
  listen($('template'), 'change', renderChoices);
  listen($('remix'), 'click', safe(() => {
    if (!$('choice-label').hidden && !$('choice').value) throw new Error('Choose a reply first.');
    const next = createSceneProject(project.language, { room: project.room, episodeId: $('template').value, ...($('choice').value ? { choiceId: $('choice').value } : {}) });
    apply(next); selected = 0; position = 0; render();
  }));
  listen($('blank'), 'click', safe(() => { selected = 0; position = 0; apply(createSceneProject(project.language, { room: project.room })); }));
  listen($('play'), 'click', () => playing ? pause() : play()); listen($('restart'), 'click', () => { pause(); position = 0; draw(); });
  listen($('toggle-preview'), 'click', () => {
    if (recording) return;
    const shouldResume = resumeAfterPreview;
    if (!previewCollapsed) {
      const wasPlaying = playing;
      pause(); resumeAfterPreview = wasPlaying; $('video-player').pause();
    }
    previewCollapsed = !previewCollapsed;
    try { storage.setItem(PREVIEW_HIDDEN_KEY, String(previewCollapsed)); } catch { /* Keep the toggle usable when storage is blocked. */ }
    renderPreviewVisibility(); draw();
    if (!previewCollapsed) { resumeAfterPreview = false; if (shouldResume && !reduced()) play(); }
  });
  listen($('seek'), 'input', () => { pause(); position = Number($('seek').value); draw(); });
  listen($('canvas'), 'keydown', event => { if (event.code === 'Space') { event.preventDefault(); playing ? pause() : play(); } else if (['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); pause(); position = Math.max(0, Math.min(compiled.duration, position + (event.key === 'ArrowLeft' ? -1000 : 1000))); draw(); } });
  listen($('beats'), 'click', safe(event => { const button = event.target.closest('[data-sm-beat]'); if (button) selectBeat(Number(button.dataset.smBeat)); }));
  listen($('beat-editor'), 'change', safe(event => {
    const field = event.target.dataset.smField, key = event.target.dataset.smOption;
    if (!field && !key) return;
    patch(next => {
      const beat = next.beats[selected];
      if (key) { beat.options ??= {}; beat.options[key] = event.target.type === 'checkbox' ? event.target.checked : event.target.value; }
      else beat[field] = ['speaker', 'wordIndex', 'pauseMs'].includes(field) ? Number(event.target.value) * (field === 'pauseMs' ? 1000 : 1) - (field === 'wordIndex' ? 1 : 0) : event.target.value;
    }, { editor: field === 'cue' });
  }));
  listen($('beat-editor'), 'click', safe(event => {
    const button = event.target.closest('button'); if (!button) return; const beat = project.beats[selected];
    if (button.dataset.smConvert) apply(convertSceneBeat(project, beat.id, button.dataset.smConvert));
    else if (button.dataset.smMove) { const direction = Number(button.dataset.smMove), next = moveSceneBeat(project, beat.id, direction); checkpoint(); selected += direction; apply(next, { remember: false }); }
    else if (button.hasAttribute('data-sm-duplicate')) { const next = duplicateSceneBeat(project, beat.id); checkpoint(); selected++; apply(next, { remember: false }); }
    else if (button.hasAttribute('data-sm-remove')) apply(removeSceneBeat(project, beat.id));
  }));
  const addBeat = quiet => {
    const next = structuredClone(project); next.beats.push({ id: uid('beat'), speaker: (project.beats.at(-1)?.speaker ?? 1) === 0 ? 1 : 0, mode: quiet ? 'literal' : 'builder', ...(quiet ? { text: '', english: '' } : { options: builderOptions(project.language) }), action: 'none', cue: 'start', wordIndex: 0, pauseMs: quiet ? 1000 : 600 });
    checkpoint(); selected = next.beats.length - 1; apply(next, { remember: false });
  };
  listen($('add-beat'), 'click', safe(() => addBeat(false))); listen($('add-pause'), 'click', safe(() => addBeat(true)));
  listen($('save-local'), 'click', safe(() => saveLocal())); listen($('copy-local'), 'click', safe(() => saveLocal(true)));
  listen($('local-list'), 'change', () => { $('open-local').disabled = $('delete-local').disabled = !$('local-list').value; });
  listen($('open-local'), 'click', safe(() => { const scene = local.scenes.find(item => item.id === $('local-list').value); if (scene) { selected = 0; position = 0; apply(scene); local.activeId = scene.id; persistLibrary(); } }));
  listen($('delete-local'), 'click', safe(() => {
    const index = local.scenes.findIndex(scene => scene.id === $('local-list').value); if (index < 0) return;
    const scene = local.scenes[index], nextLocal = { ...local, scenes: local.scenes.filter(item => item.id !== scene.id), activeId: local.activeId === scene.id ? null : local.activeId };
    saveSceneProjects(storage, nextLocal); checkpoint({ kind: 'delete', scene, index }); local = nextLocal; renderLibrary(); $('undo').disabled = false; notify('Saved scene deleted. Undo restores it. Your draft stays open.');
  }));
  listen($('export-json'), 'click', safe(() => { flushForm(); download(new Blob([serializeSceneProject(project)], { type: 'application/json' }), fileName('json')); }));
  listen($('import-json'), 'click', () => $('file').click());
  listen($('file'), 'change', async event => {
    const file = event.target.files?.[0]; if (!file) return; const epoch = ++fileEpoch, previous = JSON.stringify(project);
    try {
      if (file.size > 1_000_000) throw new Error('Choose a scene file smaller than 1 MB.');
      const parsed = parseSceneImport(await file.text());
      if (disposed || epoch !== fileEpoch) return;
      if (previous !== JSON.stringify(project)) throw new Error('The current scene changed while opening the file. Choose the file again when ready.');
      selected = 0; position = 0; apply(parsed); notify('Scene opened. Choose Save to add it to your saved scenes.');
    } catch (error) { if (!disposed) report(error); } finally { event.target.value = ''; }
  });
  listen($('export-recovery'), 'click', () => download(new Blob([local.recoveryRaw || currentRecoveryRaw || ''], { type: 'application/json' }), 'scene-recovery.json'));
  listen($('video-export'), 'click', () => { void recordVideo().catch(report); }); listen($('cancel-export'), 'click', () => recording?.abort());
  listen($('cloud'), 'click', async event => {
    const button = event.target.closest('button'); if (!button || !cloud) return;
    try {
      if (button.hasAttribute('data-sm-signin')) { pause(); document.getElementById('account-button')?.click(); }
      else if (button.hasAttribute('data-sm-cloud-refresh')) await cloud.refresh();
      else if (button.hasAttribute('data-sm-cloud-save') || button.hasAttribute('data-sm-cloud-copy')) { flushForm(); const result = await cloud.save(project, { asCopy: button.hasAttribute('data-sm-cloud-copy') }); if (result && !disposed) notify('Scene saved online.'); }
      else if (button.dataset.smCloudOpen) {
        const record = cloud.state.items.find(item => item.id === button.dataset.smCloudOpen); if (!record) throw new Error('Refresh the cloud library to open this scene.');
        const scene = validateSceneProject(record.document); scene.id = uid('scene'); selected = 0; position = 0; apply(scene); cloud.linkLocal(scene.id, record); notify('Cloud scene opened as a new draft.');
      } else if (button.dataset.smCloudDelete) { libraryDelete = cloud.state.items.find(item => item.id === button.dataset.smCloudDelete); renderCloud(); }
      else if (button.hasAttribute('data-sm-cloud-cancel')) { libraryDelete = null; renderCloud(); }
      else if (button.hasAttribute('data-sm-cloud-confirm') && libraryDelete) { const result = await cloud.remove(libraryDelete); if (result) { libraryDelete = null; renderCloud(); notify('Cloud scene removed. Copies on your device will stay.'); } }
    } catch (error) { if (!disposed) report(error); }
  });
  let lastOwner = null;
  const unsubscribeCloud = cloud?.subscribe(state => { if (lastOwner !== state.user?.id) { libraryDelete = null; lastOwner = state.user?.id; } if (!disposed) renderCloud(); });
  if (cloud) void cloud.start().catch(report);
  listen(document, 'visibilitychange', () => { if (document.hidden) { pause(); if (recording) { recording.abort(); $('video-status').textContent = 'Recording cancelled because the tab was hidden.'; } } });
  listen(window, 'pagehide', () => { pause(); recording?.abort(); });

  function open(options = {}) {
    if (disposed) return;
    opened = true; host.hidden = false;
    if (!project) { const restored = options.episodeId ? null : recoverCurrent(); project = restored ?? createSceneProject(getLanguage(), options); compiled = compileSceneProject(project); saveCurrent(); }
    else if (options.episodeId) apply(createSceneProject(getLanguage(), options));
    render(); $('title').focus({ preventScroll: true }); host.scrollIntoView({ block: 'start', behavior: reduced() ? 'instant' : 'smooth' });
    // Playback always begins paused so reduced-motion users and editors control it.
  }
  function close() { if (disposed) return; pause(); recording?.abort(); $('video-player').pause(); opened = false; host.hidden = true; onClose(); }
  function destroy() { if (disposed) return; pause(); recording?.abort(); disposed = true; fileEpoch++; events.abort(); unsubscribeCloud?.(); cloud?.destroy(); audio.destroy(); renderer.destroy(); if (videoURL) URL.revokeObjectURL(videoURL); host.replaceChildren(); }
  return { open, close, destroy };
}
