'use client';
/* oxlint-disable next/no-img-element -- Pinterest previews use URLs resolved by the local material service. */
import {useRef,useState} from 'react';
import {ImagePlus,Loader2} from 'lucide-react';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';

type Job={items:{id:string}[]};
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

export default function MaterialImporter({open,onClose,onReady}:{open:boolean;onClose:()=>void;onReady:(message:string)=>void}){
 const file=useRef<HTMLInputElement>(null),pinterestSeq=useRef(0);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[progress,setProgress]=useState('');
 const [pinterestInput,setPinterestInput]=useState(''),[pinterestPreview,setPinterestPreview]=useState<PinterestPreview|null>(null),[pinterestSelected,setPinterestSelected]=useState(''),[pinterestStatus,setPinterestStatus]=useState('等待粘贴'),[pinterestResolving,setPinterestResolving]=useState(false);

 async function upload(files:FileList|null){
  if(!files?.length)return;
  setBusy(true);setMessage('');
  const list=Array.from(files);let completed=0,total=0;const errors:string[]=[];
  try{
   for(const item of list){
    setProgress(`正在处理 ${completed+1} / ${list.length}：${item.name}`);
    try{
     if(!['image/png','image/jpeg','image/webp'].includes(item.type)||item.size>10*1024*1024)throw Error('请选择 10 MB 以内的 JPG、PNG 或 WebP');
     const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>typeof reader.result==='string'?resolve(reader.result):reject(Error('图片读取失败'));reader.onerror=()=>reject(Error('图片读取失败'));reader.readAsDataURL(item)});
     const response=await fetch('/api/upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data})});
     const uploaded=await response.json() as {src?:string;error?:string};
     if(!response.ok||!uploaded.src)throw Error(uploaded.error||'上传失败');
     const job=await request<Job>('/segment',{src:uploaded.src,name:item.name,mode:'auto',tolerance:28});
     total+=job.items.length;
    }catch(error){errors.push(`${item.name}：${(error as Error).message}`)}
    completed++;
   }
   const summary=`已处理 ${completed-errors.length} 张图片，拆出 ${total} 个素材。${errors.join('；')}`;
   if(completed>errors.length)onReady(summary);else setMessage(summary);
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
  setBusy(true);setProgress('正在下载 Pinterest 最高质量素材图…');setMessage('');
  try{
   const imported=await request<{src:string;name:string;duplicate:boolean;autoSegment:boolean;pinId:string}>('/pinterest/import',{input:pinterestInput,imageUrl:pinterestSelected});
   setProgress(imported.duplicate?'已找到现有素材，正在打开处理记录…':imported.autoSegment?'下载完成，正在自动拆分素材…':'下载完成，正在打开手动裁切工作台…');
   const jobs=await request<Array<Job&{source:string}>>('/jobs');
   const existing=jobs.find(item=>item.source===imported.src);
   if(!existing){
    if(imported.autoSegment)await request<Job&{source:string}>('/segment',{src:imported.src,name:imported.name,mode:'auto',tolerance:28});
    else await request<Job&{source:string}>('/source',{src:imported.src,name:imported.name});
   }
   const summary=imported.duplicate?'这个 Pinterest 素材已经导入过，已打开现有处理记录，可继续处理。':imported.autoSegment?'Pinterest 原图已保存，并进入自动拆素材流程。':'Pinterest 原图已保存。当前系统使用手动框选裁切，不会调用 Mac 自动拆图。';
   onReady(summary);
  }catch(error){setMessage((error as Error).message)}finally{setBusy(false);setProgress('')}
 }

 return <Dialog open={open} onOpenChange={value=>!value&&!busy&&onClose()}><DialogContent className="journal-dialog material-import-dialog">
  <DialogTitle>导入素材</DialogTitle>
  <DialogDescription>从本机图片或 Pinterest 获取原图。导入后会进入素材台继续拆分、裁切和入库。</DialogDescription>
  <section className="material-import-local">
   <ImagePlus/>
   <div><strong>本机图片</strong><small>支持 JPG、PNG、WebP，可一次选择多张，每张不超过 10 MB。</small></div>
   <button className="primary" disabled={busy} onClick={()=>file.current?.click()}>{busy?<Loader2 className="spinning"/>:<ImagePlus/>}选择图片</button>
  </section>
  <section className="material-import-pinterest" aria-label="Pinterest 素材导入">
   <label htmlFor="pinterest-material-input">Pinterest 链接、Pin ID 或嵌入代码</label>
   <textarea id="pinterest-material-input" placeholder={'粘贴 Pinterest 链接、Pin ID 或嵌入代码\n例如：<iframe src="https://assets.pinterest.com/ext/embed.html?id=…"></iframe>'} value={pinterestInput} disabled={busy} onChange={event=>void recognizePinterest(event.target.value)}/>
   <span className={`pinterest-state ${pinterestPreview?'ready':''}`}>{pinterestResolving?'正在读取…':pinterestStatus}</span>
   <div className="pinterest-preview">{pinterestPreview?<><div className="pinterest-image-choices">{pinterestPreview.images.map(image=><button type="button" key={image.id} className={pinterestSelected===image.downloadUrl?'selected':''} onClick={()=>setPinterestSelected(image.downloadUrl)}><img src={image.previewUrl} alt={`Pinterest 图片 ${image.id}`}/><span>{pinterestSelected===image.downloadUrl?'已选择':'选择这张'}</span></button>)}</div><div><strong>Pin {pinterestPreview.pinId}</strong><small>{pinterestPreview.images.length>1?'这个 Pin 有多张图，请先选择其中 1 张。':'已准备好进入素材台。'}</small></div></>:<div className="pinterest-placeholder">粘贴后会自动识别 Pin 并显示预览</div>}</div>
   <button className="primary" disabled={busy||pinterestResolving||!pinterestPreview||!pinterestSelected} onClick={()=>void importPinterest()}>{busy?'正在导入…':'导入并进入素材台'}</button>
  </section>
  <output className="material-import-status" aria-live="polite">{busy?(progress||'正在导入…'):message}</output>
  <input hidden ref={file} type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={event=>void upload(event.target.files)}/>
 </DialogContent></Dialog>;
}
