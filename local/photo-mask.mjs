import sharp from 'sharp';
import {open,writeFile,readFile,lstat,readdir,unlink} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {validateMaskInput,maskPath,maskImageRect,maskOutputSize,PHOTO_UPLOAD} from '../lib/photo-mask.mjs';
const failure=(message,status=400)=>Object.assign(new Error(message),{status});
export const PHOTO_IN_USE='这张原图仍被手帐或历史备份使用，暂时不能彻底删除。';
export function photoTrashProtection(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(key=>key!=='protectedSources'))throw failure('回收站参数无效。');
  const sources=raw.protectedSources??[];
  if(!Array.isArray(sources)||sources.length>50000||sources.some(src=>typeof src!=='string'||src.length>200||!src.startsWith('/uploads/')))throw failure('回收站引用参数无效。');
  return sources;
}
export function references(value,src){
  if(typeof value==='string')return value===src;
  return !!value&&typeof value==='object'&&Object.values(value).some(item=>references(item,src));
}
export async function renderPhotoMask(bytes,input){
  const normalized=await sharp(bytes,{limitInputPixels:50000000,animated:false}).rotate().png().toBuffer({resolveWithObject:true});
  const {width,height}=maskOutputSize(input.width,input.height);
  const r=maskImageRect(normalized.info.width,normalized.info.height,width,height,input.crop,input.cropY,input.cropZoom,input.photoRotation);
  const transform=`rotate(${input.photoRotation??0} ${width/2} ${height/2}) translate(${input.flipX?width:0} ${input.flipY?height:0}) scale(${input.flipX?-1:1} ${input.flipY?-1:1})`;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><clipPath id="shape"><path transform="scale(${width/100} ${height/100})" d="${maskPath(input.shape)}"/></clipPath></defs><g clip-path="url(#shape)"><image x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" preserveAspectRatio="none" transform="${transform}" xlink:href="data:image/png;base64,${normalized.data.toString('base64')}"/></g></svg>`;
  // The SVG is built here from fixed paths, validated numbers and a decoded PNG.
  // Detailed photos exceed libxml's default 10 MB text-node limit when embedded.
  // Relax that parser limit only for this generated document, never source images;
  // retain the source's 50 MP cap and the output's maximum 4096 px long edge.
  return sharp(Buffer.from(svg),{unlimited:true,limitInputPixels:4096*4096}).png().toBuffer();
}
/** All methods execute on the existing journal write queue. */
export function createPhotoMaskStore({data,atomic,getState}){
  let store;
  async function load(){
    if(store)return;
    try{store=JSON.parse(await readFile(join(data,'photo-trash.json'),'utf8'));}
    catch(e){store=undefined;if(e.code!=='ENOENT')throw failure('照片回收站无法读取，已停止操作以保护原图。',500);store={entries:[],deletedSources:[]};}
    if(!store||!Array.isArray(store.entries)||!Array.isArray(store.deletedSources)||store.entries.some(e=>!PHOTO_UPLOAD.test(e.src)||!PHOTO_UPLOAD.test(e.resultSrc)||!e.original||typeof e.id!=='string')){store=undefined;throw failure('照片回收站数据不完整，已停止操作以保护原图。',500);}
  }
  async function persist(next){await atomic('photo-trash.json',next);store=next;}
  async function sourceBytes(src){
    if(!PHOTO_UPLOAD.test(src))throw failure('照片路径无效。');
    if(!(await lstat(join(data,'uploads'))).isDirectory())throw failure('照片目录无效。');
    const file=await open(join(data,src.slice(1)),constants.O_RDONLY|constants.O_NOFOLLOW);
    try{const info=await file.stat();if(!info.isFile()||info.size>80*1024*1024)throw failure('照片文件无效或过大。');return await file.readFile();}finally{await file.close();}
  }
  async function reconcile(state=getState()){
    await load();let changed=false;
    const entries=store.entries.map(entry=>{
      if(entry.applied)return entry;
      const b=state.books.find(b=>b.id===entry.bookId),s=[b?.flyleaf,...(b?.spreads||[])].find(s=>s?.id===entry.spreadId),p=s?.elements.find(p=>p.id===entry.pieceId&&p.src===entry.resultSrc);
      if(!p)return entry;
      changed=true;return {...entry,applied:structuredClone(p)};
    });
    if(changed)await persist({...store,entries});
  }
  async function assertSavable(state){
    await load();
    if(store.deletedSources.some(src=>references(state,src)))throw failure('本次内容引用了已彻底删除的照片，无法保存。请撤销该操作或重新导入原图。',409);
  }
  async function isReferenced(entry){
    if(references(getState(),entry.src)||store.entries.some(other=>other.id!==entry.id&&references(other,entry.src)))return true;
    // Unreadable snapshots fail closed: never infer that a damaged backup has no references.
    try{
      try{if(references(JSON.parse(await readFile(join(data,'journal.previous.json'),'utf8')),entry.src))return true;}catch(e){if(e.code!=='ENOENT')throw e;}
      let files=[];try{files=await readdir(join(data,'journal-history'));}catch(e){if(e.code!=='ENOENT')throw e;}
      for(const name of files){if(!name.endsWith('.json'))continue;const path=join(data,'journal-history',name);if(!(await lstat(path)).isFile())throw Error('Invalid history');if(references(JSON.parse(await readFile(path,'utf8')),entry.src))return true;}
    }catch{throw failure('历史备份无法完整检查，暂时不能彻底删除照片。',409);}
    return false;
  }
  return {
    assertSavable,reconcile,
    async generate(raw){
      const input=validateMaskInput(raw);await load();
      const state=getState(),b=state.books.find(b=>b.id===input.bookId),s=[b?.flyleaf,...(b?.spreads||[])].find(s=>s?.id===input.spreadId),p=s?.elements.find(p=>p.id===input.pieceId);
      if(state.revision!==input.revision||!p||p.kind!=='photo'||p.src!==input.src||p.locked||p.frame==='masked')throw failure('照片已发生变化，请重新选择后应用蒙版。',409);
      const bytes=await sourceBytes(input.src),output=await renderPhotoMask(bytes,input);
      const resultSrc=`/uploads/${randomUUID()}.png`;
      await writeFile(join(data,resultSrc.slice(1)),output,{mode:0o600,flag:'wx'});
      const entry={id:randomUUID(),src:input.src,resultSrc,createdAt:new Date().toISOString(),bookId:b.id,spreadId:s.id,pieceId:p.id,original:structuredClone(p)};
      // A cancelled generation remains hidden; the original is never copied or removed.
      try{await persist({...store,entries:[entry,...store.entries]});}catch(e){await unlink(join(data,resultSrc.slice(1))).catch(()=>{});throw e;}
      return {src:resultSrc,id:entry.id};
    },
    async list(){await reconcile();return {entries:store.entries.filter(e=>e.applied&&!e.deleting)};},
    async restore(id){await reconcile();const entry=store.entries.find(e=>e.id===id&&e.applied&&!e.deleting);if(!entry)throw failure('回收项目不存在。',404);await sourceBytes(entry.src);return entry;},
    async remove(id,protectedSources=[]){
      await reconcile();const entry=store.entries.find(e=>e.id===id&&e.applied);if(!entry)throw failure('回收项目不存在。',404);
      if(protectedSources.includes(entry.src))throw failure('这张原图仍被本窗口的撤销记录使用，暂时不能彻底删除。',409);
      if(await isReferenced(entry))throw failure(PHOTO_IN_USE,409);
      // Persist a tombstone before unlink so a delayed save cannot resurrect a missing file.
      await persist({...store,deletedSources:[...new Set([...store.deletedSources,entry.src])],entries:store.entries.map(e=>e.id===id?{...e,deleting:true}:e)});
      try{await unlink(join(data,entry.src.slice(1)));}catch(e){if(e.code!=='ENOENT'){await persist({...store,deletedSources:store.deletedSources.filter(src=>src!==entry.src),entries:store.entries.map(e=>e.id===id?entry:e)});throw e;}}
      await persist({...store,entries:store.entries.filter(e=>e.id!==id)});
      return {deleted:true};
    },
    async clear(protectedSources=[]){
      await reconcile();const ids=store.entries.filter(e=>e.applied).map(e=>e.id);let deleted=0,blocked=0;
      for(const id of ids){try{await this.remove(id,protectedSources);deleted++;}catch(e){if(e.status===409)blocked++;else throw e;}}
      return {deleted,blocked};
    },
  };
}
