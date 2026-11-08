import { mkdir, cp, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';
import { build } from 'esbuild';
import { validateCloudConfig } from './src/cloud-service.js';
try { loadEnvFile(fileURLToPath(new URL('./.env.local', import.meta.url))); }
catch(error) { if(error.code!=='ENOENT')throw error; }
const cloudConfig=validateCloudConfig({url:process.env.SUPABASE_URL??'',publishableKey:process.env.SUPABASE_PUBLISHABLE_KEY??'',googleEnabled:process.env.SUPABASE_GOOGLE_ENABLED==='true'});
await access(new URL('./src/index.html', import.meta.url));
await mkdir(new URL('./dist/', import.meta.url), {recursive:true});
await cp(new URL('./src/', import.meta.url), new URL('./dist/', import.meta.url), {recursive:true});
await build({entryPoints:[fileURLToPath(new URL('./src/app.js',import.meta.url))],outdir:fileURLToPath(new URL('./dist/',import.meta.url)),entryNames:'app',chunkNames:'chunks/[name]-[hash]',splitting:true,bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,legalComments:'eof',define:{__CLOUD_CONFIG__:JSON.stringify(cloudConfig)}});
console.log('Built Oddtongue in dist/');
console.log(cloudConfig.url?'Cloud configuration included (public key only).':'Guest mode: cloud configuration is not set.');
