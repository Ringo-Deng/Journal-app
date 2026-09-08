'use client';
/* oxlint-disable next/no-img-element -- Local editable image previews use original files. */
import {useEffect,useRef,useState} from 'react';
import type {PointerEvent as ReactPointerEvent} from 'react';
import {ImagePlus,Loader2,Scissors,Check,Plus,CheckCheck,RotateCcw,Trash2} from 'lucide-react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Checkbox} from '@/components/ui/checkbox';
import type {Asset} from '@/lib/journal';
import {acceptDenseRefinement,hasThinBridge} from '@/lib/material-segmentation-refine.mjs';

type Item={id:string;src:string;name:string;width:number;height:number;imported:boolean;manual?:boolean;bounds?:number[]};
type SourceMeta={type:'pinterest';pinId:string;originalUrl:string;imageUrl:string;sha256:string};
type Job={id:string;source:string;name:string;createdAt:string;engine:string;mode?:string;strategy?:string;attempt?:number;tolerance?:number;manualOnly?:boolean;sourceMeta?:SourceMeta;items:Item[]};

async function request<T>(path:string,data?:unknown):Promise<T>{
 const r=await fetch('/api/materials'+path,data===undefined?undefined:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
 const result=await r.json() as T & {error?:string};
 if(!r.ok)throw Error(result.error||'素材处理失败');
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
 }catch{return '';}
}

