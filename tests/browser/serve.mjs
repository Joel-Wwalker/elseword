import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve,sep,extname } from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url));
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.ttf':'font/ttf'};
createServer(async(req,res)=>{try{const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(!path.startsWith('/src/')&&!path.startsWith('/tests/browser/'))throw new Error();const target=resolve(root,'.'+path);if(!target.startsWith(resolve(root)+sep)||!types[extname(target)])throw new Error();res.writeHead(200,{'Content-Type':types[extname(target)],'Cache-Control':'no-store'});res.end(await readFile(target));}catch{res.writeHead(404).end();}}).listen(58111,'127.0.0.1',()=>console.log('UI fixture only: http://localhost:58111/tests/browser/cloud.html'));
