import test from 'node:test';
import assert from 'node:assert/strict';
import { createLanguage } from '../src/engine.js';
import { createSceneProject } from '../src/scene-project.js';
import { createVideoExporter, selectRecordingFormat } from '../src/scene-video.js';

const scene = () => {
  const project = createSceneProject(createLanguage({name:'Video test'}));
  project.sound = false;
  project.beats = [{id:'one',speaker:0,mode:'literal',text:'Hi.',english:'Hello.',action:'gesture',cue:'end',wordIndex:0,pauseMs:0}];
  return project;
};
function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
async function outcomeWithin(promise) {
  let timer;
  try {
    return await Promise.race([
      promise.then(value => ({ value }), error => ({ error })),
      new Promise(resolve => { timer = setTimeout(() => resolve({ pending: true }), 200); }),
    ]);
  } finally { clearTimeout(timer); }
}
function harness({fail=false, resumeGate, connectFails=false}={}) {
  let now=0, raf=0;
  const tracks=[{stopped:false,stop(){this.stopped=true;}}];
  const document = new EventTarget(); document.hidden=false;
  const contexts=[],sources=[],destinations=[];
  class AudioContext extends EventTarget {
    constructor(){super();this.state='suspended';this.sampleRate=8000;this.closed=false;contexts.push(this);}
    get currentTime(){return now/1000;}
    async resume(){if(resumeGate)await resumeGate.promise;this.state='running';}
    async close(){this.closed=true;this.state='closed';this.dispatchEvent(new Event('statechange'));}
    createMediaStreamDestination(){
      const track={stopped:false,stop(){this.stopped=true;}};
      const node={disconnected:false,stream:{getAudioTracks:()=>[track],getTracks:()=>[track]},disconnect(){this.disconnected=true;}};
      destinations.push(node);return node;
    }
    createBuffer(_channels,length){const samples=new Float32Array(length);return {getChannelData:()=>samples};}
    createBufferSource(){
      const source={started:false,stopped:false,disconnected:false,connect(){if(connectFails)throw new Error('Audio connection failed');},start(time){this.started=true;this.startTime=time;},stop(){this.stopped=true;},disconnect(){this.disconnected=true;}};
      sources.push(source);return source;
    }
  }
  class Recorder extends EventTarget {
    static isTypeSupported(type){return type==='video/webm;codecs=vp8,opus';}
    constructor(stream,options){super();this.mimeType=options.mimeType;this.state='inactive';}
    start(){this.state='recording';if(fail)queueMicrotask(()=>this.dispatchEvent(new Event('error')));}
    stop(){this.state='inactive';const e=new Event('dataavailable');e.data=new Blob(['real-test-chunk'],{type:this.mimeType});this.dispatchEvent(e);queueMicrotask(()=>this.dispatchEvent(new Event('stop')));}
  }
  const env={MediaRecorder:Recorder,AudioContext,document,now:()=>now,requestAnimationFrame:fn=>{raf=setTimeout(()=>{now+=250;fn(now);},0);return raf;},cancelAnimationFrame:clearTimeout,setTimeout,clearTimeout};
  const frames=[];
  const canvas={captureStream:()=>({getTracks:()=>tracks,getVideoTracks:()=>tracks,addTrack:track=>tracks.push(track)})};
  const renderer={draw:(compiled,time)=>frames.push({compiled,time})};
  return {env,canvas,renderer,tracks,frames,document,contexts,sources,destinations};
}
test('recording chooses only supported formats and never disguises WebM as MP4',()=>{
  assert.equal(selectRecordingFormat({isTypeSupported:t=>t==='video/webm;codecs=vp8,opus'}).extension,'webm');
  assert.equal(selectRecordingFormat({isTypeSupported:t=>t==='video/mp4'}).extension,'mp4');
  assert.throws(()=>selectRecordingFormat({isTypeSupported:()=>false}),/support/i);
});
test('video renders an isolated snapshot, returns the actual format and releases tracks',async()=>{
  const h=harness(), project=scene();
  const pending=createVideoExporter(h.env)(project,{canvas:h.canvas,renderer:h.renderer});
  project.beats[0].text='Changed while exporting';
  const result=await pending;
  assert.equal(result.extension,'webm');assert.match(result.mimeType,/webm/);assert.ok(result.blob.size>0);
  assert.ok(h.frames.length>2);assert.equal(h.frames[0].compiled.project.beats[0].text,'Hi.');
  assert.equal(h.frames.at(-1).time,result.duration);
  assert.ok(h.tracks.every(t=>t.stopped));
});
test('long clips are rejected before opening capture resources',async()=>{
  const h=harness(),project=scene();project.beats=Array.from({length:24},(_,i)=>({...project.beats[0],id:`beat-${i}`,text:'a'.repeat(300),pauseMs:5000}));
  let opened=false;h.canvas.captureStream=()=>{opened=true;};
  await assert.rejects(createVideoExporter(h.env)(project,{canvas:h.canvas,renderer:h.renderer}),/60 seconds/);
  assert.equal(opened,false);
});
test('cancel and hidden tabs stop capture and reject without returning a partial video',async()=>{
  for(const kind of ['abort','hidden']){
    const h=harness(),abort=new AbortController();
    const promise=createVideoExporter(h.env)(scene(),{canvas:h.canvas,renderer:h.renderer,signal:abort.signal});
    if(kind==='abort')abort.abort();else {h.document.hidden=true;h.document.dispatchEvent(new Event('visibilitychange'));}
    await assert.rejects(promise,kind==='abort'?{name:'AbortError'}:/visible|hidden|tab/i);
    assert.ok(h.tracks.every(t=>t.stopped));
  }
});
test('encoder errors release recording resources',async()=>{
  const h=harness({fail:true});
  await assert.rejects(createVideoExporter(h.env)(scene(),{canvas:h.canvas,renderer:h.renderer}),/record|encod/i);
  assert.ok(h.tracks.every(t=>t.stopped));
});

