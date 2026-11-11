import {readFile} from 'node:fs/promises';
import {parseHeadersFile} from './security-policy.mjs';

const target=new URL(process.argv[2] || 'https://oddtongue.com/');
if(target.protocol!=='https:' && !(target.protocol==='http:' && ['localhost','127.0.0.1'].includes(target.hostname)))throw new Error('Use HTTPS or a loopback preview URL.');
const expected=parseHeadersFile(await readFile(new URL('./dist/_headers',import.meta.url),'utf8'));
if(target.protocol==='http:')delete expected['Strict-Transport-Security'];
let failures=0;
for(const path of ['','privacy/','terms/','app.js']){
 const url=new URL(path,target);
 const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(15000)});
 await response.body?.cancel();
 if(response.status!==200){console.error(`${url.pathname}: HTTP ${response.status}`);failures++;continue;}
 for(const [name,value] of Object.entries(expected)){
  if(response.headers.get(name)!==value){console.error(`${url.pathname}: missing or different ${name}`);failures++;}
 }
}
if(failures) {console.error(`${failures} header checks failed. Configure the host before treating this release as protected.`);process.exitCode=1;}
else console.log('Security headers match the built policy on the app, legal pages and script.');
