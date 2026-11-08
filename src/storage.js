import { createLanguage, validateLanguage } from './engine.js';

export const STORAGE_KEY = 'little-languages-studio-v1';
export const RECOVERY_STORAGE_KEY = `${STORAGE_KEY}-recovery`;
const MAX_LANGUAGES = 50;
const MAX_PROJECT_SIZE = 10_000_000;

function fallback(warning = null, recoveryRaw) {
  const language = createLanguage();
  return { languages: [language], activeId: language.id, warning, ...(typeof recoveryRaw === 'string' ? { recoveryRaw } : {}) };
}

function projectShape(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The saved project is not an object.');
  if (Object.keys(value).some((key) => ['__proto__', 'constructor', 'prototype'].includes(key))) throw new Error('The saved project contains unsafe keys.');
  if (value.version !== undefined && value.version !== 1) throw new Error('This saved project uses an unsupported version.');
  if (!Array.isArray(value.languages) || !value.languages.length) throw new Error('A project needs at least one language.');
  if (value.languages.length > MAX_LANGUAGES) throw new Error(`A project can contain at most ${MAX_LANGUAGES} languages. Export a backup before making a new project.`);
}

/** Read-only recovery. Neither damaged nor valid saves are rewritten during load. */
export function loadProject(storage) {
  let raw;
  try {
    if (!storage || typeof storage.getItem !== 'function') throw new Error('Unavailable');
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return fallback('Browser storage is unavailable. You can work in this tab; export a backup to keep your languages.');
  }
  if (raw === null || raw === undefined) return fallback();
  try {
    if (typeof raw !== 'string' || raw.length > MAX_PROJECT_SIZE) throw new Error('The saved project exceeds the supported size.');
    const project = JSON.parse(raw);
    projectShape(project);
    if (project.version !== 1) throw new Error('The saved project has no supported version.');
    const languages = [];
    const ids = new Set();
    let skipped = 0;
    for (const candidate of project.languages) {
      try {
        const language = validateLanguage(candidate);
        if (ids.has(language.id)) throw new Error('Duplicate language ID.');
        ids.add(language.id);
        languages.push(language);
      } catch { skipped++; }
    }
    if (!languages.length) throw new Error('No valid saved languages could be recovered.');
    const activeId = ids.has(project.activeId) ? project.activeId : languages[0].id;
    const warnings = [];
    if (skipped) warnings.push(`Recovered ${languages.length} saved language${languages.length === 1 ? '' : 's'}; skipped ${skipped} damaged or duplicate entr${skipped === 1 ? 'y' : 'ies'}. The original save has not been changed.`);
    if (activeId !== project.activeId) warnings.push('The saved selection was unavailable, so the first valid language is open.');
    return { languages, activeId, warning: warnings.length ? warnings.join(' ') : null, ...(skipped ? { recoveryRaw: raw } : {}) };
  } catch (error) {
    return fallback(`The saved project could not be recovered: ${error.message} A fresh Luma is open; the original save has not been changed. A recovery copy will be preserved before your next save.`, raw);
  }
}

/** Preserves damaged originals before writing the repaired project. Raw recovery data
 * stays in its own storage key and is never included in normal project JSON. */
export function saveProject(storage, project) {
  projectShape(project);
  const languages = project.languages.map(validateLanguage);
  const ids = new Set(languages.map((language) => language.id));
  if (ids.size !== languages.length) throw new Error('Language IDs must be unique; this project contains a duplicate.');
  const activeId = ids.has(project.activeId) ? project.activeId : languages[0].id;
  const normalized = { version: 1, languages, activeId };
  const serialized = JSON.stringify(normalized);
  if (serialized.length > MAX_PROJECT_SIZE) throw new Error('This project is too large for a browser save. Export a backup and keep fewer languages in this project.');
  if (project.recoveryRaw !== undefined && typeof project.recoveryRaw !== 'string') throw new Error('The recovery backup must be text. The original save has not been changed.');
  const hasRecovery = typeof project.recoveryRaw === 'string';
  try {
    if (!storage || typeof storage.setItem !== 'function') throw new Error('Unavailable');
    if (hasRecovery) {
      if (typeof storage.getItem !== 'function') throw new Error('Unavailable');
      if (storage.getItem(RECOVERY_STORAGE_KEY) !== project.recoveryRaw) storage.setItem(RECOVERY_STORAGE_KEY, project.recoveryRaw);
    }
    storage.setItem(STORAGE_KEY, serialized);
  } catch (error) {
    if (error?.name === 'QuotaExceededError' || error?.name === 'NS_ERROR_DOM_QUOTA_REACHED' || error?.code === 22 || error?.code === 1014) throw new Error('Browser storage is full. Export a backup, then remove unused languages or free browser storage before saving again.');
    throw new Error('Browser storage is unavailable. Your changes remain in this tab; export a backup to keep them.');
  }
  return { ...normalized, ...(hasRecovery ? { recoveryRaw: project.recoveryRaw } : {}) };
}
