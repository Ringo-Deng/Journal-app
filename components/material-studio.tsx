'use client';
/* oxlint-disable next/no-img-element -- Local editable image previews use original files. */
import {useEffect,useMemo,useRef,useState} from 'react';
import type {PointerEvent as ReactPointerEvent} from 'react';
import {ImagePlus,Loader2,Check,Plus,CheckCheck,Trash2,MousePointer2,Crop} from 'lucide-react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Checkbox} from '@/components/ui/checkbox';
import type {Asset} from '@/lib/journal';
import PhotoLibrary,{type PhotoLibraryItem} from '@/components/photo-library';

type Item={id:string;src:string;name:string;width:number;height:number;imported:boolean;manual?:boolean;pointSelected?:boolean;bounds?:number[];sourceBounds?:number[];cutSaveId?:string};
type SourceMeta={type:'pinterest';pinId:string;originalUrl:string;imageUrl:string;sha256:string};
type Job={id:string;source:string;name:string;createdAt:string;engine:string;mode?:string;strategy?:string;attempt?:number;tolerance?:number;manualOnly?:boolean;replaceAssetId?:string;replacementDone?:boolean;sourceMeta?:SourceMeta;items:Item[]};
const recognitionModes=[{id:'auto',label:'自动分离'},{id:'panels',label:'底色 / 纹样分区'},{id:'paper',label:'带色纸底分离'},{id:'dense',label:'密集贴纸细分'},{id:'ai',label:'本机 AI 主体识别'}] as const;

