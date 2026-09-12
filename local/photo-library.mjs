import sharp from 'sharp';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,readFile,stat,unlink,writeFile} from 'node:fs/promises';
import {basename,extname,join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';

const run=promisify(execFile);
const MAX_PHOTO_BYTES=80*1024*1024;
const MAX_PHOTO_PIXELS=120_000_000;
const PHOTO_SOURCE=/^\/uploads\/[a-zA-Z0-9._-]+\.(?:jpg|jpeg|png|webp)$/;
const ORIGINAL_FILE=/^(?:photo-originals\/[a-f0-9]{64}\.(?:jpg|png|webp|heic|heif)|uploads\/[a-zA-Z0-9._-]+\.(?:jpg|jpeg|png|webp))$/;
const DATE_TEXT=/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/;
const fail=(message,status=400)=>Object.assign(Error(message),{status});

function photoFormat(buffer,name,metadata){
  const ext=extname(name).toLowerCase();
  if(metadata.format==='jpeg')return {ext:'.jpg',mime:'image/jpeg'};
  if(metadata.format==='png')return {ext:'.png',mime:'image/png'};
  if(metadata.format==='webp')return {ext:'.webp',mime:'image/webp'};
  const brand=buffer.length>=12?buffer.toString('ascii',8,12):'';
  if(metadata.format==='heif'||['heic','heix','hevc','hevx','mif1','msf1'].includes(brand)||['.heic','.heif'].includes(ext))return {ext:ext==='.heif'?'.heif':'.heic',mime:ext==='.heif'?'image/heif':'image/heic'};
  throw fail('请选择 JPG、PNG、WebP 或 HEIC 照片。');
}

function exifCapturedAt(exif){
  if(!Buffer.isBuffer(exif)||exif.length<14)return '';
  let base=-1;
  for(let i=0;i<=Math.min(32,exif.length-4);i++){
    const marker=exif.toString('ascii',i,i+4);
    if(marker===`II*${String.fromCharCode(0)}`||marker===`MM${String.fromCharCode(0)}*`){base=i;break;}
  }
  if(base<0)return '';
  const little=exif.toString('ascii',base,base+2)==='II';
  const u16=offset=>little?exif.readUInt16LE(offset):exif.readUInt16BE(offset);
  const u32=offset=>little?exif.readUInt32LE(offset):exif.readUInt32BE(offset);
  const text=(entry,count)=>{
    const start=count<=4?entry+8:base+u32(entry+8);
    if(start<0||start+count>exif.length)return '';
    const raw=exif.toString('ascii',start,start+count),zero=raw.indexOf(String.fromCharCode(0));
    return (zero>=0?raw.slice(0,zero):raw).trim();
  };
  const dates=[];
  const visit=(relative,depth=0)=>{
    const start=base+relative;if(depth>2||start<base||start+2>exif.length)return;
    const count=u16(start);if(count>512||start+2+count*12>exif.length)return;
    for(let index=0;index<count;index++){
      const entry=start+2+index*12,tag=u16(entry),type=u16(entry+2),length=u32(entry+4);
      if(type===2&&[0x9003,0x9004,0x0132].includes(tag))dates.push({tag,value:text(entry,length)});
      if(tag===0x8769&&length===1)visit(u32(entry+8),depth+1);
    }
  };
  try{visit(u32(base+4));}catch{return ''}
  const value=dates.sort((a,b)=>[0x9003,0x9004,0x0132].indexOf(a.tag)-[0x9003,0x9004,0x0132].indexOf(b.tag)).find(item=>DATE_TEXT.test(item.value))?.value;
  const match=value&&DATE_TEXT.exec(value);return match?`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}`:'';
}

function fallbackDate(value){
  if(value===undefined||value===null||value==='')return '';
  if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value))return value.slice(0,19);
  const date=new Date(Number(value));return Number.isNaN(date.getTime())?'':date.toISOString();
}

async function writeNew(path,buffer){
  try{await writeFile(path,buffer,{mode:0o600,flag:'wx'});return true}catch(e){if(e.code==='EEXIST')return false;throw e}
}

async function readable(path){try{return (await stat(path)).isFile()}catch{return false}}

function photoSheets(state){
  return (state?.books||[]).flatMap(book=>[book.flyleaf,...(book.spreads||[]),...(book.collageTemplates||[])]).filter(Boolean);
}

export function photoMaskSourceMap(state,maskEntries=[]){
  const sources=new Map();
  for(const entry of maskEntries)if(PHOTO_SOURCE.test(entry.resultSrc))sources.set(entry.resultSrc,entry.src);
  // Notebook-only backups can contain masked pages without the local trash records.
  for(const sheet of photoSheets(state))for(const piece of sheet.elements||[]){
    if(piece?.kind==='photo'&&piece.frame==='masked'&&PHOTO_SOURCE.test(piece.src)&&!sources.has(piece.src))sources.set(piece.src,piece.photoOriginal||'');
  }
  return sources;
}