export default function MaterialStudio({open,onClose,onImported}:{open:boolean;onClose:()=>void;onImported:(a:Asset[])=>void}){
 const [jobs,setJobs]=useState<Job[]>([]),[active,setActive]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[mode,setMode]=useState('auto'),[strength,setStrength]=useState(28),[selected,setSelected]=useState<string[]>([]),[names,setNames]=useState<Record<string,string>>({}),[zoom,setZoom]=useState(100),[dimensions,setDimensions]=useState({w:1,h:1}),[imageReady,setImageReady]=useState(false),[viewport,setViewport]=useState({w:400,h:500}),[crop,setCrop]=useState<number[]|null>(null),[cropping,setCropping]=useState(false),[progress,setProgress]=useState(''),[pinterestOpen,setPinterestOpen]=useState(false),[pinterestInput,setPinterestInput]=useState(''),[pinterestPreview,setPinterestPreview]=useState<{pinId:string;previewUrl:string;originalUrl:string;images:{id:string;previewUrl:string;downloadUrl:string}[]}|null>(null),[pinterestSelected,setPinterestSelected]=useState(''),[pinterestStatus,setPinterestStatus]=useState('等待粘贴'),[pinterestResolving,setPinterestResolving]=useState(false);
 const file=useRef<HTMLInputElement>(null),imageArea=useRef<HTMLDivElement>(null),imageViewport=useRef<HTMLDivElement>(null),pan=useRef<{x:number;y:number;left:number;top:number}|null>(null),start=useRef<number[]|null>(null),pinterestSeq=useRef(0);
 const job=jobs.find(j=>j.id===active);

 function choose(j:Job){
  setActive(j.id);setSelected(j.items.filter(i=>!i.imported).map(i=>i.id));setNames(Object.fromEntries(j.items.map(i=>[i.id,i.name])));setCrop(null);setCropping(false);setZoom(100);setMode(j.mode||'auto');setStrength(Number(j.tolerance||28));setMessage('');setImageReady(false);setDimensions({w:1,h:1});
 }
 useEffect(()=>{
  if(!open)return;
  let cancelled=false;
  setMessage('');
  request<Job[]>('/jobs').then(list=>{
   if(cancelled)return;
   setJobs(list);
   // /source is created before this dialog opens when the user chooses “再次编辑”.
   // Always select the newest job so a stale active id cannot make two sources fight on screen.
   if(list[0])choose(list[0]);
  }).catch(e=>{if(!cancelled)setMessage(e.message)});
  return()=>{cancelled=true};
 },[open]);
 useEffect(()=>{
  const el=imageViewport.current;if(!open||!el)return;
  let frame=0;
  const measure=()=>{
   const next={w:Math.max(1,el.clientWidth-20),h:Math.max(1,el.clientHeight-20)};
   setViewport(old=>old.w===next.w&&old.h===next.h?old:next);
  };
  const observer=new ResizeObserver(()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(measure)});
  measure();observer.observe(el);
  return()=>{cancelAnimationFrame(frame);observer.disconnect()};
 },[open,job?.source]);
 const fit=imageReady?Math.min(viewport.w/dimensions.w,viewport.h/dimensions.h,1):1;

 async function itemLooksJoined(item:Item){
  if(item.imported||item.manual||Math.min(item.width,item.height)<48||Math.max(item.width,item.height)/Math.max(1,Math.min(item.width,item.height))>4.5)return false;
  const image=new Image();image.src=item.src;await image.decode();
  const scale=Math.min(1,420/Math.max(image.naturalWidth,image.naturalHeight));
  const width=Math.max(1,Math.round(image.naturalWidth*scale)),height=Math.max(1,Math.round(image.naturalHeight*scale));
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)return false;
  context.drawImage(image,0,0,width,height);const rgba=context.getImageData(0,0,width,height).data;const alpha=new Uint8Array(width*height);
  for(let i=0;i<alpha.length;i++)alpha[i]=rgba[i*4+3];
  return hasThinBridge(alpha,width,height);
 }
 async function needsDenseRefinement(candidate:Job){
  const fresh=candidate.items.filter(item=>!item.imported&&!item.manual);
  if(!fresh.length||fresh.length>30||/保留纸底/.test(candidate.engine))return false;
  for(const item of fresh)try{if(await itemLooksJoined(item))return true}catch{/* A preview decode failure must never block the usable first-pass result. */}
  return false;
 }
 async function processImage(src:string,name:string,rect?:number[],overrideMode?:string,adaptive=false){
  const requestedMode=overrideMode||mode;const existing=jobs.some(j=>j.source===src);
  let next=await request<Job>('/segment',{src,name,mode:requestedMode,tolerance:strength,...(rect?{rect}:{}),...(adaptive?{continue:true}:{})});
  if(!rect&&!adaptive&&!existing&&requestedMode==='auto'&&await needsDenseRefinement(next)){
   setProgress('检测到多个素材粘连，正在自动二次细分…');
   try{
    const refined=await request<Job>('/segment',{src,name,mode:'dense',tolerance:strength});
    if(acceptDenseRefinement(next.items,refined.items))next=refined;
    else next=await request<Job>('/segment',{src,name,mode:requestedMode,tolerance:strength});
   }catch{
    // The first pass was already usable. Restore it if the optional refinement fails.
    next=await request<Job>('/segment',{src,name,mode:requestedMode,tolerance:strength});
   }
  }
  setJobs(old=>[next,...old.filter(j=>j.source!==next.source)]);
  if(rect){setSelected(next.items.filter(i=>!job?.items.some(old=>old.id===i.id)).map(i=>i.id));setNames(Object.fromEntries(next.items.map(i=>[i.id,i.name])));setCrop(null)}else choose(next);
  return next;
 }
 async function recognizePinterest(value:string){
  setPinterestInput(value);const seq=++pinterestSeq.current;const pinId=localPinterestPinId(value);
  if(!value.trim()){setPinterestPreview(null);setPinterestStatus('等待粘贴');setPinterestResolving(false);return}
  if(!pinId){setPinterestPreview(null);setPinterestStatus('未识别到 Pinterest Pin');setPinterestResolving(false);return}
  setPinterestPreview(null);setPinterestStatus(`已识别 Pin ${pinId} · 正在读取预览…`);setPinterestResolving(true);
  try{const result=await request<{pinId:string;previewUrl:string;originalUrl:string;images:{id:string;previewUrl:string;downloadUrl:string}[]}>('/pinterest/resolve',{input:value});if(seq!==pinterestSeq.current)return;setPinterestPreview(result);setPinterestSelected(result.images[0]?.downloadUrl||'');setPinterestStatus(result.images.length>1?`已识别 Pin ${result.pinId} · 请选择 1 张图片`:`已识别 Pin ${result.pinId}`)}catch(e){if(seq===pinterestSeq.current){setPinterestPreview(null);setPinterestStatus((e as Error).message)}}finally{if(seq===pinterestSeq.current)setPinterestResolving(false)}
 }
 async function importPinterest(){
  if(!pinterestPreview||!pinterestInput.trim())return;setBusy(true);setProgress('正在下载 Pinterest 最高质量素材图…');setMessage('');
  try{
   const imported=await request<{src:string;name:string;duplicate:boolean;autoSegment:boolean;pinId:string}>('/pinterest/import',{input:pinterestInput,imageUrl:pinterestSelected});
   setProgress(imported.duplicate?'已找到现有素材，正在打开处理记录…':imported.autoSegment?'下载完成，正在自动拆分素材…':'下载完成，正在打开手动裁切工作台…');
   let next=(await request<Job[]>('/jobs')).find(item=>item.source===imported.src);
   if(!next)next=imported.autoSegment?await processImage(imported.src,imported.name):await request<Job>('/source',{src:imported.src,name:imported.name});
   setJobs(old=>[next!,...old.filter(item=>item.source!==next!.source)]);choose(next);setPinterestOpen(false);setPinterestStatus(`已识别 Pin ${imported.pinId}`);setMessage(imported.duplicate?'这个 Pinterest 素材已经导入过，已打开现有处理记录，可继续处理。':imported.autoSegment?'Pinterest 原图已保存，并进入自动拆素材流程。':'Pinterest 原图已保存。当前系统使用手动框选裁切，不会调用 Mac 自动拆图。');
  }catch(e){setMessage((e as Error).message)}finally{setBusy(false);setProgress('')}
 }
 async function browserCrop(rect?:number[]){
  if(!job||!rect)return;setBusy(true);setProgress('正在裁出框选区域…');
  try{
   const image=new Image();image.src=job.source;await image.decode();
   const sx=Math.max(0,Math.floor(rect[0]*image.naturalWidth)),sy=Math.max(0,Math.floor(rect[1]*image.naturalHeight)),sw=Math.max(1,Math.min(image.naturalWidth-sx,Math.round(rect[2]*image.naturalWidth))),sh=Math.max(1,Math.min(image.naturalHeight-sy,Math.round(rect[3]*image.naturalHeight)));
   const canvas=document.createElement('canvas');canvas.width=sw;canvas.height=sh;const context=canvas.getContext('2d');if(!context)throw Error('浏览器无法裁切图片。');context.drawImage(image,sx,sy,sw,sh,0,0,sw,sh);
   const response=await fetch('/api/upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:canvas.toDataURL('image/png')})});const uploaded=await response.json() as {src:string;error?:string};if(!response.ok)throw Error(uploaded.error||'裁切图片保存失败');
   const next=await request<Job>('/add-item',{jobId:job.id,src:uploaded.src,width:sw,height:sh});setJobs(old=>old.map(item=>item.id===next.id?next:item));choose(next);setMessage('已保留框选区域，可继续框选其他素材或直接加入素材库。');
  }catch(e){setMessage((e as Error).message)}finally{setBusy(false);setProgress('')}
 }
 async function upload(files:FileList|null){
  if(!files?.length)return;setBusy(true);setMessage('');const list=Array.from(files);let completed=0,total=0;const errors:string[]=[];
  try{for(const f of list){setProgress(`正在处理 ${completed+1} / ${list.length}：${f.name}`);try{if(!['image/png','image/jpeg','image/webp'].includes(f.type)||f.size>10*1024*1024)throw Error('请选择 10 MB 以内的 JPG、PNG 或 WebP');const data=await new Promise<string>((ok,fail)=>{const reader=new FileReader();reader.onload=()=>typeof reader.result==='string'?ok(reader.result):fail(Error('图片读取失败'));reader.onerror=()=>fail(Error('图片读取失败'));reader.readAsDataURL(f)});const res=await fetch('/api/upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data})});const uploaded=await res.json() as {src:string;error?:string};if(!res.ok)throw Error(uploaded.error||'上传失败');const next=await processImage(uploaded.src,f.name);total+=next.items.length}catch(e){errors.push(`${f.name}：${(e as Error).message}`)}completed++}setMessage(`已处理 ${completed-errors.length} 张图片，拆出 ${total} 个素材。${errors.join('；')}`)}finally{setBusy(false);setProgress('');if(file.current)file.current.value=''}
 }
 async function rerun(rect?:number[],overrideMode?:string,adaptive=false){
  if(!job)return;if(job.manualOnly&&overrideMode==='crop')return void browserCrop(rect);if(job.manualOnly&&overrideMode==='single'){setMessage('当前系统暂不支持自动去底；可使用“保留原底裁出”。');return}
  setBusy(true);setProgress(rect?'正在分离框选区域…':adaptive?'正在换一种策略继续识别…':'正在重新识别整张素材…');
  try{const next=await processImage(job.source,job.name,rect,overrideMode,adaptive);setMessage(next.items.length?(adaptive?`第 ${next.attempt||2} 次识别已换用「${next.engine}」。${(next.attempt||2)>=3?'如果仍不理想，建议直接框选，避免继续增加处理复杂度。':'选择满意的结果加入素材库。'}`:`拆出了 ${next.items.length} 个素材，选择满意的结果加入素材库。`):'没有识别到独立素材，请调低去底强度或改用其他识别模式。')}catch(e){setMessage((e as Error).message)}finally{setBusy(false);setProgress('')}
 }
 async function deleteCurrentJob(){
  if(!job||busy||!window.confirm(`删除「${job.name}」的处理记录？已加入素材库的素材不会删除。`))return;setBusy(true);setProgress('正在删除处理记录…');
  try{const result=await request<{ok:boolean;imported:number}>('/delete',{jobId:job.id});const remaining=jobs.filter(j=>j.id!==job.id);setJobs(remaining);if(remaining[0])choose(remaining[0]);else{setActive('');setSelected([]);setNames({});setCrop(null);setCropping(false);setImageReady(false)}setMessage(result.imported?`已删除处理记录；${result.imported} 个已入库素材继续保留。`:'已删除这条处理记录。')}catch(e){setMessage((e as Error).message)}finally{setBusy(false);setProgress('')}
 }
 async function importItems(){
  if(!job||!selected.length)return;setBusy(true);
  try{const result=await request<{added:number;assets:Asset[];job:Job}>('/import',{jobId:job.id,itemIds:selected,names});onImported(result.assets);setJobs(old=>old.map(j=>j.id===job.id?result.job:j));setSelected([]);setMessage(`已将 ${result.added} 个独立素材加入素材库，之后排版时也可以使用。`)}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}
 }
 function position(e:ReactPointerEvent){const r=imageArea.current!.getBoundingClientRect();return[Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))]}

 return <Dialog open={open} onOpenChange={v=>!v&&!busy&&onClose()}><DialogContent className="material-studio">
  <DialogDescription className="studio-accessible-description">导入原图，按纸底或纹样分区拆分；支持缩放、拖动与手动框选。</DialogDescription>
  <div className="studio-topline">
   <DialogTitle>素材工作台</DialogTitle>
   <button className="primary" disabled={busy} onClick={()=>file.current?.click()}><ImagePlus/>导入图片</button>
   <button className={`outline pinterest-toggle ${pinterestOpen?'active':''}`} disabled={busy} onClick={()=>setPinterestOpen(v=>!v)}>Pinterest 导入</button>
   <select aria-label="识别模式" value={mode} disabled={busy||!!job?.manualOnly} onChange={e=>setMode(e.target.value)}><option value="auto">自动分离</option><option value="panels">底色 / 纹样分区</option><option value="paper">带色纸底分离</option><option value="dense">密集贴纸细分</option><option value="ai">本机 AI 主体识别</option></select>
   <label className="studio-strength">去底 {strength}<input type="range" aria-label="去底强度" min={5} max={100} value={strength} disabled={busy||!!job?.manualOnly} onChange={e=>setStrength(Number(e.target.value))}/></label>
   <button className="outline" disabled={busy||!job||!!job.manualOnly} onClick={()=>void rerun(undefined,undefined,true)}><RotateCcw/>继续识别</button>
   <button className="outline danger" disabled={busy||!job} onClick={()=>void deleteCurrentJob()}><Trash2/>删除记录</button>
   <button className={`outline ${cropping?'crop-active':''}`} disabled={busy||!job} onClick={()=>{setCropping(!cropping);setCrop(null)}}><Scissors/>{cropping?'退出框选':'框选单个素材'}</button>
   {cropping&&<><button className="primary" disabled={busy||!crop||crop[2]<.01||crop[3]<.01} onClick={()=>void rerun(crop!,'crop')}>保留原底裁出</button><button className="outline" disabled={busy||!crop||crop[2]<.01||crop[3]<.01||!!job?.manualOnly} onClick={()=>void rerun(crop!,'single')}>{job?.manualOnly?'去底裁出（Mac 自动拆图）':'去底裁出'}</button></>}
  </div>
  {pinterestOpen&&<section className="pinterest-import-panel" aria-label="Pinterest 素材导入"><div className="pinterest-input-wrap"><textarea aria-label="Pinterest 链接、Pin ID 或嵌入代码" placeholder={'粘贴 Pinterest 链接、Pin ID 或嵌入代码\n例如：<iframe src="https://assets.pinterest.com/ext/embed.html?id=…"></iframe>'} value={pinterestInput} disabled={busy} onChange={e=>void recognizePinterest(e.target.value)}/><span className={`pinterest-state ${pinterestPreview?'ready':''}`}>{pinterestResolving?'正在读取…':pinterestStatus}</span></div><div className="pinterest-preview">{pinterestPreview?<><div className="pinterest-image-choices">{pinterestPreview.images.map(image=><button type="button" key={image.id} className={pinterestSelected===image.downloadUrl?'selected':''} onClick={()=>setPinterestSelected(image.downloadUrl)}><img src={image.previewUrl} alt={`Pinterest 图片 ${image.id}`}/><span>{pinterestSelected===image.downloadUrl?'已选择':'选择这张'}</span></button>)}</div><div><strong>Pin {pinterestPreview.pinId}</strong><small>{pinterestPreview.images.length>1?'这个 Pin 有多张图，请先选择其中 1 张。':'已准备好进入素材处理台。'}</small></div></>:<div className="pinterest-placeholder">粘贴后会自动识别 Pin 并显示预览</div>}</div><button className="primary" disabled={busy||pinterestResolving||!pinterestPreview||!pinterestSelected} onClick={()=>void importPinterest()}>{busy?'正在导入…':'进入处理台'}</button></section>}
  <div className="studio-body">
   <aside className="studio-history"><h3>导入记录</h3>{jobs.map(j=><button key={j.id} disabled={busy} className={active===j.id?'active':''} onClick={()=>choose(j)}><img src={j.source} alt="导入原图缩略图"/><span>{j.name}<small>{j.items.length} 个结果 · {j.engine}{j.attempt&&j.attempt>1?` · 已识别 ${j.attempt} 次`:''}</small></span></button>)}{!jobs.length&&<p>导入的原图和切分结果<br/>会保存在这里。</p>}</aside>
   <main className="studio-main">{job?<div className="studio-columns">
    <section className="studio-original"><div className="studio-source-tools"><h3>原图</h3><button className="quiet" aria-label="缩小原图" onClick={()=>setZoom(v=>Math.max(50,v-25))}>−</button><span>{zoom}%</span><button className="quiet" aria-label="放大原图" onClick={()=>setZoom(v=>Math.min(500,v+25))}>＋</button><button className="quiet" onClick={()=>setZoom(100)}>适合窗口</button><small>{cropping?'拖动框选 · 可滚动查看':'拖动平移 · 可滚动查看'}</small></div>
     <div className="studio-image-viewport" ref={imageViewport} onPointerDown={e=>{if(cropping||busy||e.button!==0)return;const el=e.currentTarget;pan.current={x:e.clientX,y:e.clientY,left:el.scrollLeft,top:el.scrollTop};el.setPointerCapture(e.pointerId)}} onPointerMove={e=>{const d=pan.current;if(d){e.currentTarget.scrollLeft=d.left-e.clientX+d.x;e.currentTarget.scrollTop=d.top-e.clientY+d.y}}} onPointerUp={()=>{pan.current=null}} onPointerCancel={()=>{pan.current=null}}>
      <div ref={imageArea} className={`studio-source ${cropping?'cropping':''} ${imageReady?'ready':'loading'}`} style={imageReady?{width:Math.max(1,dimensions.w*fit*zoom/100),height:Math.max(1,dimensions.h*fit*zoom/100)}:undefined} role="application" aria-label="原图框选区域，请拖动框选素材" onPointerDown={e=>{if(!cropping||busy)return;e.stopPropagation();start.current=position(e);setCrop(null);e.currentTarget.setPointerCapture(e.pointerId)}} onPointerMove={e=>{if(!start.current)return;const p=position(e);setCrop([Math.min(start.current[0],p[0]),Math.min(start.current[1],p[1]),Math.abs(p[0]-start.current[0]),Math.abs(p[1]-start.current[1])])}} onPointerUp={()=>{start.current=null}} onPointerCancel={()=>{start.current=null}}>
       <img src={job.source} alt="素材原图" draggable={false} onLoad={e=>{const next={w:e.currentTarget.naturalWidth,h:e.currentTarget.naturalHeight};setDimensions(old=>old.w===next.w&&old.h===next.h?old:next);setImageReady(true)}}/>{!imageReady&&<span className="studio-image-loading"><Loader2 className="spinning"/>正在打开素材…</span>}{crop&&<div className="crop-box" style={{left:crop[0]*100+'%',top:crop[1]*100+'%',width:crop[2]*100+'%',height:crop[3]*100+'%'}}/>}
      </div>
     </div>
    </section>
    <section className="studio-results"><div className="row"><h3>分离结果 <small>{job.items.length} 个</small></h3><button className="quiet" disabled={busy} onClick={()=>setSelected(job.items.filter(i=>!i.imported).map(i=>i.id))}><CheckCheck/>全选</button><button className="quiet" disabled={busy} onClick={()=>setSelected([])}>清空选择</button></div><div className="sticker-grid">{job.items.map(item=><article className={selected.includes(item.id)?'chosen':''} key={item.id}><div className="transparent-preview"><img src={item.src} alt={names[item.id]||item.name}/><Checkbox aria-label={`选择${item.name}`} disabled={busy||item.imported} checked={item.imported||selected.includes(item.id)} onCheckedChange={v=>setSelected(ids=>v?[...ids.filter(id=>id!==item.id),item.id]:ids.filter(id=>id!==item.id))}/>{item.imported&&<span className="imported-label"><Check/>已入库</span>}</div><input aria-label="素材名称" value={names[item.id]??item.name} disabled={item.imported||busy} maxLength={80} onChange={e=>setNames(old=>({...old,[item.id]:e.target.value}))}/><small>{item.width} × {item.height} · PNG</small></article>)}</div>{!job.items.length&&<p className="studio-empty-result">没有检测到可分离素材。尝试降低去底强度、切换模式，或框选单个素材。</p>}</section>
   </div>:<div className="studio-empty"><ImagePlus/><h2>一张素材纸，变成一整盒贴纸。</h2><p>支持 JPG、PNG、WebP，可一次选择多张。<br/>透明或浅色底、素材之间有间隔的图片，通常更容易完整拆分。</p><button className="primary" disabled={busy} onClick={()=>file.current?.click()}><Plus/>选择素材图片</button></div>}</main>
  </div>
  <footer className="studio-footer"><span className="studio-status" role="status">{busy?(progress||'正在保存…'):(message||'原图保留在本机；分类和标签可在素材库中整理。')}</span><button className="primary" disabled={busy||!selected.length} onClick={()=>void importItems()}>{busy?<Loader2 className="spinning"/>:<Plus/>}将选中的 {selected.length} 个素材入库</button></footer>
  <input hidden ref={file} type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={e=>void upload(e.target.files)}/>
 </DialogContent></Dialog>;
}
