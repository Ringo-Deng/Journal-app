import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import sharp from 'sharp';

test('whole-image import preserves pixels, transparency, orientation and existing data across restart', {timeout:30000}, async()=>{
 const dir=await mkdtemp(join(tmpdir(),'journal-whole-image-'));let child,base;
 let start;
 const call=async(path,data)=>{const r=await fetch(base+path,{method:data?'POST':'GET',headers:{'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});return{status:r.status,data:await r.json()}};
 async function stop(){if(child&&child.exitCode===null){const exit=once(child,'exit');child.kill();await exit}}
 try{
  // Use the same isolated HTTP fixture convention as the material storage regression.
  const {createServer}=await import('node:net');const socket=createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');const port=socket.address().port;await new Promise(r=>socket.close(r));
  start=async()=>{
   child=spawn(process.execPath,['local/server.mjs'],{cwd:resolve('.'),env:{...process.env,JOURNAL_DATA_DIR:dir,JOURNAL_CONFIG_DIR:dir,JOURNAL_PORT:String(port)},stdio:['ignore','pipe','pipe']});
   let diagnostics='';child.stderr.on('data',c=>diagnostics+=c);
   await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error(diagnostics)})]);base='http://127.0.0.1:'+port;
  };
  await start();
  const bytes=await sharp({create:{width:48,height:32,channels:4,background:{r:100,g:150,b:50,alpha:.35}}}).png().toBuffer();
  const upload=await call('/api/upload',{data:'data:image/png;base64,'+bytes.toString('base64')});assert.equal(upload.status,200);
  const src=upload.data.src;
  const results=await Promise.all([call('/api/materials/import-image',{src,name:'透明贴纸'}),call('/api/materials/import-image',{src,name:'重复请求'})]);
  assert.deepEqual(results.map(r=>r.data.added).sort(),[0,1]);
  let assets=(await call('/api/materials')).data;const asset=assets.find(a=>a.src===src);
  assert.ok(['透明贴纸','重复请求'].includes(asset.name));assert.equal(asset.width,48);assert.equal(asset.height,32);
  assert.deepEqual(await readFile(join(dir,src.slice(1))),bytes);
  assert.deepEqual((await call('/api/materials/jobs')).data,[]);
  const before=await readFile(join(dir,'materials.json'),'utf8');
  assert.equal((await call('/api/materials/import-image',{src:'/uploads/../../private.png'})).status,400);
  assert.equal((await call('/api/materials/import-image',{src:'/uploads/00000000-0000-4000-8000-000000000000.png'})).status,404);
  const broken='/uploads/00000000-0000-4000-8000-000000000001.png';await writeFile(join(dir,broken.slice(1)),'invalid image');
  assert.equal((await call('/api/materials/import-image',{src:broken})).status,400);
  assert.equal(await readFile(join(dir,'materials.json'),'utf8'),before);
  const rotated=await sharp({create:{width:24,height:40,channels:3,background:'red'}}).jpeg().withMetadata({orientation:6}).toBuffer();
  const jpeg=await call('/api/upload',{data:'data:image/jpeg;base64,'+rotated.toString('base64')});
  const imported=await call('/api/materials/import-image',{src:jpeg.data.src,name:'方向'});assert.equal(imported.status,200);
  const oriented=imported.data.assets.find(a=>a.src===jpeg.data.src);assert.equal(oriented.width,40);assert.equal(oriented.height,24);
  await stop();await start();
  assets=(await call('/api/materials')).data;assert.ok(assets.some(a=>a.id===asset.id&&a.src===src));
  assert.deepEqual(await readFile(join(dir,src.slice(1))),bytes);
  const source=await call('/api/materials/source',{src,name:asset.name,replaceAssetId:asset.id});assert.equal(source.status,200);assert.equal(source.data.replaceAssetId,asset.id);
 }finally{await stop();await rm(dir,{recursive:true,force:true})}
});