async function request<T>(path:string,data?:unknown):Promise<T>{
 const r=await fetch('/api/materials'+path,data===undefined?undefined:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
 const result=await r.json() as T & {error?:string};
 if(!r.ok)throw Error(result.error||'素材处理失败');
 return result;
}
type SourceMask={src:string;bounds:[number,number,number,number]};
function sourceMask(item:Item):SourceMask|null{
 if(!item.imported)return null;
 const value=item.sourceBounds||(!item.manual||item.pointSelected?item.bounds:undefined);
 if(!Array.isArray(value)||value.length!==4||!value.every(Number.isFinite))return null;
 const [x,y,width,height]=value;
 if(x<0||y<0||width<=0||height<=0||x+width>1.001||y+height>1.001)return null;
 return{src:item.src,bounds:[x,y,width,height]};
}
function loadPreviewMask(src:string){return new Promise<HTMLImageElement>((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('无法读取已入库素材预览'));image.src=src})}
function DeductedMaterialPreview({items,dimensions}:{items:Item[];dimensions:{w:number;h:number}}){
 const canvas=useRef<HTMLCanvasElement>(null),masks=useMemo(()=>items.map(sourceMask).filter((item):item is SourceMask=>!!item),[items]);
 useEffect(()=>{
  const element=canvas.current;if(!element)return;
  const scale=Math.min(1,2048/Math.max(1,dimensions.w,dimensions.h));element.width=Math.max(1,Math.round(dimensions.w*scale));element.height=Math.max(1,Math.round(dimensions.h*scale));
  const context=element.getContext('2d');if(!context)return;context.clearRect(0,0,element.width,element.height);if(!masks.length)return;
  let cancelled=false;
  void Promise.allSettled(masks.map(mask=>loadPreviewMask(mask.src))).then(results=>{
   if(cancelled)return;context.clearRect(0,0,element.width,element.height);
   results.forEach((result,index)=>{if(result.status!=='fulfilled')return;const [x,y,width,height]=masks[index].bounds;context.drawImage(result.value,x*element.width,y*element.height,width*element.width,height*element.height)});
   context.globalCompositeOperation='source-in';const viewport=element.closest('.studio-image-viewport');const background=viewport?getComputedStyle(viewport).backgroundColor:'';context.fillStyle=background&&background!=='rgba(0, 0, 0, 0)'?background:'#e4e6df';context.fillRect(0,0,element.width,element.height);context.globalCompositeOperation='source-over';
  });
  return()=>{cancelled=true};
 },[dimensions.h,dimensions.w,masks]);
 return masks.length?<canvas ref={canvas} className="studio-deducted-preview" aria-hidden="true"/>:null;
}
export default function MaterialStudio({open,onClose,onImport,onImported,onInsertPhotos,photoProtectedSources,notice,targetSource}:{open:boolean;onClose:()=>void;onImport:()=>void;onImported:(a:Asset[])=>void;onInsertPhotos:(sources:string[])=>boolean;photoProtectedSources:string[];notice?:string;targetSource?:string}){
 const [jobs,setJobs]=useState<Job[]>([]),[active,setActive]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[mode,setMode]=useState('auto'),[strength,setStrength]=useState(28),[selected,setSelected]=useState<string[]>([]),[names,setNames]=useState<Record<string,string>>({}),[zoom,setZoom]=useState(100),[dimensions,setDimensions]=useState({w:1,h:1}),[imageReady,setImageReady]=useState(false),[viewport,setViewport]=useState({w:400,h:500}),[crop,setCrop]=useState<number[]|null>(null),[cropping,setCropping]=useState(false),[picking,setPicking]=useState(false),[pickPoint,setPickPoint]=useState<number[]|null>(null),[progress,setProgress]=useState(''),[replacementItemId,setReplacementItemId]=useState('');
 const [section,setSection]=useState<'process'|'photos'>('process');
 const imageArea=useRef<HTMLDivElement>(null),imageViewport=useRef<HTMLDivElement>(null),previewSource=useRef(''),pan=useRef<{x:number;y:number;left:number;top:number}|null>(null),start=useRef<number[]|null>(null);
 const job=jobs.find(j=>j.id===active);

 function choose(j:Job,preservePreview=j.source===previewSource.current){
  const available=j.items.filter(i=>!i.imported).map(i=>i.id);setSection('process');setActive(j.id);setSelected(available);setReplacementItemId(j.replaceAssetId&&!j.replacementDone?available[0]||'':'');setNames(Object.fromEntries(j.items.map(i=>[i.id,i.name])));setCrop(null);setCropping(false);setPicking(false);setPickPoint(null);if(!preservePreview){setZoom(100);setImageReady(false);setDimensions({w:1,h:1})}previewSource.current=j.source;setMode(j.mode||'auto');setStrength(Number(j.tolerance||28));setMessage('');
 }
 function clearJobView(){
  previewSource.current='';setActive('');setSelected([]);setReplacementItemId('');setNames({});setCrop(null);setCropping(false);setPicking(false);setPickPoint(null);setZoom(100);setImageReady(false);setDimensions({w:1,h:1});
 }
 useEffect(()=>{
  if(!open)return;
  let cancelled=false;
  setBusy(true);setProgress('正在打开素材处理记录…');
  if(targetSource){setJobs([]);clearJobView();setSection('process')}
  setMessage(notice||'');
  request<Job[]>('/jobs').then(list=>{
   if(cancelled)return;
   setJobs(list);
   // Import and re-edit flows pass their exact source; direct entry falls back to the newest job.
   const target=targetSource?list.find(job=>job.source===targetSource):list[0];
   if(target){choose(target);if(notice)setMessage(notice)}
   else{clearJobView();if(targetSource)setSection('process');setMessage(targetSource?'这条素材处理记录已不存在，请返回素材库后重新打开。':notice||'')}
  }).catch(e=>{if(!cancelled){setJobs([]);clearJobView();if(targetSource)setSection('process');setMessage(e.message)}}).finally(()=>{if(!cancelled){setBusy(false);setProgress('')}});
  return()=>{cancelled=true};
 },[open,notice,targetSource]);
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
 },[open,job?.source,section]);
 const fit=imageReady?Math.min(viewport.w/dimensions.w,viewport.h/dimensions.h,1):1;

 function selectResults(ids:string[],candidate=ids[0]||''){
  setSelected(ids);if(job?.replaceAssetId&&!job.replacementDone)setReplacementItemId(candidate);
 }
 function closeStudio(){
  if(busy)return;
  onClose();
 }
 function toggleResult(id:string,checked:boolean){
  setSelected(current=>{const next=checked?[...current.filter(item=>item!==id),id]:current.filter(item=>item!==id);if(replacing)setReplacementItemId(primary=>next.includes(primary)?primary:next[0]||'');return next});
 }
 function selectAllResults(){
  if(!job)return;const next=job.items.filter(item=>!item.imported).map(item=>item.id);setSelected(next);if(replacing)setReplacementItemId(primary=>next.includes(primary)?primary:next[0]||'');
 }
 function clearResultSelection(){setSelected([]);if(replacing)setReplacementItemId('')}

 async function processImage(src:string,name:string,rect?:number[],overrideMode?:string){
  const requestedMode=overrideMode||mode;
  // The native recognizer and server router compare candidates before saving.
  // One request commits one final result; previews never overwrite a good pass.
  const next=await request<Job>('/segment',{src,name,mode:requestedMode,tolerance:strength,...(rect?{rect}:{})});
  setJobs(old=>[next,...old.filter(j=>j.source!==next.source)]);
  if(rect){selectResults(next.items.filter(i=>!job?.items.some(old=>old.id===i.id)).map(i=>i.id));setNames(Object.fromEntries(next.items.map(i=>[i.id,i.name])));setCrop(null)}else choose(next,next.source===job?.source);
  return next;
 }
 async function browserCrop(rect?:number[]){
  if(!job||!rect)return;setBusy(true);setProgress('正在裁出框选区域…');
  try{
   const image=new Image();image.src=job.source;await image.decode();
   const sx=Math.max(0,Math.floor(rect[0]*image.naturalWidth)),sy=Math.max(0,Math.floor(rect[1]*image.naturalHeight)),sw=Math.max(1,Math.min(image.naturalWidth-sx,Math.round(rect[2]*image.naturalWidth))),sh=Math.max(1,Math.min(image.naturalHeight-sy,Math.round(rect[3]*image.naturalHeight)));
   const canvas=document.createElement('canvas');canvas.width=sw;canvas.height=sh;const context=canvas.getContext('2d');if(!context)throw Error('浏览器无法裁切图片。');context.drawImage(image,sx,sy,sw,sh,0,0,sw,sh);
   const response=await fetch('/api/upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:canvas.toDataURL('image/png')})});const uploaded=await response.json() as {src:string;error?:string};if(!response.ok)throw Error(uploaded.error||'裁切图片保存失败');
   const known=new Set(job.items.map(item=>item.id));const next=await request<Job>('/add-item',{jobId:job.id,src:uploaded.src,width:sw,height:sh,sourceBounds:rect});const fresh=next.items.filter(item=>!known.has(item.id)).map(item=>item.id);setJobs(old=>old.map(item=>item.id===next.id?next:item));setNames(old=>({...old,...Object.fromEntries(next.items.map(item=>[item.id,item.name]))}));selectResults(fresh);setCrop(null);setCropping(false);setMessage('已保留框选区域，并只选中这次的新结果；可继续处理或直接加入素材库。');
  }catch(e){setMessage((e as Error).message)}finally{setBusy(false);setProgress('')}
 }
 async function rerun(rect?:number[],overrideMode?:string){
  if(!job)return;if(job.manualOnly&&overrideMode==='crop')return void browserCrop(rect);if(job.manualOnly&&overrideMode==='single'){setMessage('当前系统暂不支持自动去底；可使用“保留原底裁出”。');return}
  const nextModeLabel=!rect?recognitionModes.find(item=>item.id===overrideMode)?.label:undefined;
  setBusy(true);setProgress(rect?'正在分离框选区域…':nextModeLabel?`正在切换到「${nextModeLabel}」识别…`:'正在重新识别整张素材…');
  try{const next=await processImage(job.source,job.name,rect,overrideMode);setMessage(next.items.length?`${nextModeLabel?`已切换到「${nextModeLabel}」，`:''}拆出了 ${next.items.length} 个素材，选择满意的结果加入素材库。`:'没有识别到独立素材，请调低去底强度或改用其他识别模式。')}catch(e){setMessage((e as Error).message)}finally{setBusy(false);setProgress('')}
 }
 function recognizeWithNextMode(){
  const current=recognitionModes.findIndex(item=>item.id===mode),next=recognitionModes[(current+1)%recognitionModes.length];
  setMode(next.id);void rerun(undefined,next.id);
 }
 async function selectAtPoint(point:number[]){
  if(!job)return;setBusy(true);setPickPoint(point);setProgress('正在识别你点击的素材…');
  try{
   const result=await request<{job:Job;itemId:string;confidence:number}>('/point',{jobId:job.id,src:job.source,point});
   setJobs(old=>[result.job,...old.filter(item=>item.source!==result.job.source)]);setNames(old=>({...old,...Object.fromEntries(result.job.items.map(item=>[item.id,item.name]))}));selectResults([result.itemId]);setMessage(`已抠出「${result.job.items.find(item=>item.id===result.itemId)?.name||'点选素材'}」，可以继续点击其他素材。`);
  }catch(e){setMessage((e as Error).message)}finally{setBusy(false);setProgress('')}
 }
 async function deleteCurrentJob(){
  if(!job||busy||!window.confirm(`删除「${job.name}」的处理记录？已加入素材库的素材不会删除。`))return;setBusy(true);setProgress('正在删除处理记录…');
  try{const result=await request<{ok:boolean;imported:number}>('/delete',{jobId:job.id});const remaining=jobs.filter(j=>j.id!==job.id);setJobs(remaining);if(remaining[0])choose(remaining[0]);else clearJobView();setMessage(result.imported?`已删除处理记录；${result.imported} 个已入库素材继续保留。`:'已删除这条处理记录。')}catch(e){setMessage((e as Error).message)}finally{setBusy(false);setProgress('')}
 }
 async function importItems(){
  if(!job||!selected.length)return;setBusy(true);
  try{const result=await request<{added:number;updated?:number;assets:Asset[];job:Job}>('/import',{jobId:job.id,itemIds:selected,names,...(replacing?{replacementItemId}:{})});onImported(result.assets);setJobs(old=>old.map(j=>j.id===job.id?result.job:j));setSelected([]);setReplacementItemId('');setMessage(result.updated?`已更新原素材${result.added?`，并新增 ${result.added} 个素材`:''}；原分类、标签及手帐引用均已保留。`:`已将 ${result.added} 个独立素材加入素材库，之后排版时也可以使用。`)}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}
 }
 async function processPhoto(item:PhotoLibraryItem){
  const next=await request<Job>('/source',{src:item.src,name:item.originalName});
  setJobs(old=>[next,...old.filter(job=>job.source!==next.source)]);choose(next);setSection('process');setMessage('照片原片仍保留在照片分类中；可以在这里裁切或提取主体。');
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

 const replacing=!!job?.replaceAssetId&&!job.replacementDone;
 return <Dialog open={open} onOpenChange={v=>{if(!v)closeStudio()}}><DialogContent className="material-studio" showCloseButton={!busy}>
  <DialogDescription className="studio-accessible-description">素材处理支持自动识别、点选和框选补漏；照片分类保存旅游原片并按拍摄时间排列。</DialogDescription>
  <div className="studio-topline">
   <DialogTitle>素材工作台</DialogTitle>
   <div className="studio-section-tabs" role="tablist" aria-label="素材工作台分类"><button role="tab" aria-selected={section==='process'} className={section==='process'?'active':''} disabled={busy} onClick={()=>setSection('process')}>素材处理</button><button role="tab" aria-selected={section==='photos'} className={section==='photos'?'active':''} disabled={busy} onClick={()=>setSection('photos')}>照片</button></div>
   {section==='process'&&<>
   <button className="outline" disabled={busy} onClick={onImport}><ImagePlus/>导入新素材</button>
   <button className={`outline ${cropping?'crop-active':''}`} disabled={busy||!job} onClick={()=>{setCropping(!cropping);setPicking(false);setPickPoint(null);setCrop(null)}}><Crop/>{cropping?'退出框选':'框选补漏'}</button>
   {cropping&&<><button className="primary" disabled={busy||!crop||crop[2]<.01||crop[3]<.01} onClick={()=>void rerun(crop!,'crop')}>保留原底裁出</button><button className="outline" disabled={busy||!crop||crop[2]<.01||crop[3]<.01||!!job?.manualOnly} onClick={()=>void rerun(crop!,'single')}>{job?.manualOnly?'去底裁出（Mac 自动拆图）':'去底裁出'}</button></>}
   <div className="studio-advanced" role="group" aria-label="识别设置"><button className={`outline ${picking?'crop-active':''}`} disabled={busy||!job||!!job.manualOnly} title="图片由已连接的 AI 定位，透明边缘在本机生成" onClick={()=>{setPicking(!picking);setCropping(false);setCrop(null);setPickPoint(null)}}><MousePointer2/>{picking?'退出点选':'点选素材'}</button><select aria-label="识别模式" value={mode} disabled={busy||!!job?.manualOnly} onChange={e=>setMode(e.target.value)}>{recognitionModes.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}</select><label className="studio-strength">去底 {strength}<input type="range" aria-label="去底强度" min={5} max={100} value={strength} disabled={busy||!!job?.manualOnly} onChange={e=>setStrength(Number(e.target.value))}/></label><button className="outline" disabled={busy||!job||!!job.manualOnly} onClick={recognizeWithNextMode}>换一种策略</button></div>
   </>}
  </div>
  {section==='photos'?<PhotoLibrary onInsert={onInsertPhotos} onProcess={processPhoto} protectedSources={photoProtectedSources}/>:<><div className="studio-body">
   <aside className="studio-history"><h3>导入记录</h3>{jobs.map(j=><button key={j.id} disabled={busy} className={active===j.id?'active':''} onClick={()=>choose(j)}><img src={j.source} alt="导入原图缩略图"/><span>{j.name}<small>{j.items.length} 个结果 · {j.engine}{j.attempt&&j.attempt>1?` · 已识别 ${j.attempt} 次`:''}</small></span></button>)}{!jobs.length&&<p>导入的原图和切分结果<br/>会保存在这里。</p>}</aside>
   <main className="studio-main">{job?<div className="studio-columns">
    <section className="studio-original"><div className="studio-source-tools"><h3>原图</h3><button className="quiet" aria-label="缩小原图" onClick={()=>setZoom(v=>Math.max(50,v-25))}>−</button><span>{zoom}%</span><button className="quiet" aria-label="放大原图" onClick={()=>setZoom(v=>Math.min(500,v+25))}>＋</button><button className="quiet" onClick={()=>setZoom(100)}>适合窗口</button><small>{picking?'点击想要的素材 · 原图交给已连接的 AI 定位':cropping?'拖动框选 · 可滚动查看':'拖动平移 · 可滚动查看'}</small></div>
     <div className={`studio-image-viewport ${cropping?'cropping':''} ${picking?'picking':''}`} ref={imageViewport} onPointerDown={beginPreviewPointer} onPointerMove={movePreviewPointer} onPointerUp={finishPreviewPointer} onPointerCancel={finishPreviewPointer}>
      <div ref={imageArea} className={`studio-source ${cropping?'cropping':''} ${picking?'picking':''} ${imageReady?'ready':'loading'}`} style={imageReady?{width:Math.max(1,dimensions.w*fit*zoom/100),height:Math.max(1,dimensions.h*fit*zoom/100)}:undefined} role="application" aria-label={picking?'点击原图中想要的素材':'原图框选区域，可从图片外侧拖动框选素材'}>
       <img src={job.source} alt="素材原图" draggable={false} onLoad={e=>{const next={w:e.currentTarget.naturalWidth,h:e.currentTarget.naturalHeight};setDimensions(old=>old.w===next.w&&old.h===next.h?old:next);setImageReady(true)}}/><DeductedMaterialPreview items={job.items} dimensions={dimensions}/>{!imageReady&&<span className="studio-image-loading"><Loader2 className="spinning"/>正在打开素材…</span>}{pickPoint&&<span className="pick-point" style={{left:pickPoint[0]*100+'%',top:pickPoint[1]*100+'%'}}/>}{crop&&<div className="crop-box" style={{left:crop[0]*100+'%',top:crop[1]*100+'%',width:crop[2]*100+'%',height:crop[3]*100+'%'}}/>}
      </div>
     </div>
    </section>
    <section className="studio-results"><div className="row"><h3>分离结果 <small>{job.items.length} 个</small></h3><button className="quiet" disabled={busy} onClick={selectAllResults}><CheckCheck/>全选</button><button className="quiet" disabled={busy} onClick={clearResultSelection}>清空选择</button></div><div className="sticker-grid">{job.items.map(item=><article className={selected.includes(item.id)?'chosen':''} key={item.id}><label className="transparent-preview material-select-preview" htmlFor={`material-select-${item.id}`} data-disabled={busy||item.imported?'':undefined} title={item.imported?'已入库':busy?'正在处理…':item.id===replacementItemId?'此裁片将更新原素材':selected.includes(item.id)?'点击取消选择':'点击选择素材'}><img src={item.src} alt={names[item.id]||item.name} draggable={false}/><Checkbox id={`material-select-${item.id}`} aria-label={`选择${item.name}`} disabled={busy||item.imported} checked={item.imported||selected.includes(item.id)} onCheckedChange={v=>toggleResult(item.id,!!v)}/>{item.imported&&<span className="imported-label"><Check/>已入库</span>}{replacing&&item.id===replacementItemId&&<span className="replacement-label"><Check/>更新原素材</span>}</label><input aria-label="素材名称" value={names[item.id]??item.name} disabled={item.imported||busy} maxLength={80} onChange={e=>setNames(old=>({...old,[item.id]:e.target.value}))}/><small>{item.width} × {item.height} · PNG</small></article>)}</div>{!job.items.length&&<p className="studio-empty-result">没有检测到可分离素材。可以继续点选或框选补漏；如需自由裁切，请点“导入新素材”选择“整图入库”，放入手帐后从选中工具栏打开。</p>}</section>
   </div>:<div className="studio-empty"><ImagePlus/><h2>还没有可处理的素材。</h2><p>导入本机图片或 Pinterest 素材后，就可以在这里继续拆分、框选和入库。</p><button className="primary" disabled={busy} onClick={onImport}>导入新素材</button></div>}</main>
  </div>
  <footer className="studio-footer"><button className="outline danger studio-delete" disabled={busy||!job} onClick={()=>void deleteCurrentJob()}><Trash2/>删除记录</button><span className="studio-accessible-status" role="status">{busy?(progress||'正在保存…'):message}</span><button className="primary" disabled={busy||!selected.length} onClick={()=>void importItems()}>{busy?<Loader2 className="spinning"/>:<Plus/>}{replacing?(selected.length===1?'保存并更新原素材':`更新原素材并新增 ${selected.length-1} 个`):`将选中的 ${selected.length} 个素材入库`}</button></footer></>}
 </DialogContent></Dialog>;
}
