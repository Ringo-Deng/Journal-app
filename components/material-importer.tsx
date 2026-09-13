'use client';
/* oxlint-disable next/no-img-element -- Pinterest previews use URLs resolved by the local material service. */
import {useEffect,useRef,useState} from 'react';
import {ImagePlus,Loader2} from 'lucide-react';
import type {Asset} from '@/lib/journal';
import {normalizePinterestResolvePayload} from '@/lib/pinterest-resolve-compat';
import {preferredPinterestImage,verifyPinterestPreviews,type VerifiedPinterestImage} from '@/lib/pinterest-preview';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';

type Job={source:string;items:{id:string}[];manualOnly?:boolean};
type PinterestPreview={pinId:string;previewUrl:string;originalUrl:string;images:VerifiedPinterestImage[]};

async function request<T>(path:string,data?:unknown,signal?:AbortSignal):Promise<T>{
 const response=await fetch('/api/materials'+path,data===undefined?{signal}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal});
 const result=await response.json() as T&{error?:string};
 if(!response.ok)throw Error(response.status===404&&result.error==='接口不存在。'?'素材服务仍是旧版本，请关闭并重新启动拾光后再导入。':result.error||'素材导入失败');
 return result;
}

function localPinterestInput(value:string){
 const raw=value.trim();
 if(/^\d{6,30}$/.test(raw))return {pinId:raw,short:false};
 const iframe=/<iframe\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/i.exec(raw);
 const candidate=iframe?iframe[1]:raw;
 try{
  const url=new URL(candidate.replace(/&amp;/gi,'&'));
  if(url.protocol!=='https:')return null;
  if(url.hostname==='pin.it'&&url.pathname.split('/').filter(Boolean).length)return {pinId:'',short:true};
  if(url.hostname==='assets.pinterest.com'){
   const pinId=url.searchParams.get('id')||'';
   return /^\d{6,30}$/.test(pinId)?{pinId,short:false}:null;
  }
  const pinterestPage=url.hostname==='pinterest.com'||url.hostname.endsWith('.pinterest.com')||url.hostname==='pinterest.jp'||url.hostname.endsWith('.pinterest.jp');
  if(!pinterestPage)return null;
  const pinId=/\/pin\/(?:[^/]*--)?(\d{6,30})(?:\/|$)/i.exec(url.pathname)?.[1]||'';
  return pinId?{pinId,short:false}:null;
 }catch{return null}
}

