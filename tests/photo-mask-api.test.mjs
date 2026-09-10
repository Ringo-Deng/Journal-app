import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import sharp from 'sharp';
import {defaultBook} from '../lib/journal.ts';
import {appliedPhotoMask} from '../lib/photo-mask-state.ts';

test('real API: validation, cancellation, apply/save/restart, recycling and existing native cutout',async t=>{
 const data=await mkdtemp(join(tmpdir(),'photo-mask-api-'));t.after(()=>rm(data,{recursive:true,force:true}));await mkdir(join(data,'uploads'));
 const src='/uploads/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png';
 const image=await sharp(Buffer.from('<svg width="300" height="300"><rect width="300" height="300" fill="white"/><circle cx="150" cy="90" r="45" fill="#e3a273"/><rect x="105" y="130" width="90" height="130" rx="20" fill="#2b668b"/></svg>')).png().toBuffer();await writeFile(join(data,src.slice(1)),image);
 const b=defaultBook();b.id='b';const s=b.spreads[0];s.id='s';const p={id:'p',kind:'photo',src,photoOriginal:src,x:10,y:15,w:32,h:35,rotation:12,locked:false};s.elements=[p];
 await writeFile(join(data,'journal.json'),JSON.stringify({revision:1,books:[b]}));
 const listener=createServer();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
 let child;
 async function start(){child=spawn(process.execPath,['local/server-bootstrap.mjs'],{env:{...process.env,JOURNAL_DATA_DIR:data,JOURNAL_CONFIG_DIR:join(data,'config'),JOURNAL_PORT:String(port),JOURNAL_WEB_PORT:String(port)},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{child.stdout.on('data',d=>{if(d.toString().includes(String(port)))resolve();});child.once('error',reject);child.once('exit',c=>reject(Error(`server exited ${c}`)));});}
 async function stop(){if(!child||child.exitCode!==null)return;const exited=new Promise(resolve=>child.once('exit',resolve));child.kill();await exited;}
 t.after(stop);await start();
 const call=async(path,method='GET',body)=>{const r=await fetch(`http://127.0.0.1:${port}/api${path}`,{method,...(body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};};
 const input={src,shape:'heart',crop:20,cropY:65,cropZoom:1.2,photoRotation:25,flipX:true,flipY:false,width:400,height:300,bookId:'b',spreadId:'s',pieceId:'p',revision:1};
 assert.equal((await call('/photo-mask','POST',{...input,src:'/uploads/../journal.json'})).status,400);
 const result=await call('/photo-mask','POST',input);assert.equal(result.status,200);assert.equal((await call('/state')).body.books[0].spreads[0].elements[0].src,src);assert.equal((await call('/photo-trash')).body.entries.length,0);
 s.elements=[appliedPhotoMask(p,result.body.src)];assert.equal((await call('/state','PUT',{revision:1,books:[b]})).status,200);
 const entry=(await call('/photo-trash')).body.entries[0];assert.equal(entry.original.src,src);assert.equal((await call('/photo-trash/'+entry.id+'/restore','POST')).body.src,src);assert.equal((await call('/photo-trash/'+entry.id,'DELETE')).status,409);
 assert.equal((await call('/photo-mask','POST',input)).status,409);assert.equal((await readdir(join(data,'uploads'))).length,2);assert.deepEqual(await readFile(join(data,src.slice(1))),image);
 await stop();await start();assert.equal((await call('/state')).body.books[0].spreads[0].elements[0].src,result.body.src);assert.equal((await call('/photo-trash')).body.entries.length,1);
 const response=await fetch(`http://127.0.0.1:${port}${result.body.src}`);assert.equal(response.status,200);assert.ok((await sharp(Buffer.from(await response.arrayBuffer())).metadata()).hasAlpha);
 // Vision remains a separate native operation and never mutates journal state.
 const before=(await call('/state')).body,cutout=await call('/cutout','POST',{src});assert.ok([200,422,501].includes(cutout.status));t.diagnostic(`Existing local cutout HTTP ${cutout.status}`);
 if(cutout.status===200){const png=await fetch(`http://127.0.0.1:${port}${cutout.body.src}`);assert.ok((await sharp(Buffer.from(await png.arrayBuffer())).metadata()).hasAlpha);}
 else assert.match(cutout.body.error,/主体|原图|系统/);
 assert.deepEqual((await call('/state')).body,before);assert.deepEqual(await readFile(join(data,src.slice(1))),image);
});
