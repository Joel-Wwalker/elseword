import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, composeSentence } from '../src/engine.js';
import { languageFromBlueprint, createLanguageGenerator } from '../src/language-generator.js';

const blueprint = () => ({version:1,name:'Testari',seed:'catalog-v1-7',preset:'soft',sounds:structuredClone(PRESETS[1].sounds),grammar:{order:'SOV',adjective:'after',plural:'ik',past:'pa',future:'fu',negative:'ne',question:'ki'}});
const config = {url:'https://example.supabase.co',publishableKey:'sb_publishable_testkey12345'};

test('a fixed blueprint yields repeatable vocabulary with its own sounds and grammar', () => {
  const recipe=blueprint(), before=structuredClone(recipe);
  const first=languageFromBlueprint(recipe), second=languageFromBlueprint(recipe);
  assert.deepEqual(first,second);
  assert.deepEqual(recipe,before);
  assert.deepEqual(first.sounds,recipe.sounds);
  assert.equal(first.grammar.order,'SOV');
  assert.notEqual(first.words.find(w=>w.english==='bread').word,'poma');
  assert.ok(first.words.length>=200);
  assert.ok(composeSentence(first,{subject:'I',verb:'want',object:'bread'}));
});
test('invalid or unsupported server responses cannot become languages', () => {
  for(const value of [null,{}, {...blueprint(),version:2}, {...blueprint(),name:42}, {...blueprint(),sounds:{vowels:[]}}, {...blueprint(),grammar:{order:'INVALID'}}]) {
    assert.throws(()=>languageFromBlueprint(value));
  }
});
test('anonymous request sends bounded recent exclusions and only the public key', async () => {
  let request;
  const generator=createLanguageGenerator(config,{fetch:async(url,options)=>{request={url,options};return {ok:true,json:async()=>blueprint()};}});
  const seeds=Array.from({length:30},(_,i)=>`oddtongue-catalog-v1-${String(i+1).padStart(4,'0')}`);
  const lang=await generator(['private user seed',...seeds]);
  assert.equal(lang.name,'Testari');
  assert.equal(request.url,`${config.url}/rest/v1/rpc/pick_language_blueprint`);
  assert.deepEqual(JSON.parse(request.options.body).excluded_seeds,seeds.slice(-25));
  assert.equal(request.options.headers.apikey,config.publishableKey);
  assert.equal(request.options.credentials,'omit');
});
test('offline and unconfigured generators fail without falling back to a fake result', async () => {
  await assert.rejects(createLanguageGenerator({})(),/online|available/i);
  await assert.rejects(createLanguageGenerator(config,{fetch:async()=>{throw new TypeError('Network');}})(),/connect|online|reach/i);
  await assert.rejects(createLanguageGenerator(config,{fetch:async()=>({ok:false,status:500})})(),/try again/i);
});
