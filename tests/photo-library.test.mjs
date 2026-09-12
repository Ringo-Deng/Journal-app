import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {mkdtemp,mkdir,readFile,rm,stat,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createPhotoLibrary,journalPhotoSources,photoMaskSourceMap} from '../local/photo-library.mjs';

const folders=[];
test.after(async()=>{for(const folder of folders)await rm(folder,{recursive:true,force:true})});
async function fixture(){const dir=await mkdtemp(join(tmpdir(),'journal-photo-library-'));folders.push(dir);await mkdir(join(dir,'uploads'),{recursive:true});const atomic=async(file,value)=>writeFile(join(dir,file),JSON.stringify(value),{mode:0o600});return {dir,atomic}}
const image=(color,width=18,height=12)=>sharp({create:{width,height,channels:3,background:color}}).png().toBuffer();

test('photo library preserves originals, orders by capture fallback and deduplicates bytes',async()=>{
 const {dir,atomic}=await fixture(),protectedSet=new Set();
 const library=createPhotoLibrary({data:dir,atomic,isReferenced:async src=>protectedSet.has(src)});
 const older=await library.import(await image('#aa3333'),{name:'旧照片.png',lastModified:Date.parse('2025-01-02T03:04:05Z')});
 const newer=await library.import(await image('#33aa44'),{name:'新照片.png',lastModified:Date.parse('2026-08-09T10:11:12Z')});
 assert.equal(older.duplicate,false);assert.equal((await library.import(await image('#aa3333'),{name:'重复.png'})).duplicate,true);
 const page=await library.list(0,1);assert.equal(page.total,2);assert.equal(page.items[0].id,newer.item.id);assert.equal(page.nextOffset,1);
 assert.equal((await library.thumbnail(newer.item.id)).subarray(8,12).toString('ascii'),'WEBP');
 assert.equal((await stat(join(dir,newer.item.originalFile))).mode&0o777,0o600);
 protectedSet.add(newer.item.src);await assert.rejects(()=>library.remove(newer.item.id),/仍被手帐/);
 protectedSet.clear();assert.deepEqual(await library.remove(newer.item.id),{deleted:true});await assert.rejects(()=>stat(join(dir,newer.item.originalFile)),{code:'ENOENT'});
 assert.equal(JSON.parse(await readFile(join(dir,'photo-library.json'),'utf8')).length,1);
});

test('existing journal photos are indexed without copying or changing journal data',async()=>{
 const {dir,atomic}=await fixture(),bytes=await image('#3366aa');await writeFile(join(dir,'uploads','existing.png'),bytes,{mode:0o600});
 const state={books:[{flyleaf:{days:[],elements:[{kind:'photo',src:'/uploads/existing.png'}]},spreads:[{days:[{photos:['/uploads/existing.png']}],elements:[]}]}]};
 assert.deepEqual(journalPhotoSources(state),['/uploads/existing.png']);
 const before=structuredClone(state),library=createPhotoLibrary({data:dir,atomic});
 assert.deepEqual(await library.reconcile(journalPhotoSources(state)),{added:1,skipped:0});
 const item=(await library.list()).items[0];assert.equal(item.src,'/uploads/existing.png');assert.equal(item.originalFile,'uploads/existing.png');assert.deepEqual(state,before);
 assert.equal((await library.reconcile(journalPhotoSources(state))).added,0);
});

test('masked results resolve to originals across days, pages, flyleaves and templates',()=>{
 const original='/uploads/original.png',result='/uploads/masked.png',unknown='/uploads/imported-mask.png';
 const state={books:[{flyleaf:{elements:[{kind:'photo',src:result,frame:'masked'}]},spreads:[{days:[{photos:[result,unknown,'/uploads/ordinary.png']}],elements:[]}],collageTemplates:[{elements:[{kind:'photo',src:unknown,frame:'masked'}]}]}]};
 const before=structuredClone(state),masks=photoMaskSourceMap(state,[{src:original,resultSrc:result}]);
 assert.deepEqual(journalPhotoSources(state,masks),[original,'/uploads/ordinary.png']);
 assert.deepEqual(journalPhotoSources(state),['/uploads/ordinary.png']);
 assert.deepEqual(state,before);
 // A copied plain-frame result is still derived when its trash provenance remains.
 const copied={books:[{spreads:[{elements:[{kind:'photo',src:result,photoOriginal:result,frame:'plain'}]}]}]};
 assert.deepEqual(journalPhotoSources(copied,photoMaskSourceMap(copied,[{src:original,resultSrc:result}])),[original]);
 assert.deepEqual(journalPhotoSources(copied,new Map([[result,unknown],[unknown,result]])),[]);
});

