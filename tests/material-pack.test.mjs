import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { exportMaterialPack, readMaterialPack, importMaterialPack, materialPackMetadata } from '../local/material-pack.mjs';
import { digest, writeArchive } from '../local/backup-archive.mjs';

async function fixture(t) {
  const root=await mkdtemp(join(tmpdir(),'material-pack-test-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const data=join(root,'source'), dest=join(root,'destination'), publicDir=join(root,'public');
  await mkdir(join(data,'uploads'),{recursive:true});await mkdir(dest);await mkdir(publicDir);
  const bytes=await sharp({create:{width:12,height:12,channels:4,background:{r:80,g:140,b:60,alpha:0.5}}}).png().toBuffer();
  await writeFile(join(data,'uploads','finished.png'),bytes);
  await writeFile(join(data,'uploads','private-original.png'),bytes);
  const asset={id:'original-id',src:'/uploads/finished.png',name:'绿叶',category:'我的素材',group:'植物',
    tags:['叶子'],labels:{content:['植物'],style:['水彩'],color:['绿']},author:'示例作者',license:'示例许可',
    sourceImage:'/uploads/private-original.png',sourceUrl:'/Users/private/photo',source:{secret:'no'},apiKey:'no'};
  const packed=await exportMaterialPack({ids:[asset.id],assets:[asset],data,publicDir,directory:join(root,'export'),appVersion:'test'});
  return {root,data,dest,publicDir,bytes,asset,packed};
}

test('selected pack round trips finished image, metadata and alpha without original/private fields',async t=>{
 const f=await fixture(t);
 assert.equal(f.packed.manifest.files.length,1);
 const a=f.packed.manifest.snapshot.assets[0];
 assert.equal(a.name,'绿叶');assert.equal(a.sourceImage,undefined);assert.equal(a.apiKey,undefined);
 assert.equal(JSON.stringify(f.packed.manifest).includes('private-original'),false);
 const staged=await readMaterialPack(createReadStream(f.packed.archive),join(f.root,'read'));
 let saved=[],registered=[];
 const result=await importMaterialPack({staged,existing:[],allAssets:[],data:f.dest,publicDir:f.publicDir,
   writeAssets:async assets=>{saved=assets},registerTaxonomy:async assets=>{registered=assets}});
 assert.deepEqual(result,{added:1,skipped:0});assert.equal(saved[0].id===f.asset.id,false);
 assert.deepEqual(saved[0].labels,f.asset.labels);assert.equal(registered[0].group,'植物');
 const image=await readFile(join(f.dest,saved[0].src.slice(1)));
 assert.deepEqual(image,f.bytes);assert.equal((await sharp(image).metadata()).hasAlpha,true);
 assert.equal(saved[0].sourceImage,saved[0].src);
 const repeated=await importMaterialPack({staged,existing:saved,allAssets:saved,data:f.dest,publicDir:f.publicDir,
   writeAssets:async()=>assert.fail('repeat must not write'),registerTaxonomy:async()=>assert.fail('repeat must not mutate taxonomy')});
 assert.deepEqual(repeated,{added:0,skipped:1});
});

test('import into source library skips identical existing image and preserves manual metadata',async t=>{
 const f=await fixture(t);const staged=await readMaterialPack(createReadStream(f.packed.archive),join(f.root,'read'));
 const r=await importMaterialPack({staged,existing:[f.asset],allAssets:[f.asset],data:f.data,publicDir:f.publicDir,
   writeAssets:async()=>assert.fail('must preserve existing'),registerTaxonomy:async()=>assert.fail('no addition')});
 assert.deepEqual(r,{added:0,skipped:1});
});

test('failed index write removes only newly created images and preserves existing files',async t=>{
 const f=await fixture(t);await mkdir(join(f.dest,'uploads'));await writeFile(join(f.dest,'uploads/keep.png'),f.bytes);
 const staged=await readMaterialPack(createReadStream(f.packed.archive),join(f.root,'read'));
 await assert.rejects(importMaterialPack({staged,existing:[],allAssets:[],data:f.dest,publicDir:f.publicDir,
   writeAssets:async()=>{throw Error('disk full')},registerTaxonomy:async()=>{}}),/disk full/);
 assert.deepEqual(await readdir(join(f.dest,'uploads')),['keep.png']);
});

test('corrupt and truncated archives fail before import',async t=>{
 const f=await fixture(t);const bytes=await readFile(f.packed.archive);
 for(const [name,value] of [['truncated',bytes.subarray(0,bytes.length-30)],['corrupt',Buffer.from(bytes)]]){
  if(name==='corrupt')value[value.indexOf(10)+15]^=1;
  async function* input(){yield value}
  await assert.rejects(readMaterialPack(input(),join(f.root,name)));
 }
 assert.deepEqual(await readdir(f.dest),[]);
});

test('malicious paths and extra fields are rejected, even with a recomputed header checksum',async t=>{
 const f=await fixture(t);const original=await readFile(f.packed.archive);const end=original.indexOf(10);
 for(const kind of ['path','private-fields']){
  const manifest=JSON.parse(original.subarray(0,end));
  if(kind==='path')manifest.files[0].path='uploads/../../secret.png';
  else manifest.snapshot.assets[0].sourceImage='/uploads/private-original.png';
  const header=JSON.stringify(manifest);
  const image=original.subarray(end+1,end+1+f.bytes.length);
  const bad=Buffer.concat([Buffer.from(header+'\n'),image,Buffer.from('\n'+JSON.stringify({complete:digest(header)})+'\n')]);
  async function* input(){yield bad}
  await assert.rejects(readMaterialPack(input(),join(f.root,kind)));
 }
});

test('export selection is required and bounded; metadata has an explicit allowlist',async t=>{
 const f=await fixture(t);
 for(const ids of [[],['missing'],Array.from({length:201},()=>f.asset.id)]){
  await assert.rejects(exportMaterialPack({ids,assets:[f.asset],data:f.data,publicDir:f.publicDir,directory:join(f.root,'bad'),appVersion:'test'}));
 }
 assert.deepEqual(Object.keys(materialPackMetadata(f.asset)).sort(),['author','category','group','labels','license','name','tags']);
});

test('real API imports append-only, exports selected metadata and survives restart',async t=>{
 const {spawn}=await import('node:child_process');const net=await import('node:net');
 const f=await fixture(t);const bytes=await readFile(f.packed.archive);
 const port=await new Promise(resolve=>{const server=net.createServer();server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port))})});
 const base=`http://127.0.0.1:${port}`;let child;
 t.after(()=>child?.kill());
 async function start(){
  child=spawn(process.execPath,['local/server-bootstrap.mjs'],{cwd:new URL('..',import.meta.url),stdio:'ignore',env:{...process.env,
    JOURNAL_DATA_DIR:f.dest,JOURNAL_CONFIG_DIR:join(f.root,'config'),JOURNAL_PORT:String(port),JOURNAL_WEB_PORT:String(port),
    DEEPSEEK_API_KEY:'',SHIGUANG_DEEPSEEK_API_KEY:''}});
  for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)return}catch{}await new Promise(r=>setTimeout(r,30))}
  throw Error('test server did not start');
 }
 async function stop(){const done=new Promise(resolve=>child.once('exit',resolve));child.kill();await done;}
 await start();
 const before=await(await fetch(base+'/api/state')).json();
 const initial=await(await fetch(base+'/api/materials')).json();
 const response=await fetch(base+'/api/materials/pack/import',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:bytes});
 assert.equal(response.status,200);const imported=await response.json();assert.equal(imported.added,1);
 assert.equal(imported.assets.length,initial.length+1);
 const added=imported.assets.find(a=>a.name==='绿叶');assert.equal(added.group,'植物');assert.ok(imported.catalog.taxonomy.groups.includes('植物'));
 const exported=await fetch(base+'/api/materials/pack/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:[added.id]})});
 assert.equal(exported.status,200);
 const staged=await readMaterialPack(exported.body,join(f.root,'api-roundtrip'));assert.equal(staged.manifest.snapshot.assets[0].labels.style[0],'水彩');
 const repeated=await(await fetch(base+'/api/materials/pack/import',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:bytes})).json();
 assert.equal(repeated.added,0);assert.equal(repeated.skipped,1);
 assert.deepEqual(await(await fetch(base+'/api/state')).json(),before);
 await stop();await start();
 const persisted=await(await fetch(base+'/api/materials')).json();assert.equal(persisted.length,initial.length+1);
 assert.equal(persisted.find(a=>a.id===added.id).group,'植物');
 await stop();
});


