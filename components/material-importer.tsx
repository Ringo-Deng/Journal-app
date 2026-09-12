'use client';
/* oxlint-disable next/no-img-element -- Pinterest previews use URLs resolved by the local material service. */
import {useRef,useState} from 'react';
import {ImagePlus,Loader2} from 'lucide-react';
import type {Asset} from '@/lib/journal';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';

type Job={source:string;items:{id:string}[];manualOnly?:boolean};
type PinterestPreview={pinId:string;previewUrl:string;originalUrl:string;images:{id:string;previewUrl:string;downloadUrl:string}[]};

async function request<T>(path:string,data?:unknown):Promise<T>{
 const response=await fetch('/api/materials'+path,data===undefined?undefined:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
 const result=await response.json() as T&{error?:string};
 if(!response.ok)throw Error(result.error||'素材导入失败');
 return result;
}

function localPinterestPinId(value:string){
 const raw=value.trim();
 if(/^\d{6,30}$/.test(raw))return raw;
 const iframe=/<iframe\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/i.exec(raw);
 const candidate=iframe?iframe[1]:raw;
 try{
  const url=new URL(candidate.replace(/&amp;/gi,'&'));
  if(url.hostname==='assets.pinterest.com')return /^\d{6,30}$/.test(url.searchParams.get('id')||'')?url.searchParams.get('id')||'':'';
  if(!(url.hostname==='pinterest.com'||url.hostname.endsWith('.pinterest.com')))return '';
  return /\/pin\/(?:[^/]*--)?(\d{6,30})(?:\/|$)/i.exec(url.pathname)?.[1]||'';
 }catch{return ''}
}

export default function MaterialImporter({open,onClose,onReady,onImported,onOpenLibrary}:{open:boolean;onClose:()=>void;onReady:(message:string,targetSource:string)=>void;onImported:(assets:Asset[])=>void;onOpenLibrary:()=>void}){
 const [mode,setMode]=useState<'whole'|'segment'>('whole'),[importedCount,setImportedCount]=useState(0);
 const file=useRef<HTMLInputElement>(null),pinterestSeq=useRef(0);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[progress,setProgress]=useState('');
 const [pinterestInput,setPinterestInput]=useState(''),[pinterestPreview,setPinterestPreview]=useState<PinterestPreview|null>(null),[pinterestSelected,setPinterestSelected]=useState(''),[pinterestStatus,setPinterestStatus]=useState('等待粘贴'),[pinterestResolving,setPinterestResolving]=useState(false);

 async function upload(files:FileList|null){
  if(!files?.length)return;
  setBusy(true);setMessage('');setImportedCount(0);
  const list=Array.from(files);let completed=0,total=0,opened=0,targetSource='';const errors:string[]=[],fallbacks:string[]=[];
  try{
   for(const item of list){
    setProgress(`正在处理 ${completed+1} / ${list.length}：${item.name}`);
    try{
     if(!['image/png','image/jpeg','image/webp'].includes(item.type)||item.size>10*1024*1024)throw Error('请选择 10 MB 以内的 JPG、PNG 或 WebP');
     const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>typeof reader.result==='string'?resolve(reader.result):reject(Error('图片读取失败'));reader.onerror=()=>reject(Error('图片读取失败'));reader.readAsDataURL(item)});
     const response=await fetch('/api/upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data})});
     const uploaded=await response.json() as {src?:string;error?:string};
     if(!response.ok||!uploaded.src)throw Error(uploaded.error||'上传失败');
     if(mode==='whole'){
      const result=await request<{assets:Asset[]}>('/import-image',{src:uploaded.src,name:item.name});
      onImported(result.assets);total++;setImportedCount(total);
     }else{
      const source=await request<Job>('/source',{src:uploaded.src,name:item.name});
      opened++;targetSource=source.source;
      if(!source.manualOnly){
       try{const job=await request<Job>('/segment',{src:uploaded.src,name:item.name,mode:'auto',tolerance:28});total+=job.items.length}
       catch(error){fallbacks.push(`${item.name}：自动识别未完成，原图已保留，可直接自由裁切（${(error as Error).message}）`)}
      }
     }
    }catch(error){errors.push(`${item.name}：${(error as Error).message}`)}
    completed++;
   }
   const details=[...fallbacks,...errors].join('；');
   const summary=mode==='whole'?`已将 ${total} 张整图加入素材库。${details}`:`已打开 ${opened} 张图片${total?`，自动拆出 ${total} 个素材`:'，可以直接使用自由裁切'}。${details}`;
   if(mode==='segment'&&opened&&targetSource)onReady(summary,targetSource);else setMessage(summary);
  }finally{setBusy(false);setProgress('');if(file.current)file.current.value=''}
 }

 async function recognizePinterest(value:string){
  setPinterestInput(value);const seq=++pinterestSeq.current;const pinId=localPinterestPinId(value);
  if(!value.trim()){setPinterestPreview(null);setPinterestStatus('等待粘贴');setPinterestResolving(false);return}
  if(!pinId){setPinterestPreview(null);setPinterestStatus('未识别到 Pinterest Pin');setPinterestResolving(false);return}
  setPinterestPreview(null);setPinterestStatus(`已识别 Pin ${pinId} · 正在读取预览…`);setPinterestResolving(true);
  try{const result=await request<PinterestPreview>('/pinterest/resolve',{input:value});if(seq!==pinterestSeq.current)return;setPinterestPreview(result);setPinterestSelected(result.images[0]?.downloadUrl||'');setPinterestStatus(result.images.length>1?`已识别 Pin ${result.pinId} · 请选择 1 张图片`:`已识别 Pin ${result.pinId}`)}catch(error){if(seq===pinterestSeq.current){setPinterestPreview(null);setPinterestStatus((error as Error).message)}}finally{if(seq===pinterestSeq.current)setPinterestResolving(false)}
 }

 async function importPinterest(){
  if(!pinterestPreview||!pinterestInput.trim())return;
  setBusy(true);setProgress('正在下载 Pinterest 最高质量素材图…');setMessage('');setImportedCount(0);
  try{
   const imported=await request<{src:string;name:string;duplicate:boolean;autoSegment:boolean;pinId:string}>('/pinterest/import',{input:pinterestInput,imageUrl:pinterestSelected});
   if(mode==='whole'){
    const result=await request<{assets:Asset[];added:number}>('/import-image',{src:imported.src,name:imported.name});
    onImported(result.assets);setImportedCount(1);
    setMessage(result.added?'已将 Pinterest 整图加入素材库。':'这张整图已在素材库中，可直接使用。');
    return;
   }
   setProgress(imported.duplicate?'已找到现有素材，正在打开处理记录…':imported.autoSegment?'下载完成，正在自动拆分素材…':'下载完成，正在打开手动裁切工作台…');
   const jobs=await request<Job[]>('/jobs');
   const existing=jobs.find(item=>item.source===imported.src);
   const source=await request<Job>('/source',{src:imported.src,name:imported.name});
   let automaticFallback='';
   if(!existing&&imported.autoSegment&&!source.manualOnly){
    try{await request<Job>('/segment',{src:imported.src,name:imported.name,mode:'auto',tolerance:28})}
    catch(error){automaticFallback=`自动识别未完成，原图已保留，可直接自由裁切（${(error as Error).message}）`}
   }
   const summary=automaticFallback?`Pinterest ${automaticFallback}`:imported.duplicate?'这个 Pinterest 素材已经导入过，已打开现有处理记录，可继续处理。':imported.autoSegment&&!source.manualOnly?'Pinterest 原图已保存，并进入自动拆素材流程。':'Pinterest 原图已保存，已打开自由裁切工作台。';
   onReady(summary,source.source);
  }catch(error){setMessage((error as Error).message)}finally{setBusy(false);setProgress('')}
 }

 return <Dialog open={open} onOpenChange={value=>!value&&!busy&&onClose()}><DialogContent className="journal-dialog material-import-dialog">
  <DialogTitle>导入素材</DialogTitle>
  <DialogDescription>图片已经是成品素材时，选择整图入库即可；需要去背景或拆开多件素材时，选择抠图／拆分。</DialogDescription>
  <fieldset className="material-import-modes" disabled={busy}>
   <legend>导入方式</legend>
   <label><input type="radio" name="material-import-mode" value="whole" checked={mode==='whole'} onChange={()=>{setMode('whole');setMessage('');setImportedCount(0)}}/><span><strong>整图入库</strong><small>保留背景和透明区域，一张图片作为一个素材</small></span></label>
   <label><input type="radio" name="material-import-mode" value="segment" checked={mode==='segment'} onChange={()=>{setMode('segment');setMessage('');setImportedCount(0)}}/><span><strong>抠图／拆分</strong><small>进入素材台，去背景、拆分或裁切后再入库</small></span></label>
  </fieldset>
  <section className="material-import-local">
   <ImagePlus/>
   <div><strong>本机图片</strong><small>支持 JPG、PNG、WebP，可一次选择多张，每张不超过 10 MB。</small></div>
   <button className="primary" disabled={busy} onClick={()=>file.current?.click()}>{busy?<Loader2 className="spinning"/>:<ImagePlus/>}{mode==='whole'?'选择图片并入库':'选择图片并拆分'}</button>
  </section>
  <section className="material-import-pinterest" aria-label="Pinterest 素材导入">
   <label htmlFor="pinterest-material-input">Pinterest 链接、Pin ID 或嵌入代码</label>
   <textarea id="pinterest-material-input" placeholder={'粘贴 Pinterest 链接、Pin ID 或嵌入代码\n例如：<iframe src="https://assets.pinterest.com/ext/embed.html?id=…"></iframe>'} value={pinterestInput} disabled={busy} onChange={event=>void recognizePinterest(event.target.value)}/>
   <span className={`pinterest-state ${pinterestPreview?'ready':''}`}>{pinterestResolving?'正在读取…':pinterestStatus}</span>
   <div className="pinterest-preview">{pinterestPreview?<><div className="pinterest-image-choices">{pinterestPreview.images.map(image=><button type="button" key={image.id} className={pinterestSelected===image.downloadUrl?'selected':''} onClick={()=>setPinterestSelected(image.downloadUrl)}><img src={image.previewUrl} alt={`Pinterest 图片 ${image.id}`}/><span>{pinterestSelected===image.downloadUrl?'已选择':'选择这张'}</span></button>)}</div><div><strong>Pin {pinterestPreview.pinId}</strong><small>{pinterestPreview.images.length>1?'这个 Pin 有多张图，请先选择其中 1 张。':mode==='whole'?'已准备好整图入库。':'已准备好进入素材台。'}</small></div></>:<div className="pinterest-placeholder">粘贴后会自动识别 Pin 并显示预览</div>}</div>
   <button className="primary" disabled={busy||pinterestResolving||!pinterestPreview||!pinterestSelected} onClick={()=>void importPinterest()}>{busy?'正在导入…':mode==='whole'?'整图加入素材库':'导入并进入素材台'}</button>
  </section>
  <output className="material-import-status" aria-live="polite">{busy?(progress||'正在导入…'):message}</output>
  {!busy&&mode==='whole'&&importedCount>0&&<button className="primary" onClick={onOpenLibrary}>打开素材库</button>}
  <input hidden ref={file} type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={event=>void upload(event.target.files)}/>
 </DialogContent></Dialog>;
}