test('legacy automatic mask entries stay out of the timeline and photo backup without removing data',async()=>{
 const {dir,atomic}=await fixture(),src='/uploads/original.png',result='/uploads/masked.png';
 const original=await image('#b43b34'),masked=await sharp({create:{width:18,height:12,channels:4,background:'#00000000'}}).png().toBuffer();
 await writeFile(join(dir,src.slice(1)),original);await writeFile(join(dir,result.slice(1)),masked);
 const old=createPhotoLibrary({data:dir,atomic});await old.reconcile([src,result]);
 const before=await readFile(join(dir,'photo-library.json'));
 const masks=photoMaskSourceMap({books:[]},[{src,resultSrc:result}]);
 const library=createPhotoLibrary({data:dir,atomic,getMaskSources:async()=>masks});
 assert.deepEqual(await library.reconcile([result]),{added:0,skipped:0});
 const page=await library.list(0,1);assert.equal(page.total,1);assert.equal(page.nextOffset,null);assert.equal(page.items[0].src,src);
 const records=[];for await(const record of library.backupRecords())records.push(record);
 assert.equal(records.length,1);assert.deepEqual(Buffer.from(records[0].data,'base64'),original);
 assert.deepEqual(await readFile(join(dir,'photo-library.json')),before);
 assert.deepEqual(await readFile(join(dir,result.slice(1))),masked);
 assert.ok((await library.sources()).includes(src));assert.ok((await library.sources()).includes(result));
 // Explicitly importing a transparent result is a separate user choice, even after old auto-indexing.
 const imported=await library.import(masked,{name:'透明照片.png'});
 assert.equal(imported.duplicate,false);assert.match(imported.item.originalFile,/^photo-originals\//);
 assert.equal((await library.list()).total,2);
 assert.equal((await library.import(masked,{name:'重复透明照片.png'})).duplicate,true);
 assert.deepEqual(await readFile(join(dir,result.slice(1))),masked);
});

test('masked photos are never newly auto-indexed and intentional imports remain visible',async()=>{
 const {dir,atomic}=await fixture(),result='/uploads/masked.png',bytes=await image('#446699');
 await writeFile(join(dir,result.slice(1)),bytes);
 const masks=new Map([[result,'']]);
 const library=createPhotoLibrary({data:dir,atomic,getMaskSources:async()=>masks});
 assert.deepEqual(await library.reconcile([result]),{added:0,skipped:0});assert.equal((await library.list()).total,0);
 const imported=await library.import(bytes,{name:'单独导入.png'});masks.set(imported.item.src,'');
 assert.equal((await library.list()).items[0].id,imported.item.id);
 const records=[];for await(const record of library.backupRecords())records.push(record);assert.equal(records.length,1);
});

test('photo library backup restores originals and skips existing photos',async()=>{
 const first=await fixture(),source=createPhotoLibrary({data:first.dir,atomic:first.atomic});await source.import(await image('#7766aa'),{name:'旅行原片.png',capturedAt:'2026-04-05T06:07:08'});
 const records=[];for await(const record of source.backupRecords())records.push(record);assert.equal(records.length,1);
 const second=await fixture(),target=createPhotoLibrary({data:second.dir,atomic:second.atomic});
 assert.equal((await target.restoreRecord(records[0])).duplicate,false);assert.equal((await target.restoreRecord(records[0])).duplicate,true);
 const restored=(await target.list()).items[0];assert.equal(restored.originalName,'旅行原片.png');assert.equal(restored.capturedAt,'2026-04-05T06:07:08');
});

test('embedded EXIF capture time wins over file modification time',async()=>{
 const {dir,atomic}=await fixture(),library=createPhotoLibrary({data:dir,atomic});
 const bytes=await sharp({create:{width:10,height:10,channels:3,background:'#4488aa'}}).jpeg().withExif({IFD0:{DateTime:'2023:07:08 09:10:11'},IFD2:{DateTimeOriginal:'2022:06:05 04:03:02'}}).toBuffer();
 const imported=await library.import(bytes,{name:'有拍摄时间.jpg',lastModified:Date.parse('2026-01-01T00:00:00Z')});
 assert.equal(imported.item.capturedAt,'2022-06-05T04:03:02');
});
