'use client';
/* oxlint-disable next/no-img-element -- Local editable image previews use original files. */
import {useEffect,useRef,useState} from 'react';
import type {PointerEvent as ReactPointerEvent} from 'react';
import {ImagePlus,Loader2,Scissors,Check,Plus,CheckCheck,RotateCcw,Trash2,MousePointer2,ScanSearch} from 'lucide-react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Checkbox} from '@/components/ui/checkbox';
import type {Asset} from '@/lib/journal';

type Item={id:string;src:string;name:string;width:number;height:number;imported:boolean;manual?:boolean;bounds?:number[]};
type SourceMeta={type:'pinterest';pinId:string;originalUrl:string;imageUrl:string;sha256:string};
type Job={id:string;source:string;name:string;createdAt:string;engine:string;mode?:string;strategy?:string;attempt?:number;tolerance?:number;manualOnly?:boolean;sourceMeta?:SourceMeta;items:Item[]};

async function request<T>(path:string,data?:unknown):Promise<T>{
 const r=await fetch('/api/materials'+path,data===undefined?undefined:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
 const result=await r.json() as T & {error?:string};
 if(!r.ok)throw Error(result.error||'素材处理失败');
 return result;
}
export default function MaterialStudio({open,onClose,onImported,notice}:{open:boolean;onClose:()=>void;onImported:(a:Asset[])=>void;notice?:string}){
 const [jobs,setJobs]=useState<Job[]>([]),[active,setActive]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[mode,setMode]=useState('auto'),[strength,setStrength]=useState(28),[selected,setSelected]=useState<string[]>([]),[names,setNames]=useState<Record<string,string>>({}),[zoom,setZoom]=useState(100),[dimensions,setDimensions]=useState({w:1,h:1}),[imageReady,setImageReady]=useState(false),[viewport,setViewport]=useState({w:400,h:500}),[crop,setCrop]=useState<number[]|null>(null),[cropping,setCropping]=useState(false),[picking,setPicking]=useState(false),[pickPoint,setPickPoint]=useState<number[]|null>(null),[progress,setProgress]=useState('');
 const imageArea=useRef<HTMLDivElement>(null),imageViewport=useRef<HTMLDivElement>(null),pan=useRef<{x:number;y:number;left:number;top:number}|null>(null),start=useRef<number[]|null>(null);
 const job=jobs.find(j=>j.id===active);

 function choose(j:Job){
  setActive(j.id);setSelected(j.items.filter(i=>!i.imported).map(i=>i.id));setNames(Object.fromEntries(j.items.map(i=>[i.id,i.name])));setCrop(null);setCropping(false);setPicking(false);setPickPoint(null);setZoom(100);setMode(j.mode||'auto');setStrength(Number(j.tolerance||28));setMessage('');setImageReady(false);setDimensions({w:1,h:1});
 }
 useEffect(()=>{
  if(!open)return;
  let cancelled=false;
  setMessage(notice||'');
  request<Job[]>('/jobs').then(list=>{
   if(cancelled)return;
   setJobs(list);
   // /source is created before this dialog opens when the user chooses “再次编辑”.
   // Always select the newest job so a stale active id cannot make two sources fight on screen.
   if(list[0])choose(list[0]);
   if(notice)setMessage(notice);
  }).catch(e=>{if(!cancelled)setMessage(e.message)});
  return()=>{cancelled=true};
 },[open,notice]);
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

 async function processImage(src:string,name:string,rect?:number[],overrideMode?:string,adaptive=false){
  const requestedMode=overrideMode||mode;
  // The native recognizer and server router compare candidates before saving.
  // One request commits one final result; previews never overwrite a good pass.
  const next=await request<Job>('/segment',{src,name,mode:requestedMode,tolerance:strength,...(rect?{rect}:{}),...(adaptive?{continue: true}:{})});
  setJobs(old=>[next,...old.filter(j=>j.source!==next.source)]);
  if(rect){setSelected(next.items.filter(i=>!job?.items.some(old=>old.id===i.id)).map(i=>i.id));setNames(Object.fromEntries(next.items.map(i=>[i.id,i.name])));setCrop(null)}else choose(next);
  return next;
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
 async function rerun(rect?:number[],overrideMode?:string,adaptive=false){
  if(!job)return;if(job.manualOnly&&overrideMode==='crop')return void browserCrop(rect);if(job.manualOnly&&overrideMode==='single'){setMessage('当前系统暂不支持自动去底；可使用“保留原底裁出”。');return}
  setBusy(true);setProgress(rect?'正在分离框选区域…':adaptive?'正在换一种策略继续识别…':'正在重新识别整张素材…');
  try{const next=await processImage(job.source,job.name,rect,overrideMode,adaptive);setMessage(next.items.length?(adaptive?`第 ${next.attempt||2} 次识别已换用「${next.engine}」。${(next.attempt||2)>=3?'如果仍不理想，建议直接框选，避免继续增加处理复杂度。':'选择满意的结果加入素材库。'}`:`拆出了 ${next.items.length} 个素材，选择满意的结果加入素材库。`):'没有识别到独立素材，请调低去底强度或改用其他识别模式。')}catch(e){setMessage((e as Error).message)}finally{setBusy(false);setProgress('')}
 }
 async function selectAtPoint(point:number[]){
  if(!job)return;setBusy(true);setPickPoint(point);setProgress('正在识别你点击的素材…');
  try{
   const result=await request<{job:Job;itemId:string;confidence:number}>('/point',{jobId:job.id,src:job.source,point});
   setJobs(old=>[result.job,...old.filter(item=>item.source!==result.job.source)]);setNames(old=>({...old,...Object.fromEntries(result.job.items.map(item=>[item.id,item.name]))}));setSelected([result.itemId]);setMessage(`已抠出「${result.job.items.find(item=>item.id===result.itemId)?.name||'点选素材'}」，可以继续点击其他素材。`);
  }catch(e){setMessage((e as Error).message)}finally{setBusy(false);setProgress('')}
 }
 async function deleteCurrentJob(){
  if(!job||busy||!window.confirm(`删除「${job.name}」的处理记录？已加入素材库的素材不会删除。`))return;setBusy(true);setProgress('正在删除处理记录…');
  try{const result=await request<{ok:boolean;imported:number}>('/delete',{jobId:job.id});const remaining=jobs.filter(j=>j.id!==job.id);setJobs(remaining);if(remaining[0])choose(remaining[0]);else{setActive('');setSelected([]);setNames({});setCrop(null);setCropping(false);setPicking(false);setPickPoint(null);setImageReady(false)}setMessage(result.imported?`已删除处理记录；${result.imported} 个已入库素材继续保留。`:'已删除这条处理记录。')}catch(e){setMessage((e as Error).message)}finally{setBusy(false);setProgress('')}
 }
 async function importItems(){
  if(!job||!selected.length)return;setBusy(true);
  try{const result=await request<{added:number;updated?:number;assets:Asset[];job:Job}>('/import',{jobId:job.id,itemIds:selected,names});onImported(result.assets);setJobs(old=>old.map(j=>j.id===job.id?result.job:j));setSelected([]);setMessage(result.updated?`已更新原素材${result.added?`，并新增 ${result.added} 个素材`:''}；原分类、标签及手帐引用均已保留。`:`已将 ${result.added} 个独立素材加入素材库，之后排版时也可以使用。`)}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}
 }
 function position(e:ReactPointerEvent<HTMLDivElement>){const r=imageArea.current!.getBoundingClientRect();return[Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))]}
 function beginPreviewPointer(e:ReactPointerEvent<HTMLDivElement>){
  if(busy||e.button!==0)return;
  e.currentTarget.setPointerCapture(e.pointerId);
  if(cropping){if(!imageReady)return;e.preventDefault();start.current=position(e);setCrop(null);return}
  if(picking){
   if(!imageReady)return;const bounds=imageArea.current!.getBoundingClientRect();
   if(e.clientX<bounds.left||e.clientX>bounds.right||e.clientY<bounds.top||e.clientY>bounds.bottom)return;
   e.preventDefault();void selectAtPoint(position(e));return;
  }
  pan.current={x:e.clientX,y:e.clientY,left:e.currentTarget.scrollLeft,top:e.currentTarget.scrollTop};
 }
 function movePreviewPointer(e:ReactPointerEvent<HTMLDivElement>){
  if(start.current){const p=position(e);setCrop([Math.min(start.current[0],p[0]),Math.min(start.current[1],p[1]),Math.abs(p[0]-start.current[0]),Math.abs(p[1]-start.current[1])]);return}
  const d=pan.current;if(d){e.currentTarget.scrollLeft=d.left-e.clientX+d.x;e.currentTarget.scrollTop=d.top-e.clientY+d.y}
 }
 function finishPreviewPointer(){start.current=null;pan.current=null}

 return <Dialog open={open} onOpenChange={v=>!v&&!busy&&onClose()}><DialogContent className="material-studio">
  <DialogDescription className="studio-accessible-description">导入原图后可直接点击想要的素材；也支持自动识别与手动框选补漏。</DialogDescription>
  <div className="studio-topline">
   <DialogTitle>素材工作台</DialogTitle>
   <button className="outline" disabled={busy||!job||!!job.manualOnly} onClick={()=>void rerun(undefined,'auto')}><ScanSearch/>自动识别</button>
   <button className={`outline ${picking?'crop-active':''}`} disabled={busy||!job||!!job.manualOnly} title="图片由已连接的 AI 定位，透明边缘在本机生成" onClick={()=>{setPicking(!picking);setCropping(false);setCrop(null);setPickPoint(null)}}><MousePointer2/>{picking?'退出点选':'点选素材'}</button>
   <button className="outline danger" disabled={busy||!job} onClick={()=>void deleteCurrentJob()}><Trash2/>删除记录</button>
   <button className={`outline ${cropping?'crop-active':''}`} disabled={busy||!job} onClick={()=>{setCropping(!cropping);setPicking(false);setPickPoint(null);setCrop(null)}}><Scissors/>{cropping?'退出框选':'框选补漏'}</button>
   {cropping&&<><button className="primary" disabled={busy||!crop||crop[2]<.01||crop[3]<.01} onClick={()=>void rerun(crop!,'crop')}>保留原底裁出</button><button className="outline" disabled={busy||!crop||crop[2]<.01||crop[3]<.01||!!job?.manualOnly} onClick={()=>void rerun(crop!,'single')}>{job?.manualOnly?'去底裁出（Mac 自动拆图）':'去底裁出'}</button></>}
   <details className="studio-advanced"><summary>更多设置</summary><div><select aria-label="识别模式" value={mode} disabled={busy||!!job?.manualOnly} onChange={e=>setMode(e.target.value)}><option value="auto">自动分离</option><option value="panels">底色 / 纹样分区</option><option value="paper">带色纸底分离</option><option value="dense">密集贴纸细分</option><option value="ai">本机 AI 主体识别</option></select><label className="studio-strength">去底 {strength}<input type="range" aria-label="去底强度" min={5} max={100} value={strength} disabled={busy||!!job?.manualOnly} onChange={e=>setStrength(Number(e.target.value))}/></label><button className="outline" disabled={busy||!job||!!job.manualOnly} onClick={()=>void rerun()}><RotateCcw/>按设置识别</button><button className="outline" disabled={busy||!job||!!job.manualOnly} onClick={()=>void rerun(undefined,undefined,true)}>换一种策略</button></div></details>
  </div>
  <div className="studio-body">
   <aside className="studio-history"><h3>导入记录</h3>{jobs.map(j=><button key={j.id} disabled={busy} className={active===j.id?'active':''} onClick={()=>choose(j)}><img src={j.source} alt="导入原图缩略图"/><span>{j.name}<small>{j.items.length} 个结果 · {j.engine}{j.attempt&&j.attempt>1?` · 已识别 ${j.attempt} 次`:''}</small></span></button>)}{!jobs.length&&<p>导入的原图和切分结果<br/>会保存在这里。</p>}</aside>
   <main className="studio-main">{job?<div className="studio-columns">
    <section className="studio-original"><div className="studio-source-tools"><h3>原图</h3><button className="quiet" aria-label="缩小原图" onClick={()=>setZoom(v=>Math.max(50,v-25))}>−</button><span>{zoom}%</span><button className="quiet" aria-label="放大原图" onClick={()=>setZoom(v=>Math.min(500,v+25))}>＋</button><button className="quiet" onClick={()=>setZoom(100)}>适合窗口</button><small>{picking?'点击想要的素材 · 原图交给已连接的 AI 定位':cropping?'拖动框选 · 可滚动查看':'拖动平移 · 可滚动查看'}</small></div>
     <div className={`studio-image-viewport ${cropping?'cropping':''} ${picking?'picking':''}`} ref={imageViewport} onPointerDown={beginPreviewPointer} onPointerMove={movePreviewPointer} onPointerUp={finishPreviewPointer} onPointerCancel={finishPreviewPointer}>
      <div ref={imageArea} className={`studio-source ${cropping?'cropping':''} ${picking?'picking':''} ${imageReady?'ready':'loading'}`} style={imageReady?{width:Math.max(1,dimensions.w*fit*zoom/100),height:Math.max(1,dimensions.h*fit*zoom/100)}:undefined} role="application" aria-label={picking?'点击原图中想要的素材':'原图框选区域，可从图片外侧拖动框选素材'}>
       <img src={job.source} alt="素材原图" draggable={false} onLoad={e=>{const next={w:e.currentTarget.naturalWidth,h:e.currentTarget.naturalHeight};setDimensions(old=>old.w===next.w&&old.h===next.h?old:next);setImageReady(true)}}/>{!imageReady&&<span className="studio-image-loading"><Loader2 className="spinning"/>正在打开素材…</span>}{pickPoint&&<span className="pick-point" style={{left:pickPoint[0]*100+'%',top:pickPoint[1]*100+'%'}}/>}{crop&&<div className="crop-box" style={{left:crop[0]*100+'%',top:crop[1]*100+'%',width:crop[2]*100+'%',height:crop[3]*100+'%'}}/>}
      </div>
     </div>
    </section>
    <section className="studio-results"><div className="row"><h3>分离结果 <small>{job.items.length} 个</small></h3><button className="quiet" disabled={busy} onClick={()=>setSelected(job.items.filter(i=>!i.imported).map(i=>i.id))}><CheckCheck/>全选</button><button className="quiet" disabled={busy} onClick={()=>setSelected([])}>清空选择</button></div><div className="sticker-grid">{job.items.map(item=><article className={selected.includes(item.id)?'chosen':''} key={item.id}><label className="transparent-preview material-select-preview" htmlFor={`material-select-${item.id}`} data-disabled={busy||item.imported?'':undefined} title={item.imported?'已入库':busy?'正在处理…':selected.includes(item.id)?'点击取消选择':'点击选择素材'}><img src={item.src} alt={names[item.id]||item.name} draggable={false}/><Checkbox id={`material-select-${item.id}`} aria-label={`选择${item.name}`} disabled={busy||item.imported} checked={item.imported||selected.includes(item.id)} onCheckedChange={v=>setSelected(ids=>v?[...ids.filter(id=>id!==item.id),item.id]:ids.filter(id=>id!==item.id))}/>{item.imported&&<span className="imported-label"><Check/>已入库</span>}</label><input aria-label="素材名称" value={names[item.id]??item.name} disabled={item.imported||busy} maxLength={80} onChange={e=>setNames(old=>({...old,[item.id]:e.target.value}))}/><small>{item.width} × {item.height} · PNG</small></article>)}</div>{!job.items.length&&<p className="studio-empty-result">没有检测到可分离素材。可以直接点选想要的素材，或使用框选补漏。</p>}</section>
   </div>:<div className="studio-empty"><ImagePlus/><h2>还没有可处理的素材。</h2><p>请从主面板左侧的“导入”进入，添加本机图片或 Pinterest 素材。</p></div>}</main>
  </div>
  <footer className="studio-footer"><span className="studio-status" role="status">{busy?(progress||'正在保存…'):(message||'原图保留在本机；分类和标签可在素材库中整理。')}</span><button className="primary" disabled={busy||!selected.length} onClick={()=>void importItems()}>{busy?<Loader2 className="spinning"/>:<Plus/>}将选中的 {selected.length} 个素材入库</button></footer>
 </DialogContent></Dialog>;
}