export function journalPhotoSources(state,maskSources=photoMaskSourceMap(state)){
  const found=[];
  const add=value=>{
    const seen=new Set();
    while(maskSources.has(value)){if(seen.has(value))return;seen.add(value);value=maskSources.get(value)}
    if(typeof value==='string'&&PHOTO_SOURCE.test(value))found.push(value);
  };
  const sheet=spread=>{
    if(!spread)return;
    for(const day of spread.days||[])for(const src of day.photos||[])add(src);
    for(const piece of spread.elements||[])if(piece?.kind==='photo')add(piece.photoOriginal||piece.src);
  };
  for(const spread of photoSheets(state))sheet(spread);
  return [...new Set(found)];
}

export function createPhotoLibrary({data,atomic,isReferenced=async()=>false,getMaskSources=async()=>new Map()}){
  const originals=join(data,'photo-originals'),thumbs=join(data,'photo-thumbnails'),uploads=join(data,'uploads');
  let entries,queue=Promise.resolve();
  const task=fn=>{const next=queue.then(fn);queue=next.catch(()=>{});return next};
  async function load(){
    if(entries)return;
    await mkdir(originals,{recursive:true,mode:0o700});await mkdir(thumbs,{recursive:true,mode:0o700});
    try{entries=JSON.parse(await readFile(join(data,'photo-library.json'),'utf8'))}catch(e){if(e.code!=='ENOENT')throw fail('照片分类数据无法读取，已停止修改以保护原片。',500);entries=[]}
    if(!Array.isArray(entries)||entries.some(item=>!item||!/^[a-f0-9]{64}$/.test(item.id)||item.sha256!==item.id||!PHOTO_SOURCE.test(item.src)||!ORIGINAL_FILE.test(item.originalFile||'')||item.thumbnailSrc!==`/api/photos/thumbnail/${item.id}`||typeof item.originalName!=='string'||item.originalName.length>180||typeof item.capturedAt!=='string'||Number.isNaN(Date.parse(item.capturedAt)))){entries=undefined;throw fail('照片分类数据不完整，已停止修改以保护原片。',500)}
  }
  async function persist(next){await atomic('photo-library.json',next);entries=next}
  async function visibleEntries(){
    await load();const masks=await getMaskSources();
    // Hide old automatic mask imports without deleting their files or metadata.
    // Explicit imports have their own original file and remain valid library photos.
    return entries.filter(item=>item.originalFile!==item.src.slice(1)||!masks.has(item.src));
  }
  async function normalized(buffer,format,originalPath){
    const render=async input=>{
      const metadata=await sharp(input,{limitInputPixels:MAX_PHOTO_PIXELS,animated:false}).metadata();
      const display=await sharp(input,{limitInputPixels:MAX_PHOTO_PIXELS,animated:false}).rotate().resize({width:4096,height:4096,fit:'inside',withoutEnlargement:true}).webp({quality:92,effort:4}).toBuffer({resolveWithObject:true});
      const thumb=await sharp(input,{limitInputPixels:MAX_PHOTO_PIXELS,animated:false}).rotate().resize({width:520,height:520,fit:'inside',withoutEnlargement:true}).webp({quality:78,effort:4}).toBuffer();
      return {display,thumb,metadata};
    };
    try{return await render(buffer)}catch{
      if(!['.heic','.heif'].includes(format.ext))throw fail('照片内容无法读取，原文件没有导入。');
      const temp=join(data,`photo-convert-${randomUUID()}.jpg`);
      try{await run('/usr/bin/sips',['-s','format','jpeg','-s','formatOptions','92',originalPath,'--out',temp],{timeout:120000,maxBuffer:1024*1024});return await render(await readFile(temp))}
      catch{throw fail('这张 HEIC 照片暂时无法转换，原文件没有导入。',422)}finally{await unlink(temp).catch(()=>{})}
    }
  }
  async function importUnsafe(buffer,{name='照片',lastModified='',capturedAt='',reuseSource=''}={}){
    await load();
    if(!Buffer.isBuffer(buffer)||!buffer.length||buffer.length>MAX_PHOTO_BYTES)throw fail('单张照片不能超过 80 MB。',413);
    let probe;
    try{probe=await sharp(buffer,{limitInputPixels:MAX_PHOTO_PIXELS,animated:false}).metadata()}catch{probe={}}
    const format=photoFormat(buffer,name,probe),sha=createHash('sha256').update(buffer).digest('hex'),existing=entries.find(item=>item.sha256===sha||item.id===sha);
    if(existing){
      const original=join(data,existing.originalFile||existing.src.slice(1));
      if(await readable(original)){
        const explicitMaskImport=!reuseSource&&existing.originalFile===existing.src.slice(1)&&(await getMaskSources()).has(existing.src);
        if(!explicitMaskImport)return {item:existing,duplicate:true};
        // An intentional import of a previously hidden result gets its own library original.
      }else entries=entries.filter(item=>item!==existing);
    }
    const importedAt=new Date().toISOString(),originalFile=reuseSource?reuseSource.slice(1):`photo-originals/${sha}${format.ext}`;
    const originalPath=join(data,originalFile);let wroteOriginal=false,wroteDisplay=false,wroteThumb=false;
    try{
      if(!reuseSource)wroteOriginal=await writeNew(originalPath,buffer);
      const converted=await normalized(buffer,format,originalPath);
      const src=reuseSource||`/uploads/photo-${sha.slice(0,32)}.webp`,thumbFile=`photo-thumbnails/${sha}.webp`;
      if(!reuseSource)wroteDisplay=await writeNew(join(data,src.slice(1)),converted.display.data);
      wroteThumb=await writeNew(join(data,thumbFile),converted.thumb);
      const item={id:sha,sha256:sha,src,thumbnailSrc:`/api/photos/thumbnail/${sha}`,originalFile,originalName:basename(name||'照片').slice(0,180),mime:format.mime,size:buffer.length,width:converted.display.info.width||probe.width||0,height:converted.display.info.height||probe.height||0,capturedAt:exifCapturedAt(converted.metadata.exif||probe.exif)||fallbackDate(capturedAt)||fallbackDate(lastModified)||importedAt,importedAt};
      const next=[item,...entries.filter(entry=>entry.id!==sha)];await persist(next);return {item,duplicate:false};
    }catch(error){
      if(wroteThumb)await unlink(join(thumbs,`${sha}.webp`)).catch(()=>{});
      if(wroteDisplay)await unlink(join(uploads,`photo-${sha.slice(0,32)}.webp`)).catch(()=>{});
      if(wroteOriginal)await unlink(originalPath).catch(()=>{});
      throw error;
    }
  }
  return {
    async import(buffer,meta){return task(()=>importUnsafe(buffer,meta))},
    async reconcile(sources){return task(async()=>{
      await load();const masks=await getMaskSources();let added=0,skipped=0;
      for(const src of sources){
        if(masks.has(src))continue;
        if(entries.some(item=>item.src===src||item.originalFile===src.slice(1)))continue;
        try{const path=join(data,src.slice(1)),info=await stat(path),buffer=await readFile(path),result=await importUnsafe(buffer,{name:basename(src),lastModified:info.mtimeMs,reuseSource:src});if(!result.duplicate)added++}catch{skipped++}
      }
      return {added,skipped};
    })},
    async list(offset=0,limit=60){const ordered=(await visibleEntries()).sort((a,b)=>b.capturedAt.localeCompare(a.capturedAt)||b.importedAt.localeCompare(a.importedAt));const start=Math.max(0,offset),size=Math.max(1,Math.min(120,limit));return {items:ordered.slice(start,start+size),total:ordered.length,nextOffset:start+size<ordered.length?start+size:null}},
    async thumbnail(id){await load();const item=entries.find(entry=>entry.id===id);if(!item)throw fail('照片不存在。',404);return readFile(join(thumbs,`${id}.webp`))},
    async remove(id,protectedSources=[]){return task(async()=>{
      await load();const item=entries.find(entry=>entry.id===id);if(!item)throw fail('照片不存在。',404);
      if(protectedSources.includes(item.src)||await isReferenced(item.src))throw fail('这张照片仍被手帐、素材或历史备份使用，暂时不能删除。',409);
      const next=entries.filter(entry=>entry.id!==id);await persist(next);
      const files=new Set([join(thumbs,`${id}.webp`),join(data,item.originalFile),join(data,item.src.slice(1))]);
      for(const file of files)await unlink(file).catch(error=>{if(error.code!=='ENOENT')throw error});
      return {deleted:true};
    })},
    async sources(){await load();return [...new Set(entries.flatMap(item=>[item.src,'/'+item.originalFile]))]},
    async *backupRecords(){for(const item of (await visibleEntries()).sort((a,b)=>a.importedAt.localeCompare(b.importedAt))){const bytes=await readFile(join(data,item.originalFile));yield {name:item.originalName,capturedAt:item.capturedAt,data:bytes.toString('base64')}}},
    async restoreRecord(record){
      if(!record||typeof record.name!=='string'||typeof record.data!=='string'||record.data.length>Math.ceil(MAX_PHOTO_BYTES*4/3)+16||!/^[A-Za-z0-9+/]*={0,2}$/.test(record.data))throw fail('照片库备份中包含无效照片。');
      const buffer=Buffer.from(record.data,'base64');return this.import(buffer,{name:record.name,capturedAt:record.capturedAt});
    },
  };
}
