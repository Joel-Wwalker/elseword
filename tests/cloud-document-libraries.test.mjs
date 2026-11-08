import test from 'node:test';
import assert from 'node:assert/strict';
import { CloudLibrary } from '../src/cloud-library.js';
import { createCloudService } from '../src/cloud-service.js';

const owner = { id:'11111111-1111-4111-8111-111111111111',email:'test@example.test' };
const id='22222222-2222-4222-8222-222222222222';
const mutation='33333333-3333-4333-8333-333333333333';
const scene={id:'scene-one',format:'scene-test',name:'A quiet exchange',beats:['hello']};
const validate=value=>{if(value?.format!=='scene-test'||!Array.isArray(value.beats))throw new Error('Invalid scene');return structuredClone(value);};
const record=(document,version=1)=>({id,document:structuredClone(document),version,updated_at:'2026-11-08T12:00:00Z',deleted_at:null});

test('scene libraries preserve their own documents and account links without touching language caches', async()=>{
  const memory=new Map([['little-languages-cloud-links-v1:'+owner.id,'language cache untouched']]);
  const storage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value)};
  const service={configured:true,getSession:async()=>owner,subscribe:()=>()=>{},list:async()=>[],save:async request=>record(request.document,(request.expectedVersion??0)+1)};
  const library=new CloudLibrary({service,storage,uuid:()=>id,validateDocument:validate,cachePrefix:'little-languages-scene-links-v1:'});
  await library.start();
  await library.save(scene);
  assert.equal(library.savedState(scene),'saved');
  assert.deepEqual(library.state.items[0].document,scene);
  assert.equal(memory.get('little-languages-cloud-links-v1:'+owner.id),'language cache untouched');
  assert.ok(memory.has('little-languages-scene-links-v1:'+owner.id));
  assert.equal(library.savedState({...scene,name:'Changed'}),'changed');
  await assert.rejects(library.save({...scene,format:'bad'}),/invalid|check|saved/i);
  library.destroy();
});

test('scene transport uses the shared authenticated session and dedicated scene endpoints',async()=>{
  let session={user:owner,access_token:'test-owner-token'};
  const calls=[];
  const response=data=>({setHeader(name,value){calls.push(['header',name,value]);return this;},then(resolve,reject){return Promise.resolve({data,error:null}).then(resolve,reject);}});
  const client={auth:{getSession:async()=>({data:{session}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
    from(table){calls.push(['table',table]);const query={select(){return query;},is(){return query;},order(){return query;},limit(){return response([record(scene)]);}};return query;},
    rpc(name,args){calls.push(['rpc',name,args]);return response(name==='delete_scene'?{...record(null,2),deleted_at:'2026-11-08T12:01:00Z'}:record(args.p_document));}};
  const service=createCloudService({url:'https://language-test.supabase.co',publishableKey:'sb_publishable_test_public_key'}, {createClient:()=>client});
  assert.equal(typeof service.forScenes,'function');
  const scenes=service.forScenes(validate);
  assert.deepEqual(await scenes.getSession(),owner);
  assert.deepEqual((await scenes.list({expectedUserId:owner.id}))[0].document,scene);
  await scenes.save({id,document:scene,expectedVersion:null,mutationId:mutation,expectedUserId:owner.id});
  await scenes.remove({id,expectedVersion:1,mutationId:mutation,expectedUserId:owner.id});
  assert.ok(calls.some(c=>c[0]==='table'&&c[1]==='cloud_scenes'));
  assert.deepEqual(calls.filter(c=>c[0]==='rpc').map(c=>c[1]),['save_scene','delete_scene']);
  assert.ok(calls.filter(c=>c[0]==='header').every(c=>c[2]==='Bearer test-owner-token'));
  session={user:{...owner,id:'44444444-4444-4444-8444-444444444444'},access_token:'other-token'};
  await assert.rejects(scenes.save({id,document:scene,expectedVersion:1,mutationId:mutation,expectedUserId:owner.id}),e=>e.code==='AUTH_REQUIRED');
});
