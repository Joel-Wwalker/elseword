import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleCharacterIdle } from '../src/scene-idle.js';
import { CHARACTERS } from '../src/scenes.js';
import { createLanguage } from '../src/engine.js';
import { createSceneProject, compileSceneProject, sampleSceneProject } from '../src/scene-project.js';

test('idle gestures are sparse, bounded, deterministic, and distinct across characters',()=>{
  const signatures=[];
  for(const {id} of CHARACTERS){
    let moving=0;const signature=[];
    for(let time=0;time<60000;time+=100){
      const idle=sampleCharacterIdle(id,time);
      assert.ok(idle.lean>=0 && idle.lean<=0.65);
      assert.ok(idle.scaleY>=0.99 && idle.scaleY<=1);
      if(idle.lean || idle.scaleY!==1)moving++;
      signature.push(idle);
      assert.deepEqual(idle,sampleCharacterIdle(id,time));
    }
    assert.ok(moving>0 && moving<300,`${id} has quiet gaps`);
    signatures.push(JSON.stringify(signature));
  }
  assert.equal(new Set(signatures).size,CHARACTERS.length);
});

test('reduced motion, activity and its settling period retain a neutral posture',()=>{
  const neutral={lean:0,scaleY:1};
  for(let time=0;time<20000;time+=100){
    assert.deepEqual(sampleCharacterIdle('moss',time,{reduced:true}),neutral);
    assert.deepEqual(sampleCharacterIdle('moss',time,{quietSince:time+500}),neutral);
    assert.deepEqual(sampleCharacterIdle('moss',time,{quietSince:time-300}),neutral);
  }
  assert.deepEqual(sampleCharacterIdle('missing',1000),neutral);
  assert.deepEqual(sampleCharacterIdle('moss',NaN),neutral);
});

test('scene seeking reconstructs idles without moving feet or props; actions take priority',()=>{
  const project=createSceneProject(createLanguage({name:'Idle test'}));
  project.beats=[{id:'pause',speaker:0,mode:'literal',text:'',english:'',action:'none',cue:'start',wordIndex:0,pauseMs:5000}];
  const compiled=compileSceneProject(project);
  let sawIdle=false;
  for(let time=0;time<compiled.duration;time+=100){
    const active=sampleSceneProject(compiled,time),still=sampleSceneProject(compiled,time,{reduced:true});
    assert.deepEqual(active.prop,still.prop);
    active.actors.forEach((actor,i)=>{
      assert.equal(actor.x,still.actors[i].x);assert.equal(actor.y,still.actors[i].y);
      if(actor.scaleY!==1 || actor.lean)sawIdle=true;
      assert.equal(still.actors[i].scaleY,1);
    });
    assert.deepEqual(sampleSceneProject(compiled,time),active);
  }
  assert.ok(sawIdle);
  project.beats[0]={...project.beats[0],action:'drop'};
  const action=compileSceneProject(project);
  for(const time of [0,175,385,650]){
    const frame=sampleSceneProject(action,time);
    assert.ok(frame.actors.every(actor=>actor.scaleY===1),'No idle compression during an action or reaction');
  }
});
