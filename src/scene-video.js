import { compileSceneProject, validateSceneProject, assertScenePlayable } from './scene-project.js';
import { makeBlipSamples } from './text-audio.js';
import { makeEffectSamples } from './scene-sounds.js';

export function selectRecordingFormat(Recorder) {
  if (typeof Recorder?.isTypeSupported !== 'function') throw new Error('This browser does not support video recording. You can still save an editable scene.');
  const candidates=['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'];
  for (const mimeType of candidates) {
    try { if (Recorder.isTypeSupported(mimeType)) return {mimeType,extension:mimeType.includes('mp4')?'mp4':'webm'}; } catch { /* Try the next advertised format. */ }
  }
  throw new Error('This browser does not support a compatible video format. Try a current Chrome, Edge, Firefox, or Safari browser.');
}

const aborted = () => new DOMException('Video export cancelled. Your scene is still saved.', 'AbortError');
const createRenderer = async canvas => (await import('./scene-renderer.js')).createSceneRenderer(canvas);

// A browser boundary makes capture lifecycle testable without pretending to encode video in Node.
export function createVideoExporter(environment = globalThis, { createRenderer: prepareRenderer = createRenderer } = {}) {
  return async function exportVideo(value, {canvas,renderer,onProgress=()=>{},signal}={}) {
    const project=validateSceneProject(value);
    const compiled=compileSceneProject(project);
    assertScenePlayable(compiled);
    if (compiled.duration>60_000) throw new Error('Video exports can be up to 60 seconds. Shorten the dialogue or pauses, or split this into two scenes.');
    if (signal?.aborted) throw aborted();
    const doc=environment.document;
    if (doc?.hidden) throw new Error('Keep this tab visible while exporting a video.');
    const format=selectRecordingFormat(environment.MediaRecorder);
    if (typeof canvas?.captureStream!=='function') throw new Error('Canvas video capture is unavailable in this browser. Your editable scene can still be downloaded.');
    const raf=environment.requestAnimationFrame.bind(environment), cancelFrame=environment.cancelAnimationFrame.bind(environment);
    const later=environment.setTimeout.bind(environment), clearLater=environment.clearTimeout.bind(environment);
    const now=environment.now || (()=>environment.performance.now());
    let capture,context,destination,recorder,frame,timer,ownedRenderer=false,removeListeners=()=>{};
    const sources=[];
    // Startup may wait for assets or audio permission indefinitely. Cancellation
    // owns those waits as well as recording, so capture can always be released.
    let cancellationError, rejectCancellation;
    const cancellation=new Promise((_resolve,reject)=>{rejectCancellation=reject;});
    void cancellation.catch(()=>{}); // An abort between awaited phases is still handled.
    const cancel=error=>{if(!cancellationError){cancellationError=error;rejectCancellation(error);}};
    const onAbort=()=>cancel(aborted());
    const onHidden=()=>{if(doc.hidden)cancel(new Error('Export stopped because the tab was hidden. Keep it visible and try again.'));};
    const checkCancellation=()=>{if(cancellationError)throw cancellationError;};
    const wait=promise=>Promise.race([promise,cancellation]);
    signal?.addEventListener('abort',onAbort,{once:true});
    doc?.addEventListener('visibilitychange',onHidden);
    try {
      if (signal?.aborted) onAbort();
      checkCancellation();
      if (!renderer) {
        const pendingRenderer=Promise.resolve(prepareRenderer(canvas)).then(created=>{
          if(cancellationError){try{created?.destroy();}catch{/* Release a late owned renderer. */}throw cancellationError;}
          ownedRenderer=true;renderer=created;return created;
        });
        renderer=await wait(pendingRenderer);
      }
      checkCancellation();
      renderer.draw(compiled,0);
      checkCancellation();
      capture=canvas.captureStream(30);
      if (!capture.getVideoTracks().length) throw new Error('The browser could not open video capture.');
      const prepared=[];
      if (project.sound) {
        const AudioContext=environment.AudioContext || environment.webkitAudioContext;
        if (!AudioContext) throw new Error('Sound export is unavailable. Turn off scene sound to export a silent clip.');
        context=new AudioContext();
        await wait(context.resume());
        checkCancellation();
        if (context.state!=='running') throw new Error('Audio could not start. Click Export video again, or turn off scene sound.');
        destination=context.createMediaStreamDestination();
        for (const track of destination.stream.getAudioTracks()) capture.addTrack(track);
        const buffers=new Map();
        for (const event of compiled.audioEvents) {
          const key=event.effect ? `effect:${event.effect}` : `voice:${event.voice}:${event.character}`;
          let buffer=buffers.get(key);
          if (!buffer) { const samples=event.effect ? makeEffectSamples(event.effect,context.sampleRate) : makeBlipSamples(event.voice,event.character,context.sampleRate);buffer=context.createBuffer(1,samples.length,context.sampleRate);buffer.getChannelData(0).set(samples);buffers.set(key,buffer); }
          const source=context.createBufferSource();sources.push(source);source.buffer=buffer;source.connect(destination);prepared.push({source,time:event.time});
        }
      }
      if (doc?.hidden) throw new Error('Keep this tab visible while exporting a video.');
      checkCancellation();
      recorder=new environment.MediaRecorder(capture,{mimeType:format.mimeType,videoBitsPerSecond:3_000_000,audioBitsPerSecond:96_000});
      const chunks=[];
      await wait(new Promise((resolve,reject)=>{
        let settled=false,finishing=false;
        const finish=error=>{if(settled)return;settled=true;error?reject(error):resolve();};
        const onAudioState=()=>{if(context.state!=='running')finish(new Error('Audio was interrupted. Keep the tab active and try exporting again.'));};
        const onData=event=>{if(event.data?.size)chunks.push(event.data);};
        const onError=()=>finish(new Error('The browser could not encode this video. Your editable scene is safe.'));
        const onStop=()=>finishing?finish():finish(new Error('Video recording stopped before the scene finished.'));
        context?.addEventListener('statechange',onAudioState);
        recorder.addEventListener('dataavailable',onData);recorder.addEventListener('error',onError);recorder.addEventListener('stop',onStop);
        removeListeners=()=>{context?.removeEventListener('statechange',onAudioState);recorder.removeEventListener('dataavailable',onData);recorder.removeEventListener('error',onError);recorder.removeEventListener('stop',onStop);};
        try {
          recorder.start(1000);
          const start=now(),audioStart=context?context.currentTime+0.06:0;
          for(const {source,time} of prepared)source.start(audioStart+time/1000);
          const tick=()=>{
            if(settled)return;
            try {
              const elapsed=Math.min(compiled.duration,Math.max(0,context?(context.currentTime-audioStart)*1000:now()-start));
              renderer.draw(compiled,elapsed);onProgress(elapsed/compiled.duration);
              if(elapsed>=compiled.duration){finishing=true;timer=later(()=>{try{recorder.stop();}catch(error){finish(error);}},50);}
              else frame=raf(tick);
            }catch(error){finish(error);}
          };
          tick();
        }catch(error){finish(error);}
      }));
      const mimeType=recorder.mimeType || chunks[0]?.type || format.mimeType;
      if (!/^video\/(?:mp4|webm)(?:;|$)/i.test(mimeType)) throw new Error('The browser returned an unsupported recording format.');
      const blob=new Blob(chunks,{type:mimeType});
      if(!blob.size)throw new Error('The browser returned an empty video. Please try again.');
      return {blob,mimeType,extension:mimeType.includes('mp4')?'mp4':'webm',duration:compiled.duration};
    } finally {
      signal?.removeEventListener('abort',onAbort);doc?.removeEventListener('visibilitychange',onHidden);
      removeListeners();if(frame!==undefined)cancelFrame(frame);if(timer!==undefined)clearLater(timer);
      if(recorder?.state==='recording'||recorder?.state==='paused')try{recorder.stop();}catch{/* Already stopped. */}
      for(const source of sources){try{source.stop();}catch{/* Not started or ended. */}try{source.disconnect();}catch{/* Already disconnected. */}}
      for(const track of capture?.getTracks?.() || [])try{track.stop();}catch{/* Best effort on partial startup. */}
      for(const track of destination?.stream?.getTracks?.() || [])try{track.stop();}catch{/* Best effort. */}
      try{destination?.disconnect();}catch{/* Already disconnected. */}
      if(context)try{await context.close();}catch{/* Closed by the browser. */}
      if(ownedRenderer)try{renderer?.destroy();}catch{/* Preserve the recording result during cleanup. */}
    }
  };
}

export const exportSceneVideo = (...args) => createVideoExporter()(...args);
