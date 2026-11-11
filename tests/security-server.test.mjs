import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
const exec=promisify(execFile),cwd=fileURLToPath(new URL('../',import.meta.url));

test('built pages and HTTP responses enforce the same policy, including error responses',async()=>{
 await exec(process.execPath,['build.mjs'],{cwd,env:{...process.env,SUPABASE_URL:'',SUPABASE_PUBLISHABLE_KEY:'',SUPABASE_GOOGLE_ENABLED:'false'}});
 const child=spawn(process.execPath,['serve.mjs'],{cwd,env:{...process.env,PORT:'0'},stdio:['ignore','pipe','pipe']});
 try{
  const url=await new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(new Error('Preview did not start')),10000);
   child.once('error',error=>{clearTimeout(timeout);reject(error);});
   child.once('exit',code=>{clearTimeout(timeout);reject(new Error(`Preview exited ${code}`));});
   child.stdout.on('data',chunk=>{const match=String(chunk).match(/http:\/\/localhost:\d+\//);if(match){clearTimeout(timeout);resolve(match[0]);}});
  });
  for(const path of ['','privacy/','terms/','app.js','missing-page']){
   const r=await fetch(url+path),body=await r.text();
   assert.equal(r.status,path==='missing-page'?404:200);
   assert.equal(r.headers.get('x-frame-options'),'DENY');
   assert.equal(r.headers.get('x-content-type-options'),'nosniff');
   assert.match(r.headers.get('content-security-policy'),/script-src 'self'/);
   if(['','privacy/','terms/'].includes(path))assert.ok(body.includes('http-equiv="Content-Security-Policy"'));
  }
  await exec(process.execPath,['check-security-headers.mjs',url],{cwd});
 }finally{child.kill();}
});
