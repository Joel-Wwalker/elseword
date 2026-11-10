import test from 'node:test';
import assert from 'node:assert/strict';
import { actionSoundEvents, episodeSoundEvents, crossedSoundEvents } from '../src/scene-sound-events.js';
import { createLanguage } from '../src/engine.js';
import { createSceneProject, compileSceneProject, sampleSceneProject } from '../src/scene-project.js';
import { getSceneEpisode } from '../src/scenes.js';
import { buildDialogue } from '../src/scene-player.js';
import { getEpisodeTiming, sampleSceneLayout } from '../src/scene-layout.js';

test('material contacts follow the action contact frame, with movement before contact', () => {
  for (const [prop, effect] of [['bread','thud'], ['basket','thud'], ['cup','clink'], ['bottle','clink'], ['book','tap']]) {
    const events = actionSoundEvents('drop', prop, { time: 1000, duration: 700 });
    assert.equal(events.at(-1).time, 1385);
    assert.equal(events.at(-1).effect, effect);
    assert.ok(events[0].time < events.at(-1).time);
  }
  assert.deepEqual(actionSoundEvents('pass','none'), []);
  assert.deepEqual(actionSoundEvents('drop','none'), []);
  assert.deepEqual(actionSoundEvents('none','cup'), []);
  assert.deepEqual(actionSoundEvents('gesture','cup'), []);
});

test('World contact follows translated episode timing and the visible prop landing', () => {
  const scene = getSceneEpisode('bakery','original');
  const dialogue = buildDialogue(scene, createLanguage({name:'Sound test'}));
  const timing = getEpisodeTiming(scene, dialogue);
  const contact = episodeSoundEvents(scene, timing).find(event => event.effect === 'thud');
  assert.equal(contact.time, timing.offerStart + 385);
  const frame = sampleSceneLayout(scene.id, {...timing, time:contact.time});
  assert.equal(frame.impact, 1);
  assert.ok(episodeSoundEvents(getSceneEpisode('busstop','original'), timing).every(event => event.effect === 'step'));
  assert.deepEqual(episodeSoundEvents({...scene, animation:{type:'cold-tea'}}, {...timing,episodeType:'cold-tea'}), []);
});

test('crossing cues is silent on seeks and redraws and never backfills old sounds', () => {
  const events = [{time:100,effect:'step',motionOnly:true},{time:200,effect:'thud'}];
  assert.deepEqual(crossedSoundEvents(events, 90, 110), [events[0]]);
  assert.deepEqual(crossedSoundEvents(events, 110, 110), []);
  assert.deepEqual(crossedSoundEvents(events, 200, 90), []);
  assert.deepEqual(crossedSoundEvents(events, 0, 1000), []);
  assert.deepEqual(crossedSoundEvents(events, 0, 210, {reduced:true}), [events[1]]);
  assert.deepEqual(crossedSoundEvents(events, 200, 210), []);
});

test('compiled scene effects share visual contacts, remain sorted, and honor silence', () => {
  const scene = createSceneProject(createLanguage({name:'Contact test'}));
  scene.beats = [{id:'drop', speaker:1, mode:'literal', text:'Hello.', english:'Hello.', action:'drop', cue:'end', pauseMs:600, wordIndex:0}];
  const compiled = compileSceneProject(scene);
  const effects = compiled.audioEvents.filter(event => event.effect);
  assert.ok(effects.length >= 2);
  const contact = effects.find(event => event.effect === 'thud');
  assert.ok(sampleSceneProject(compiled,contact.time).effects.length > 0);
  assert.ok(compiled.audioEvents.every((event,index,all)=>!index || event.time>=all[index-1].time));
  assert.ok(compiled.audioEvents.every(event=>event.time < compiled.duration));
  scene.sound = false;
  assert.deepEqual(compileSceneProject(scene).audioEvents, []);
});
