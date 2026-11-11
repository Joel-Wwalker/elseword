import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import { parseHeadersFile } from './security-policy.mjs';
const root=resolve(fileURLToPath(new URL('./dist/',import.meta.url)));
const headers=parseHeadersFile(await readFile(resolve(root,'_headers'),'utf8'));
// HSTS belongs on HTTPS responses, not this loopback HTTP preview.
delete headers['Strict-Transport-Security'];
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.ttf':'font/ttf','.json':'application/json','.txt':'text/plain'};
const server=createServer(async(req,res)=>{
  for(const [name,value] of Object.entries(headers))res.setHeader(name,value);
  try {const raw=decodeURIComponent(new URL(req.url,'http://localhost').pathname);let target=resolve(root,'.'+raw);if(target!==root&&!target.startsWith(root+sep)){res.writeHead(403).end();return;}if((await stat(target)).isDirectory())target=resolve(target,'index.html');const data=await readFile(target);res.writeHead(200,{'Content-Type':mime[extname(target)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(data);}
  catch {res.writeHead(404,{'Content-Type':'text/plain'}).end('Not found');}
});
const port=Number(process.env.PORT || 58110);
server.listen(port,'127.0.0.1',()=>console.log(`Oddtongue: http://localhost:${server.address().port}/`));
