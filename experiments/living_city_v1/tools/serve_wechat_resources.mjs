import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=path.join(project,'build','wechatgame','remote');
const config=JSON.parse(fs.readFileSync(path.join(project,'tools/wechat-preview.build.json')));
const address=new URL(config.server);
if(address.hostname!=='127.0.0.1'||address.protocol!=='http:')throw new Error('This helper only serves local preview resources.');
const mime={'.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.bin':'application/octet-stream'};
const server=http.createServer((request,response)=>{
 let pathname;try{pathname=decodeURIComponent(new URL(request.url,address).pathname);}catch{response.writeHead(400).end();return;}
 if(!pathname.startsWith('/remote/')){response.writeHead(404).end();return;}
 const file=path.resolve(root,`.${pathname.slice('/remote'.length)}`);
 if(!file.startsWith(root+path.sep)){response.writeHead(403).end();return;}
 fs.stat(file,(error,stat)=>{
  if(error||!stat.isFile()){response.writeHead(404).end();return;}
  response.writeHead(200,{'Content-Type':mime[path.extname(file)]??'application/octet-stream',
   'Content-Length':stat.size,'Cache-Control':'no-store','Access-Control-Allow-Origin':'*'});
  if(request.method==='HEAD'){response.end();return;}
  fs.createReadStream(file).on('error',()=>response.destroy()).pipe(response);
 });
});
server.listen(Number(address.port),address.hostname,()=>console.log(`WeChat preview resources: ${address.href}remote/\nRoot: ${root}`));