test('cancellation during a pending audio resume promptly releases capture and closes the context',async()=>{
  const resumeGate=deferred(),h=harness({resumeGate}),controller=new AbortController(),project=scene();project.sound=true;
  const pending=createVideoExporter(h.env)(project,{canvas:h.canvas,renderer:h.renderer,signal:controller.signal});
  assert.equal(h.contexts.length,1,'Capture and audio startup began before cancellation');
  controller.abort();
  try {
    const outcome=await outcomeWithin(pending);
    assert.equal(outcome.error?.name,'AbortError','Cancel must settle without waiting for audio permission');
    assert.ok(h.tracks.every(track=>track.stopped));
    assert.equal(h.contexts[0].closed,true);
    assert.equal(h.sources.length,0,'No audio may be prepared after cancelled startup');
  } finally { resumeGate.resolve();await pending.catch(()=>{}); }
});

test('hiding the tab during audio startup cancels pending resume and cleans resources',async()=>{
  const resumeGate=deferred(),h=harness({resumeGate}),project=scene();project.sound=true;
  const pending=createVideoExporter(h.env)(project,{canvas:h.canvas,renderer:h.renderer});
  h.document.hidden=true;h.document.dispatchEvent(new Event('visibilitychange'));
  try {
    const outcome=await outcomeWithin(pending);
    assert.match(outcome.error?.message??'',/hidden|visible|tab/i);
    assert.ok(h.tracks.every(track=>track.stopped));
    assert.equal(h.contexts[0].closed,true);
  } finally { resumeGate.resolve();await pending.catch(()=>{}); }
});

test('an owned renderer that arrives after cancellation is disposed without opening capture',async()=>{
  const ready=deferred(),h=harness(),controller=new AbortController();let opened=false,destroyed=0;
  h.canvas.captureStream=()=>{opened=true;throw new Error('Cancelled capture must not start');};
  const owned={draw(){throw new Error('Cancelled renderer must not draw');},destroy(){destroyed++;}};
  const pending=createVideoExporter(h.env,{createRenderer:()=>ready.promise})(scene(),{canvas:h.canvas,signal:controller.signal});
  controller.abort();
  const outcome=await outcomeWithin(pending);
  ready.resolve(owned);await Promise.resolve();await Promise.resolve();
  assert.equal(outcome.error?.name,'AbortError');
  assert.equal(opened,false);
  assert.equal(destroyed,1,'A renderer finishing after the exporter exits is still released once');
});

test('audio nodes, tracks and owned renderer are released after successful export and encoder failure',async()=>{
  for(const fail of [false,true]){
    const h=harness({fail}),project=scene();project.sound=true;let destroyed=0;
    const renderer={...h.renderer,destroy(){destroyed++;}};
    const pending=createVideoExporter(h.env,{createRenderer:async()=>renderer})(project,{canvas:h.canvas});
    if(fail)await assert.rejects(pending,/record|encod/i);else assert.ok((await pending).blob.size);
    assert.ok(h.sources.length>0);
    assert.ok(h.sources.every(source=>source.started&&source.stopped&&source.disconnected));
    assert.ok(h.tracks.every(track=>track.stopped));
    assert.ok(h.destinations.every(node=>node.disconnected&&node.stream.getTracks().every(track=>track.stopped)));
    assert.ok(h.contexts.every(context=>context.closed));
    assert.equal(destroyed,1);
  }
});

test('a source whose audio connection fails is still stopped and disconnected',async()=>{
  const h=harness({connectFails:true}),project=scene();project.sound=true;
  await assert.rejects(createVideoExporter(h.env)(project,{canvas:h.canvas,renderer:h.renderer}),/connection failed/);
  assert.equal(h.sources.length,1);
  assert.equal(h.sources[0].stopped,true);
  assert.equal(h.sources[0].disconnected,true);
  assert.ok(h.tracks.every(track=>track.stopped));
  assert.equal(h.contexts[0].closed,true);
});