export default function MaterialImporter({open,onClose,onReady,onImported,onOpenLibrary}:{open:boolean;onClose:()=>void;onReady:(message:string,targetSource:string)=>void;onImported:(assets:Asset[])=>void;onOpenLibrary:()=>void}){
 const [mode,setMode]=useState<'whole'|'segment'>('whole'),[importedCount,setImportedCount]=useState(0);
 const file=useRef<HTMLInputElement>(null),pinterestSeq=useRef(0),pinterestController=useRef<AbortController|null>(null);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[progress,setProgress]=useState('');
 const [pinterestInput,setPinterestInput]=useState(''),[pinterestPreview,setPinterestPreview]=useState<PinterestPreview|null>(null),[pinterestSelected,setPinterestSelected]=useState(''),[pinterestStatus,setPinterestStatus]=useState('等待粘贴'),[pinterestResolving,setPinterestResolving]=useState(false);
 const selectedPinterestImage=pinterestPreview?.images.find(image=>image.downloadUrl===pinterestSelected);
 useEffect(()=>{
  if(!open&&pinterestController.current){pinterestController.current.abort();pinterestController.current=null;pinterestSeq.current++;setPinterestResolving(false);setPinterestStatus('读取已停止，重新粘贴链接即可重试。')}
 },[open]);
 useEffect(()=>()=>pinterestController.current?.abort(),[]);

 async function upload(files:FileList|null){
  if(!files?.length)return;
  setBusy(true);setMessage('');setImportedCount(0);
  const list=Array.from(files);let completed=0,total=0,opened=0,targetSource='';const errors:string[]=[],fallbacks:string[]=[];
  try{
   for(const item of list){
    setProgress(`正在处理 ${completed+1} / ${list.length}：${item.name}`);
    try{
     const type=item.type.toLowerCase(),heic=/\.(?:heic|heif)$/i.test(item.name);
     if((!['image/png','image/jpeg','image/webp','image/heic','image/heif'].includes(type)&&!((!type||type==='application/octet-stream')&&heic))||item.size>10*1024*1024)throw Error('请选择 10 MB 以内的 JPG、PNG、WebP 或 HEIC');
     const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>typeof reader.result==='string'?resolve(reader.result):reject(Error('图片读取失败'));reader.onerror=()=>reject(Error('图片读取失败'));reader.readAsDataURL(item)});
     const response=await fetch('/api/upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data,name:item.name})});
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
       catch(error){fallbacks.push(`${item.name}：自动识别未完成，原图已保留，可框选补漏；如需自由裁切，请点“导入新素材”并选择“整图入库”，放入手帐后从选中工具栏打开（${(error as Error).message}）`)}
      }
     }
    }catch(error){errors.push(`${item.name}：${(error as Error).message}`)}
    completed++;
   }
   const details=[...fallbacks,...errors].join('；');
   const summary=mode==='whole'?`已将 ${total} 张整图加入素材库。${details}`:`已打开 ${opened} 张图片${total?`，自动拆出 ${total} 个素材`:'，可继续点选或框选补漏'}。${details}`;
   if(mode==='segment'&&opened&&targetSource)onReady(summary,targetSource);else setMessage(summary);
  }finally{setBusy(false);setProgress('');if(file.current)file.current.value=''}
 }

 async function recognizePinterest(value:string){
  pinterestController.current?.abort();pinterestController.current=null;
  setPinterestInput(value);setPinterestSelected('');setMessage('');setImportedCount(0);const seq=++pinterestSeq.current;const recognized=localPinterestInput(value);
  if(!value.trim()){setPinterestPreview(null);setPinterestStatus('等待粘贴');setPinterestResolving(false);return}
  if(!recognized){setPinterestPreview(null);setPinterestStatus('未识别到 Pinterest Pin 网页或分享链接');setPinterestResolving(false);return}
  setPinterestPreview(null);setPinterestStatus(recognized.short?'已识别 Pinterest 分享链接 · 正在打开网页…':`已识别 Pin ${recognized.pinId} · 正在读取预览…`);setPinterestResolving(true);
  const controller=new AbortController();pinterestController.current=controller;
  try{
   const payload=await request<PinterestPreview>('/pinterest/resolve',{input:value},controller.signal);if(seq!==pinterestSeq.current)return;
   const normalized=normalizePinterestResolvePayload(payload);
   if(!normalized?.images.length)throw Error('没有读取到可用图片，请重新粘贴链接。');
   setPinterestStatus(`已识别 Pin ${payload.pinId} · 正在检查图片是否可用及分辨率…`);
   const images=await verifyPinterestPreviews(normalized.images,{signal:controller.signal});if(seq!==pinterestSeq.current)return;
   const preferred=preferredPinterestImage(images);
   setPinterestPreview({...payload,images});setPinterestSelected(preferred?.downloadUrl||'');
   setPinterestStatus(preferred?'已选中可用图片中分辨率最高的一张，可直接换选。':'图片暂时无法加载，请重新粘贴链接重试。');
  }catch(error){if(seq===pinterestSeq.current&&!controller.signal.aborted){setPinterestPreview(null);setPinterestStatus((error as Error).message)}}finally{if(seq===pinterestSeq.current){pinterestController.current=null;setPinterestResolving(false)}}
 }

 async function importPinterest(){
  if(busy||pinterestResolving||!selectedPinterestImage?.available||!pinterestInput.trim())return;
  setBusy(true);setProgress('正在下载 Pinterest 最高质量素材图…');setMessage('');setImportedCount(0);
  try{
   const imported=await request<{src:string;name:string;duplicate:boolean;autoSegment:boolean;pinId:string}>('/pinterest/import',{input:pinterestInput,imageUrl:pinterestSelected});
   if(mode==='whole'){
    const result=await request<{assets:Asset[];added:number}>('/import-image',{src:imported.src,name:imported.name});
    onImported(result.assets);setImportedCount(1);
    setMessage(result.added?'已将 Pinterest 整图加入素材库。':'这张整图已在素材库中，可直接使用。');
    return;
   }
   setProgress(imported.duplicate?'已找到现有素材，正在打开处理记录…':imported.autoSegment?'下载完成，正在自动拆分素材…':'下载完成，正在打开素材处理台…');
   const jobs=await request<Job[]>('/jobs');
   const existing=jobs.find(item=>item.source===imported.src);
   const source=await request<Job>('/source',{src:imported.src,name:imported.name});
   let automaticFallback='';
   if(!existing&&imported.autoSegment&&!source.manualOnly){
    try{await request<Job>('/segment',{src:imported.src,name:imported.name,mode:'auto',tolerance:28})}
    catch(error){automaticFallback=`自动识别未完成，原图已保留，可框选补漏；如需自由裁切，请点“导入新素材”并选择“整图入库”，放入手帐后从选中工具栏打开（${(error as Error).message}）`}
   }
   const summary=automaticFallback?`Pinterest ${automaticFallback}`:imported.duplicate?'这个 Pinterest 素材已经导入过，已打开现有处理记录，可继续处理。':imported.autoSegment&&!source.manualOnly?'Pinterest 原图已保存，并进入自动拆素材流程。':'Pinterest 原图已保存，已打开素材处理台，可继续框选保留。';
   onReady(summary,source.source);
  }catch(error){setMessage((error as Error).message)}finally{setBusy(false);setProgress('')}
 }

 return <Dialog open={open} onOpenChange={value=>!value&&!busy&&onClose()}><DialogContent className="journal-dialog material-import-dialog">
  <DialogTitle>导入素材</DialogTitle>
  <DialogDescription>图片已经是成品素材时，选择整图入库即可；需要去背景或拆开多件素材时，选择抠图／拆分。</DialogDescription>
  <fieldset className="material-import-modes" disabled={busy}>
   <legend>导入方式</legend>
   <label><input type="radio" name="material-import-mode" value="whole" checked={mode==='whole'} onChange={()=>{setMode('whole');setMessage('');setImportedCount(0)}}/><span><strong>整图入库</strong><small>保留背景和透明区域，一张图片作为一个素材</small></span></label>
   <label><input type="radio" name="material-import-mode" value="segment" checked={mode==='segment'} onChange={()=>{setMode('segment');setMessage('');setImportedCount(0)}}/><span><strong>抠图／拆分</strong><small>进入素材台，去背景、自动拆分或框选后再入库</small></span></label>
  </fieldset>
  <section className="material-import-local">
   <ImagePlus/>
   <div><strong>本机图片</strong><small>支持 JPG、PNG、WebP、HEIC，可一次选择多张，每张不超过 10 MB。</small></div>
   <button className="primary" disabled={busy} onClick={()=>file.current?.click()}>{busy?<Loader2 className="spinning"/>:<ImagePlus/>}{mode==='whole'?'选择图片并入库':'选择图片并拆分'}</button>
  </section>
  <section className="material-import-pinterest" aria-label="Pinterest 素材导入">
   <label htmlFor="pinterest-material-input">Pinterest 网页／分享链接、Pin ID 或嵌入代码</label>
   <textarea id="pinterest-material-input" placeholder={'直接粘贴 Pinterest 网页或 pin.it 分享链接\n也支持 Pin ID 和嵌入代码'} value={pinterestInput} disabled={busy} onChange={event=>void recognizePinterest(event.target.value)}/>
   <span className={`pinterest-state ${selectedPinterestImage?'ready':''}`} aria-live="polite">{pinterestStatus}</span>
   <div className="pinterest-preview">{pinterestPreview?<>
    {selectedPinterestImage&&<><img className="pinterest-selected-image" src={selectedPinterestImage.previewUrl} alt="当前选中的 Pinterest 图片，完整预览" draggable={false}/>
    <div className="pinterest-preview-caption"><strong>已选图片</strong><small>{selectedPinterestImage.width} × {selectedPinterestImage.height} · 完整显示，导入时优先使用高清原图。</small></div></>}
    {(pinterestPreview.images.length>1||!selectedPinterestImage)&&<div className="pinterest-alternatives">
     <p>候选图片 · 点击即可换选</p>
     <div className="pinterest-image-choices" aria-label="Pinterest 候选图片">{pinterestPreview.images.map((image,index)=><button type="button" key={image.id} disabled={busy||!image.available} aria-pressed={pinterestSelected===image.downloadUrl} aria-label={`选择图片 ${index+1}`} className={pinterestSelected===image.downloadUrl?'selected':''} onClick={()=>{setPinterestSelected(image.downloadUrl);setPinterestStatus('已手动选择图片，导入时优先下载高清原图')}}>{image.available?<img src={image.previewUrl} alt={`Pinterest 图片 ${index+1}`} draggable={false}/>:<span className="pinterest-image-unavailable">无法加载</span>}<span>{pinterestSelected===image.downloadUrl?'已选择':`图片 ${index+1}`}</span><small>{image.available?`${image.width} × ${image.height}`:'已跳过'}</small></button>)}</div>
    </div>}
   </>:<div className="pinterest-placeholder">粘贴后会自动选图并显示完整预览</div>}</div>
   <button className="primary" disabled={busy||pinterestResolving||!pinterestPreview||!pinterestSelected} onClick={()=>void importPinterest()}>{busy?'正在导入…':mode==='whole'?'整图加入素材库':'导入并进入素材台'}</button>
  </section>
  <output className="material-import-status" aria-live="polite">{busy?(progress||'正在导入…'):message}</output>
  {!busy&&mode==='whole'&&importedCount>0&&<button className="primary" onClick={onOpenLibrary}>打开素材库</button>}
  <input hidden ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif" multiple onChange={event=>void upload(event.target.files)}/>
 </DialogContent></Dialog>;
}