test('combined packs over 200 entries import once, deduplicate and preserve existing metadata', async t => {
  const f = await fixture(t);
  const assets = Array.from({ length: 411 }, (_, index) => ({ ...f.packed.manifest.snapshot.assets[0], name: `素材 ${index}` }));
  const combined = await writeArchive({ data: join(f.root, 'export/source'), publicDir: f.publicDir,
    directory: join(f.root, 'combined'), snapshot: { format: 'shiguang-materials-v1', assets }, appVersion: 'test', scope: 'journals' });
  const staged = await readMaterialPack(createReadStream(combined.archive), join(f.root, 'combined-read'));
  assert.equal(staged.manifest.snapshot.assets.length, 411);
  let saved = [];
  const result = await importMaterialPack({ staged, existing: [], allAssets: [], data: f.dest, publicDir: f.publicDir,
    writeAssets: async value => { saved = value; }, registerTaxonomy: async () => {} });
  assert.deepEqual(result, { added: 1, skipped: 410 });
  assert.equal(saved[0].name, '素材 0');
  const repeated = await importMaterialPack({ staged, existing: saved, allAssets: saved, data: f.dest, publicDir: f.publicDir,
    writeAssets: async () => assert.fail('must not rewrite imported metadata'), registerTaxonomy: async () => assert.fail('must not add taxonomy') });
  assert.deepEqual(repeated, { added: 0, skipped: 411 });
});

test('import accepts 500 entries but rejects 501 before writing to the library', async t => {
  const f = await fixture(t);
  for (const count of [500, 501]) {
    const assets = Array.from({ length: count }, () => f.packed.manifest.snapshot.assets[0]);
    const packed = await writeArchive({ data: join(f.root, 'export/source'), publicDir: f.publicDir,
      directory: join(f.root, `limit-${count}`), snapshot: { format: 'shiguang-materials-v1', assets }, appVersion: 'test', scope: 'journals' });
    const reading = readMaterialPack(createReadStream(packed.archive), join(f.root, `read-${count}`));
    if (count === 500) assert.equal((await reading).manifest.snapshot.assets.length, 500);
    else await assert.rejects(reading, /最多导入 500/);
  }
  assert.deepEqual(await readdir(f.dest), []);
});
