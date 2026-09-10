import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {mkdtemp,mkdir,writeFile,readdir,rename,rm,stat,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID,randomBytes} from 'node:crypto';
import {PHOTO_MASK_SHAPES,validateMaskInput,maskImageRect,rotatedMaskBounds,maskOutputSize,maskPath} from '../lib/photo-mask.mjs';
import {renderPhotoMask,createPhotoMaskStore,PHOTO_IN_USE,photoTrashProtection} from '../local/photo-mask.mjs';
import {applyMaskToBooks,restorePhotoMask} from '../lib/photo-mask-state.ts';
import {notebookUploads} from '../lib/journal-backup.ts';
const src='/uploads/11111111-1111-4111-8111-111111111111.png';
const resultSrc='/uploads/22222222-2222-4222-8222-222222222222.png';
const input=(patch={})=>({src,shape:'circle',width:320,height:240,crop:50,cropY:50,cropZoom:1,photoRotation:0,flipX:false,flipY:false,revision:1,bookId:'book',spreadId:'spread',pieceId:'photo',...patch});
const photo=()=>({id:'photo',kind:'photo',src,photoOriginal:src,x:13,y:22,w:30,h:40,rotation:17,locked:false,stackOrder:8,dayId:'day',frame:'plain'});
const books=()=>[{id:'book',title:'测试',spreads:[{id:'spread',elements:[photo()],days:[{id:'day',photos:[src]}]}]}];
const draft=()=>({pieceId:'photo',bookId:'book',spreadId:'spread',before:photo(),piece:{...photo(),crop:70,cropY:22,cropZoom:2,flipX:true,flipY:true},shape:'heart',photoRotation:35,token:'draft',generating:false,imageWidth:800,imageHeight:500});
const solid=(width=800,height=500)=>sharp({create:{width,height,channels:4,background:'#d95028'}}).png().toBuffer();
async function fixture(t){
 const data=await mkdtemp(join(tmpdir(),'photo-mask-test-'));t.after(()=>rm(data,{recursive:true,force:true}));await mkdir(join(data,'uploads'));
 await writeFile(join(data,src.slice(1)),await solid());
 let state={revision:1,books:books()},fail=false;
 const atomic=async(file,value)=>{if(fail)throw Error('disk full');const temp=join(data,randomUUID());await writeFile(temp,JSON.stringify(value),{mode:0o600});await rename(temp,join(data,file));};
 const create=()=>createPhotoMaskStore({data,atomic,getState:()=>state});
 return {data,store:create(),create,get state(){return state;},set state(v){state=v;},fail:()=>{fail=true;}};
}
test('four controlled shapes and finite parameters reject unknown paths and sizes',()=>{
 for(const shape of Object.keys(PHOTO_MASK_SHAPES)){assert.equal(validateMaskInput(input({shape})).shape,shape);assert.match(maskPath(shape),/^M /);assert.match(maskPath(shape),/Z$/);}
 assert.match(maskPath('star'),/Q /);assert.throws(()=>maskPath('triangle'));
 for(const patch of [{src:'/uploads/photo-'+ 'a'.repeat(31) +'.webp'},{src:'/uploads/photo-'+ 'a'.repeat(33) +'.webp'},{src:'/uploads/photo-'+ 'g'.repeat(32) +'.webp'},{src:'/uploads/photo-'+ 'a'.repeat(32) +'.webp/../file.png'},{src:'https://example.com/uploads/photo-'+ 'a'.repeat(32) +'.webp'},{src:'/etc/passwd'},{src:'/uploads/../file.png'},{src:'/uploads/%2e%2e/file.png'},{shape:'__proto__'},{shape:'triangle'},{width:0},{height:-1},{width:Infinity},{height:NaN},{crop:-1},{cropY:101},{cropZoom:0},{photoRotation:181},{flipX:1},{revision:1.5},{width:1,height:200},{unknown:1}])assert.throws(()=>validateMaskInput(input(patch)),JSON.stringify(patch));
 assert.deepEqual(maskOutputSize(100,50),{width:4096,height:2048});
});
test('wide, tall and square photos cover every rotated frame without extra zoom state',()=>{
 for(const [iw,ih] of [[2000,100],[100,2000],[300,300]])for(const [w,h] of [[500,100],[100,500],[200,200]])for(const angle of [0,35,90,-150])for(const zoom of [1,2,4]){
  const b=rotatedMaskBounds(w,h,angle),a=maskImageRect(iw,ih,w,h,0,0,zoom,angle),z=maskImageRect(iw,ih,w,h,100,100,zoom,angle);
  assert.ok(a.width>=b.width-1e-8&&a.height>=b.height-1e-8);assert.ok(Math.abs(a.x-(w-b.width)/2)<1e-8);assert.ok(Math.abs(z.x+z.width-(w+b.width)/2)<1e-8);assert.ok(Math.abs(z.y+z.height-(h+b.height)/2)<1e-8);
 }
});
test('all four shapes produce transparent PNGs with opaque interiors at stretched ratios and rotation',async()=>{
 for(const [i,shape] of Object.keys(PHOTO_MASK_SHAPES).entries()){
  const output=await renderPhotoMask(await solid(i%2?80:800,i%2?800:80),input({shape,width:i%2?160:500,height:i%2?400:180,photoRotation:i*29,crop:27,cropY:81,cropZoom:1.5,flipX:true,flipY:i%2===0}));
  const {data,info}=await sharp(output).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(info.channels,4);assert.equal(Math.max(info.width,info.height),4096);assert.equal(data[3],0);assert.equal(data[(Math.floor(info.height*.5)*info.width+Math.floor(info.width*.5))*4+3],255);
 }
});
test('crop, flip and internal rotation move actual pixels using the shared preview geometry',async()=>{
 const bytes=await sharp(Buffer.from('<svg width="400" height="200"><rect width="200" height="200" fill="#ff0000"/><rect x="200" width="200" height="200" fill="#0000ff"/></svg>')).png().toBuffer();
 async function center(patch){const {data,info}=await sharp(await renderPhotoMask(bytes,input({shape:'rounded',width:100,height:100,...patch}))).raw().toBuffer({resolveWithObject:true});const i=(Math.floor(info.height/2)*info.width+Math.floor(info.width/2))*info.channels;return [...data.subarray(i,i+3)];}
 assert.deepEqual(await center({crop:0,cropZoom:2}),[255,0,0]);assert.deepEqual(await center({crop:100,cropZoom:2}),[0,0,255]);
 assert.deepEqual(await center({crop:0,cropZoom:2,flipX:true,photoRotation:90}),[255,0,0]);
 const transparent=await sharp({create:{width:100,height:100,channels:4,background:'#00000000'}}).png().toBuffer();assert.ok((await sharp(await renderPhotoMask(transparent,input())).stats()).channels[3].max===0);
});
test('draft, cancellation, apply, undo snapshots and backup keep a single target and its geometry',()=>{
 const original=books(),snapshot=structuredClone(original),d=draft();d.piece.w=45;d.piece.h=22;d.piece.rotation=55;
 assert.deepEqual(original,snapshot);const next=applyMaskToBooks(original,d,resultSrc),p=next[0].spreads[0].elements[0];
 for(const key of ['id','x','y','w','h','rotation','locked','stackOrder'])assert.equal(p[key],d.piece[key]);
 assert.equal(p.src,resultSrc);assert.equal(p.photoOriginal,undefined);assert.equal(p.cropZoom,1);assert.equal(p.flipX,false);assert.equal(p.frame,'masked');assert.equal(p.photoMask,undefined);
 assert.deepEqual(notebookUploads(next),[resultSrc]);assert.deepEqual(original,snapshot);assert.deepEqual(structuredClone(next),next);
 const shared=books();shared[0].spreads[0].elements.push({...photo(),id:'other'});assert.equal(applyMaskToBooks(shared,d,resultSrc)[0].spreads[0].elements[1].src,src);
 const changed=books();changed[0].spreads[0].elements[0].rotation++;assert.throws(()=>applyMaskToBooks(changed,d,resultSrc));
});
test('restore replaces only the untouched result; subsequent edits and removed positions insert a new photo',()=>{
 const original=books(),masked=applyMaskToBooks(original,draft(),resultSrc),applied=masked[0].spreads[0].elements[0],entry={id:'trash',src,resultSrc,bookId:'book',spreadId:'spread',pieceId:'photo',original:photo(),applied};
 assert.deepEqual(restorePhotoMask(masked,entry,'book','spread','restored')[0].spreads[0].elements[0],photo());
 const changed=structuredClone(masked);changed[0].spreads[0].elements[0].rotation++;
 const restored=restorePhotoMask(changed,entry,'book','spread','restored')[0].spreads[0].elements;assert.equal(restored.length,2);assert.equal(restored[0].src,resultSrc);assert.equal(restored[1].src,src);assert.equal(restored[1].id,'restored');assert.equal(restored[1].dayId,undefined);
 changed[0].spreads[0].elements=[];assert.equal(restorePhotoMask(changed,entry,'book','spread','restored')[0].spreads[0].elements.length,1);
});
test('generation writes one new file, does not copy or mutate original, and survives store restart',async t=>{
 const f=await fixture(t),before=structuredClone(f.state),source=await stat(join(f.data,src.slice(1))),result=await f.store.generate(input());
 assert.deepEqual(f.state,before);assert.equal((await f.store.list()).entries.length,0);assert.equal((await readdir(join(f.data,'uploads'))).length,2);assert.equal((await stat(join(f.data,src.slice(1)))).ino,source.ino);assert.equal((await stat(join(f.data,result.src.slice(1)))).mode&0o777,0o600);
 f.state={revision:2,books:applyMaskToBooks(f.state.books,draft(),result.src)};await f.store.reconcile();assert.equal((await f.create().list()).entries.length,1);assert.equal((await f.store.restore(result.id)).original.src,src);
 await assert.rejects(f.store.generate(input()),{status:409});
});
test('invalid image, symlink and failed metadata write leave the original state and files intact',async t=>{
 const f=await fixture(t),before=structuredClone(f.state);f.fail();await assert.rejects(f.store.generate(input()),/disk full/);assert.deepEqual(f.state,before);assert.equal((await readdir(join(f.data,'uploads'))).length,1);
 const g=await fixture(t);await writeFile(join(g.data,src.slice(1)),'broken');await assert.rejects(g.store.generate(input()));assert.deepEqual(g.state,before);await rm(join(g.data,src.slice(1)));await symlink('/etc/hosts',join(g.data,src.slice(1)));await assert.rejects(g.store.generate(input()));
});
test('deletion checks current books, previous, all history and other recycle records; tombstones reject delayed saves',async t=>{
 const f=await fixture(t),result=await f.store.generate(input());f.state={revision:2,books:applyMaskToBooks(f.state.books,draft(),result.src)};await f.store.reconcile();
 f.state.books.push({...books()[0],id:'another'});await assert.rejects(f.store.remove(result.id),{message:PHOTO_IN_USE});f.state.books.pop();
 await writeFile(join(f.data,'journal.previous.json'),JSON.stringify(books()));await assert.rejects(f.store.remove(result.id),{status:409});await rm(join(f.data,'journal.previous.json'));
 await mkdir(join(f.data,'journal-history'));await writeFile(join(f.data,'journal-history','old.json'),JSON.stringify(books()));await assert.rejects(f.store.remove(result.id),{status:409});await writeFile(join(f.data,'journal-history','old.json'),'broken');await assert.rejects(f.store.remove(result.id),/完整检查/);await rm(join(f.data,'journal-history','old.json'));
 assert.deepEqual(photoTrashProtection({protectedSources:[src]}),[src]);assert.throws(()=>photoTrashProtection({protectedSources:['/etc/passwd']}));
 assert.deepEqual(await f.store.clear([src]),{deleted:0,blocked:1});assert.deepEqual(await f.store.clear(),{deleted:1,blocked:0});await assert.rejects(stat(join(f.data,src.slice(1))),{code:'ENOENT'});await assert.rejects(f.create().assertSavable({books:books()}),{status:409});assert.ok(await stat(join(f.data,result.src.slice(1))));
});
test('other trash records protect the same original and corrupt metadata fails closed repeatedly',async t=>{
 const f=await fixture(t),a=await f.store.generate(input());await f.store.generate(input());f.state={revision:2,books:applyMaskToBooks(f.state.books,draft(),a.src)};await assert.rejects(f.store.remove(a.id),{status:409});
 await writeFile(join(f.data,'photo-trash.json'),'{');const store=f.create();await assert.rejects(store.list());await assert.rejects(store.list());
});

test('detailed photos whose embedded PNG exceeds the SVG text limit still generate safely',async t=>{
 const f=await fixture(t);
 const bytes=await sharp(randomBytes(2560*1440*3),{raw:{width:2560,height:1440,channels:3}}).png().toBuffer();
 assert.ok(bytes.toString('base64').length>10000000,'fixture must exceed the default XML text limit');
 await writeFile(join(f.data,src.slice(1)),bytes);
 const before=structuredClone(f.state),result=await f.store.generate(input({shape:'heart',photoRotation:35,flipX:true}));
 const {data,info}=await sharp(join(f.data,result.src.slice(1))).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 assert.equal(Math.max(info.width,info.height),4096);assert.equal(data[3],0);assert.equal(data[(Math.floor(info.height/2)*info.width+Math.floor(info.width/2))*4+3],255);
 assert.deepEqual(f.state,before);assert.equal((await readdir(join(f.data,'uploads'))).length,2);
});
