import test from 'node:test';
import assert from 'node:assert/strict';
import {createLanguage,validateLanguage} from '../src/engine.js';
import {parseDictionaryCSV,languageReferenceHTML} from '../src/language-tools.js';
import {createSceneProject,validateSceneProject} from '../src/scene-project.js';

test('language and CSV imports enforce the UTF-8 byte limit before normalization',()=>{
 const language=createLanguage();language.padding='界'.repeat(340000);
 const raw=JSON.stringify(language);
 assert.ok(raw.length<1000000);
 assert.throws(()=>validateLanguage(raw),/large|size/i);
 assert.throws(()=>validateLanguage(language),/large|size/i);
 const csv='english,word,notes\nkite,na,'+'界'.repeat(340000);
 assert.match(parseDictionaryCSV(csv,createLanguage()).errors[0].message,/1 MB/);
});
test('nested unsafe keys and deep trees are rejected without changing the original language',()=>{
 const original=createLanguage(),snapshot=JSON.stringify(original);
 for(const key of ['__proto__','constructor','prototype']){
  const candidate=JSON.parse(snapshot);candidate.words[0].extra=JSON.parse(`{"${key}":{"polluted":true}}`);
  assert.throws(()=>validateLanguage(candidate),/unsafe/i);
  const scene=createSceneProject(original);scene.extra=JSON.parse(`{"${key}":{}}`);
  assert.throws(()=>validateSceneProject(scene),/unsafe/i);
 }
 const deep={};let at=deep;for(let i=0;i<30;i++)at=at.child={};
 assert.throws(()=>validateLanguage({...original,extra:deep}),/nesting/i);
 assert.equal(JSON.stringify(original),snapshot);assert.equal({}.polluted,undefined);
});
test('markup remains text in portable documents and printable references',()=>{
 const original=createLanguage();original.name='<img src=x onerror=alert(1)>';
 original.words[0].notes='</td><script>alert(1)</script>';
 const parsed=validateLanguage(JSON.stringify(original));
 assert.equal(parsed.name,original.name);
 const html=languageReferenceHTML(parsed);
 assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));
 const scene=createSceneProject(parsed);scene.beats=[{id:'hostile-text',speaker:0,mode:'literal',text:'<svg onload=alert(1)>',english:'<b>words</b>',action:'none',cue:'start',wordIndex:0,pauseMs:400}];
 assert.equal(validateSceneProject(JSON.stringify(scene)).beats[0].text,scene.beats[0].text);
});
