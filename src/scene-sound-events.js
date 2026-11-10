import { sampleAction } from './scene-direction.js';
import { getSceneLayout } from './scene-layout.js';

const contacts = { bread: 'thud', basket: 'thud', umbrella: 'tap', book: 'tap', cup: 'clink', ticket: 'tap', star: 'tap', bottle: 'clink' };

/** Sound cues use the same contact offset as the visual action sampler. */
export function actionSoundEvents(action, prop, { time = 0, duration = 700 } = {}) {
  const cue = (offset, effect, motionOnly = false) => ({ time: time + Math.round(offset), effect, ...(motionOnly ? { motionOnly: true } : {}) });
  if (action === 'walk') return [cue(duration * 0.25, 'step', true), cue(duration * 0.5, 'step', true)];
  if (!['pass', 'drop'].includes(action) || !contacts[prop]) return [];
  const contact = -sampleAction(action, 0, { duration }).impactAge;
  return [cue(duration * 0.18, action === 'pass' ? 'slide' : 'swish', true), cue(contact, contacts[prop])];
}

export function episodeSoundEvents(scene, timing) {
  const type = timing.episodeType;
  if (type === 'lost-property') return [timing.offerStart, timing.returnStart].map(time => ({ time: time + 120, effect: 'slide', motionOnly: true }));
  if (type !== 'original') return [];
  const events = [140, 420].map(time => ({ time, effect: 'step', motionOnly: true }));
  if (getSceneLayout(scene.id).prop.mode === 'counter') {
    events.push(...actionSoundEvents(scene.id === 'bakery' ? 'drop' : 'pass', scene.prop, { time: timing.offerStart }));
  }
  return events.sort((a, b) => a.time - b.time);
}

/** Only fresh crossings are audible; seeking and delayed frames never replay a backlog. */
export function crossedSoundEvents(events, previous, current, { reduced = false } = {}) {
  if (!Number.isFinite(previous) || current <= previous) return [];
  return events.filter(event => event.time > previous && event.time <= current && current - event.time < 150
    && !(reduced && event.motionOnly));
}
