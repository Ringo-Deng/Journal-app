import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import sharp from 'sharp';
import {defaultBook} from '../lib/journal.ts';
import {applyMaskToBooks} from '../lib/photo-mask-state.ts';
import {createPhotoLibrary} from '../local/photo-library.mjs';

for(const libraryPhoto of [false,true])test(`real API (${libraryPhoto?'photo library':'legacy upload'}): validation, cancellation, apply/save/restart, recycling and existing native cutout`,async t=>{
 const data=await mkdtemp(join(tmpdir(),'photo-mask-api-'));t.after(()=>rm(data,{recursive:true,force:true}));await mkdir(join(data,'uploads'));
 let src='/uploads/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png';
 const image=await sharp(Buffer.from('<svg width="300" height="300"><rect width="300" height="300" fill="white"/><circle cx="150" cy="90" r="45" fill="#e3a273"/><rect x="105" y="130" width="90" height="130" rx="20" fill="#2b668b"/></svg>')).png().toBuffer();await writeFile(join(data,src.slice(1)),image);
 const b=defaultBook();b.id='b';const s=b.spreads[0];s.id='s';const p={id:'p',kind:'photo',dayId:'day',src,photoOriginal:src,x:10,y:15,w:32,h:35,rotation:12,locked:false};s.elements=[p];s.days=[{id:'day',date:b.month+'-01',raw:'',title:'',text:'',photos:[src]}];
 await writeFile(join(data,'journal.json'),JSON.stringify({revision:1,books:[b]}));
 const listener=createServer();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
 let child;
 async function start(){child=spawn(process.execPath,['local/server-bootstrap.mjs'],{env:{...process.env,JOURNAL_DATA_DIR:data,JOURNAL_CONFIG_DIR:join(data,'config'),JOURNAL_PORT:String(port),JOURNAL_WEB_PORT:String(port)},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{child.stdout.on('data',d=>{if(d.toString().includes(String(port)))resolve();});child.once('error',reject);child.once('exit',c=>reject(Error(`server exited ${c}`)));});}
 async function stop(){if(!child||child.exitCode!==null)return;const exited=new Promise(resolve=>child.once('exit',resolve));child.kill();await exited;}
 t.after(stop);await start();
 const call=async(path,method='GET',body)=>{const r=await fetch(`http://127.0.0.1:${port}/api${path}`,{method,...(body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};};
 let revision=1;
 if(libraryPhoto){
  const response=await fetch(`http://127.0.0.1:${port}/api/photos/import?filename=mask-test.png&lastModified=${Date.parse('2024-02-03T04:05:06Z')}`,{method:'POST',body:image});
  assert.equal(response.status,200);const imported=await response.json();src=imported.item.src;
  assert.match(src,/^\/uploads\/photo-[a-f0-9]{32}\.webp$/);
  p.src=src;p.photoOriginal=src;s.days[0].photos=[src];
  assert.equal((await call('/state','PUT',{revision,books:[b]})).status,200);revision++;
 }
 const sourceBytes=await readFile(join(data,src.slice(1)));
 let originalItem,originalThumbnail;
 async function assertOriginalLibrary(){
  const response=await call('/photos');assert.equal(response.status,200);assert.equal(response.body.warning,undefined);assert.equal(response.body.total,1);assert.equal(response.body.items.length,1);assert.equal(response.body.nextOffset,null);
  const item=response.body.items[0];assert.equal(item.src,src);
  const thumbnail=await fetch(`http://127.0.0.1:${port}${item.thumbnailSrc}`);assert.equal(thumbnail.status,200);const bytes=Buffer.from(await thumbnail.arrayBuffer());
  if(originalItem){assert.deepEqual(item,originalItem);assert.deepEqual(bytes,originalThumbnail);}
  else{originalItem=structuredClone(item);originalThumbnail=bytes;}
  assert.deepEqual(await readFile(join(data,item.originalFile)),image);assert.deepEqual(await readFile(join(data,src.slice(1))),sourceBytes);
 }
 if(libraryPhoto){await assertOriginalLibrary();assert.equal(originalItem.capturedAt,'2024-02-03T04:05:06.000Z');}
 const input={src,shape:'heart',crop:20,cropY:65,cropZoom:1.2,photoRotation:25,flipX:true,flipY:false,width:400,height:300,bookId:'b',spreadId:'s',pieceId:'p',revision};
 assert.equal((await call('/photo-mask','POST',{...input,src:'/uploads/../journal.json'})).status,400);
 const result=await call('/photo-mask','POST',input);assert.equal(result.status,200);assert.equal((await call('/state')).body.books[0].spreads[0].elements[0].src,src);assert.equal((await call('/photo-trash')).body.entries.length,0);
 if(libraryPhoto)await assertOriginalLibrary();
 const draft={pieceId:p.id,bookId:b.id,spreadId:s.id,before:structuredClone(p),piece:{...p,crop:input.crop,cropY:input.cropY,cropZoom:input.cropZoom,flipX:input.flipX,flipY:input.flipY},shape:input.shape,photoRotation:input.photoRotation,token:'api-test',generating:false,imageWidth:300,imageHeight:300};
 const maskedBooks=applyMaskToBooks([b],draft,result.body.src);assert.deepEqual(maskedBooks[0].spreads[0].days[0].photos,[result.body.src]);
 assert.equal((await call('/state','PUT',{revision,books:maskedBooks})).status,200);
 // Legacy uploads first enter the library after masking; their original is recovered from the mask record.
 await assertOriginalLibrary();
 const entry=(await call('/photo-trash')).body.entries[0];assert.equal(entry.original.src,src);assert.equal((await call('/photo-trash/'+entry.id+'/restore','POST')).body.src,src);assert.equal((await call('/photo-trash/'+entry.id,'DELETE')).status,409);
 assert.equal((await call('/photo-mask','POST',input)).status,409);assert.equal((await readdir(join(data,'uploads'))).length,libraryPhoto?3:2);assert.deepEqual(await readFile(join(data,src.slice(1))),sourceBytes);
 await stop();await start();assert.equal((await call('/state')).body.books[0].spreads[0].elements[0].src,result.body.src);assert.equal((await call('/photo-trash')).body.entries.length,1);
 await assertOriginalLibrary();
 assert.equal((await call('/photo-trash/'+entry.id+'/restore','POST')).body.src,src);
 // Simulate a pre-fix library that already indexed the generated result as an old upload.
 await stop();
 const oldLibrary=createPhotoLibrary({data,atomic:async(file,value)=>writeFile(join(data,file),JSON.stringify(value),{mode:0o600})});
 assert.equal((await oldLibrary.reconcile([result.body.src])).added,1);
 const oldEntries=JSON.parse(await readFile(join(data,'photo-library.json'),'utf8'));assert.equal(oldEntries.length,2);assert.ok(oldEntries.some(item=>item.src===result.body.src));
 const resultBytes=await readFile(join(data,result.body.src.slice(1)));
 await start();await assertOriginalLibrary();assert.deepEqual(await readFile(join(data,result.body.src.slice(1))),resultBytes);
 const saved=(await call('/state')).body;assert.equal(saved.books[0].spreads[0].elements[0].src,result.body.src);assert.deepEqual(saved.books[0].spreads[0].days[0].photos,[result.body.src]);
 assert.equal((await call('/photo-trash/'+entry.id+'/restore','POST')).body.src,src);
 const backup=await fetch(`http://127.0.0.1:${port}/api/photos/backup`);assert.equal(backup.status,200);
 const records=(await backup.text()).trim().split('\n').map(line=>JSON.parse(line));assert.equal(records[0].format,'shiguang-photo-library-v1');
 const photos=records.filter(record=>record.type==='photo');assert.equal(photos.length,1);assert.equal(photos[0].name,originalItem.originalName);assert.equal(photos[0].capturedAt,originalItem.capturedAt);assert.deepEqual(Buffer.from(photos[0].data,'base64'),image);assert.deepEqual(records.at(-1),{type:'complete',count:1});
 if(libraryPhoto){
  // Even without journal/history references, a library photo cannot be removed by the trash.
  const current=(await call('/state')).body;
  assert.equal((await call('/state','PUT',{revision:current.revision,books:[]})).status,200);
  const {unlink}=await import('node:fs/promises');
  await unlink(join(data,'journal.previous.json'));await rm(join(data,'journal-history'),{recursive:true,force:true});
  assert.equal((await call('/photo-trash/'+entry.id,'DELETE')).status,409);
  const library=(await call('/photos')).body;assert.equal(library.items[0].src,src);
  assert.deepEqual(await readFile(join(data,library.items[0].originalFile)),image);
 }
 const response=await fetch(`http://127.0.0.1:${port}${result.body.src}`);assert.equal(response.status,200);assert.ok((await sharp(Buffer.from(await response.arrayBuffer())).metadata()).hasAlpha);
 // Vision remains a separate native operation and never mutates journal state.
 const before=(await call('/state')).body,cutout=await call('/cutout','POST',{src});assert.ok([200,422,501].includes(cutout.status));t.diagnostic(`Existing local cutout HTTP ${cutout.status}`);
 if(cutout.status===200){const png=await fetch(`http://127.0.0.1:${port}${cutout.body.src}`);assert.ok((await sharp(Buffer.from(await png.arrayBuffer())).metadata()).hasAlpha);}
 else assert.match(cutout.body.error,/主体|原图|系统/);
 assert.deepEqual((await call('/state')).body,before);assert.deepEqual(await readFile(join(data,src.slice(1))),sourceBytes);
});
