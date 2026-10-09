'use client';
/* oxlint-disable next/no-img-element -- The gallery shows local material originals. */
import {useEffect,useMemo,useRef,useState} from 'react';
import {Layers,Search,Sparkles,Plus,Check,ArrowLeft,Loader2,X,Pencil,RefreshCw,Trash2,Scissors,Download,Upload} from 'lucide-react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import type {Asset} from '@/lib/journal';
import {mergeMaterialLabels,type MaterialLabelDimension,type MaterialLabels} from '@/lib/material-batch-labels';
import {materialDragIds,materialGroupPatches} from '@/lib/material-group-drag';

type Dimension=MaterialLabelDimension;
type Labels=MaterialLabels;
type BatchMode='add'|'remove';
type Taxonomy={groups:string[];labels:Record<Dimension,string[]>};
type Catalog={revision:number;taxonomy:Taxonomy;lastJobId?:string};
type Proposal={id:string;name?:string;group?:string;labels?:Partial<Labels>;reason?:string};
type Job={id:string;status:string;done:number;total:number;proposals:Proposal[];errors:{id:string;message:string}[];message?:string};
type GroupFilter='all'|'unclassified'|string;

const dimensionNames:Record<Dimension,string>={content:'内容',style:'风格',color:'颜色'};
const dimensions=Object.keys(dimensionNames) as Dimension[];
const hiddenKey='journal-hidden-materials-v1';
const emptyLabels=():Labels=>({content:[],style:[],color:[]});
const emptyLabelChanges=():Record<Dimension,Set<string>>=>({content:new Set(),style:new Set(),color:new Set()});
const labelsOf=(a:Asset):Labels=>({content:a.labels?.content||[],style:a.labels?.style||[],color:a.labels?.color||[]});
const isUserAsset=(a:Asset)=>!!(a.sourceImage||a.sourceUrl?.startsWith('/uploads/'));
const running=(j:Job|null)=>!!j&&['queued','running'].includes(j.status);
async function request<T>(path:string,input?:unknown,signal?:AbortSignal):Promise<T>{
 const r=await fetch('/api/materials'+path,{method:input===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},body:input===undefined?undefined:JSON.stringify(input),signal});
 const data=await r.json() as T & {error?:string};if(!r.ok)throw Error(data.error||'素材操作失败');return data;
}
function Chip({active,onClick,children}:{active?:boolean;onClick:()=>void;children:React.ReactNode}){return <button type="button" className={`chip-select${active?' active':''}`} aria-pressed={active} onClick={onClick}>{children}</button>}

export default function MaterialLibrary({assets,onUpdated,onInsert,onBack,onOpenStudio,onSettings,hasKey,vision}:{assets:Asset[];onUpdated:(a:Asset[])=>void;onInsert:(a:Asset[])=>boolean;onBack:()=>void;onOpenStudio:(targetSource:string)=>void;onSettings:()=>void;hasKey:boolean;vision:boolean}){
 const [sortOrder,setSortOrder]=useState<'newest'|'oldest'>('newest');
 const gallery=useRef<HTMLDivElement>(null);
 const [catalog,setCatalog]=useState<Catalog|null>(null),[error,setError]=useState(''),[feedback,setFeedback]=useState(''),[saving,setSaving]=useState(false),[query,setQuery]=useState(''),[groupFilter,setGroupFilter]=useState<GroupFilter>('all'),[picked,setPicked]=useState<Record<Dimension,Set<string>>>(emptyLabelChanges()),[selected,setSelected]=useState<Set<string>>(new Set()),[draggingIds,setDraggingIds]=useState<string[]>([]),[dragOverGroup,setDragOverGroup]=useState<string|null>(null),[editing,setEditing]=useState<Asset|null>(null),[draftGroup,setDraftGroup]=useState(''),[draftLabels,setDraftLabels]=useState<Labels>(emptyLabels()),[newLabel,setNewLabel]=useState<Record<Dimension,string>>({content:'',style:'',color:''}),[batchEditing,setBatchEditing]=useState(false),[batchMode,setBatchMode]=useState<BatchMode>('add'),[batchAdds,setBatchAdds]=useState<Record<Dimension,Set<string>>>(emptyLabelChanges()),[batchRemoves,setBatchRemoves]=useState<Record<Dimension,Set<string>>>(emptyLabelChanges()),[batchError,setBatchError]=useState(''),[job,setJob]=useState<Job|null>(null),[classifyingId,setClassifyingId]=useState<string|null>(null),[hiddenIds,setHiddenIds]=useState<Set<string>>(new Set());
 const packFile=useRef<HTMLInputElement>(null);
 const [packing,setPacking]=useState(false);
 const busy=packing||saving||running(job),groups=catalog?.taxonomy.groups||['纸张','胶带','边框','标签便签','文字数字','装饰贴纸','其他'];
 const libraryAssets=useMemo(()=>assets.filter(a=>!hiddenIds.has(a.id)),[assets,hiddenIds]);
 const unclassifiedAssets=useMemo(()=>libraryAssets.filter(a=>!a.group),[libraryAssets]);
 const organizeAssets=groupFilter==='unclassified'?unclassifiedAssets:libraryAssets;

 useEffect(()=>{try{const saved=JSON.parse(window.localStorage.getItem(hiddenKey)||'[]');if(Array.isArray(saved))setHiddenIds(new Set(saved.filter((id):id is string=>typeof id==='string')))}catch{/* Ignore unavailable or old browser storage. */}},[]);
 useEffect(()=>{const c=new AbortController();void request<Catalog>('/catalog',undefined,c.signal).then(async data=>{setCatalog(data);if(data.lastJobId){const previous=await request<Job>('/classify/'+data.lastJobId,undefined,c.signal);if(!running(previous)&&(previous.status==='complete'||previous.status==='partial'))await applyJob(previous);else if(previous.status==='failed'){setError(previous.message||'AI 整理失败，素材原分类已保留。');void request('/classify/'+previous.id+'/discard',{}).catch(()=>{});}else setJob(previous)}}).catch(e=>{if(e.name!=='AbortError')setError(e.message)});return()=>c.abort()},[]);
 const isRunning=running(job);
 useEffect(()=>{if(!job?.id||!isRunning)return;const c=new AbortController();let timer:ReturnType<typeof setTimeout>;const id=job.id;const poll=async()=>{try{const next=await request<Job>('/classify/'+id,undefined,c.signal);setJob(next);if(running(next))timer=setTimeout(()=>void poll(),1400);else if(next.status==='complete'||next.status==='partial')await applyJob(next);else if(next.status==='failed'){setError(next.message||'AI 识别失败，素材原名称和分类已保留。');setClassifyingId(null);setJob(null);void request('/classify/'+next.id+'/discard',{}).catch(()=>{})}}catch(e){if(!c.signal.aborted){setError((e as Error).message);setClassifyingId(null);setJob(j=>j?{...j,status:'failed'}:j)}}};timer=setTimeout(()=>void poll(),1000);return()=>{clearTimeout(timer);c.abort()}},[job?.id,isRunning]);

 // AI 全托管：识别完成后直接应用有效建议；漏返回或失败的素材保留原状态。
 async function applyJob(j:Job){
  if(!j.proposals.length){
   const failed=j.errors?.length||j.total;
   const failedAsset=j.total===1&&j.errors?.length?assets.find(a=>a.id===j.errors[0].id):undefined;
   setError(j.total===1?(failedAsset?.group?`识别失败，已保留原名称和分类「${failedAsset.group}」。`:'识别失败，已保留原名称，素材仍在「未分类」。'):`有 ${failed} 件素材没有返回有效识别结果，已保留原名称和分类。`);
   setClassifyingId(null);setJob(null);void request('/classify/'+j.id+'/discard',{}).catch(()=>{});return;
  }
  setSaving(true);setError('');
  try{
   const snap=await request<Catalog>('/catalog');
   const result=await request<{catalog:Catalog;assets:Asset[]}>('/catalog',{action:'apply',jobId:j.id,ids:j.proposals.map(p=>p.id),revision:snap.revision});
   setCatalog(result.catalog);onUpdated(result.assets);
   const failed=j.errors?.length||0;
   const recognized=j.total===1?result.assets.find(a=>a.id===j.proposals[0].id):undefined;
   setFeedback(j.total===1?`识别完成：${recognized?.name||'素材'} · ${recognized?.group||j.proposals[0].group||'其他'}`:failed?`AI 识别完成：${j.proposals.length} 件已更新，${failed} 件保留原名称和分类。`:`AI 识别完成：已检查并更新 ${j.proposals.length} 件素材的名称、分类和标签。`);
   setJob(null);
  }catch(e){setError((e as Error).message)}finally{setClassifyingId(null);setSaving(false)}
 }
 const groupCounts=useMemo(()=>Object.fromEntries(groups.map(g=>[g,libraryAssets.filter(a=>a.group===g).length])),[libraryAssets,groups]);
 const pickedList=useMemo(()=>dimensions.flatMap(d=>[...picked[d]].map(value=>({dim:d,value}))),[picked]);
 const visible=useMemo(()=>{
  const filtered=libraryAssets.filter(a=>{const groupOk=groupFilter==='all'||(groupFilter==='unclassified'?!a.group:a.group===groupFilter);if(!groupOk)return false;const labels=labelsOf(a);if(dimensions.some(d=>picked[d].size&&!labels[d].some(v=>picked[d].has(v))))return false;if(query){const hay=[a.name,...a.tags,a.group||'未分类',...labels.content,...labels.style,...labels.color].join(' ').toLowerCase();if(!hay.includes(query.toLowerCase()))return false}return true});
  // 新入库素材由服务端追加到末尾；只反转筛选副本，保留原素材与待插入顺序。
  return sortOrder==='newest'?filtered.reverse():filtered;
 },[libraryAssets,groupFilter,picked,query,sortOrder]);
 const firstVisibleId=visible[0]?.id;
 useEffect(()=>{gallery.current?.scrollTo({top:0})},[sortOrder,firstVisibleId]);
 const chosen=libraryAssets.filter(a=>selected.has(a.id));
 const toggle=(id:string)=>setSelected(old=>{const next=new Set(old);if(next.has(id))next.delete(id);else next.add(id);return next});
 const togglePicked=(dim:Dimension,value:string)=>setPicked(old=>{const next={...old,[dim]:new Set(old[dim])};if(next[dim].has(value))next[dim].delete(value);else next[dim].add(value);return next});
 const clearPicked=()=>setPicked(emptyLabelChanges());
 async function mutate(input:Record<string,unknown>){if(!catalog)return false;setSaving(true);setError('');setFeedback('');try{const result=await request<{catalog:Catalog;assets:Asset[]}>('/catalog',{...input,revision:catalog.revision});setCatalog(result.catalog);onUpdated(result.assets);return true}catch(e){setError((e as Error).message);return false}finally{setSaving(false)}}
 async function addLabel(dim:Dimension,name:string):Promise<string|null>{const trimmed=name.trim();if(!trimmed)return '标签名不能为空。';if(catalog?.taxonomy.labels[dim].includes(trimmed))return `「${trimmed}」已存在，直接勾选即可。`;return await mutate({action:'add-label',dimension:dim,name:trimmed})?null:'新增标签失败。'}
 function openEditor(a:Asset){setEditing(a);setDraftGroup(a.group||'');setDraftLabels(labelsOf(a));setNewLabel({content:'',style:'',color:''})}
 const toggleDraftLabel=(dim:Dimension,value:string)=>setDraftLabels(old=>({...old,[dim]:old[dim].includes(value)?old[dim].filter(v=>v!==value):[...old[dim],value]}));
 async function saveEditor(){if(!editing)return;const patch={id:editing.id,...(draftGroup?{group:draftGroup}:{}),labels:draftLabels};const ok=await mutate({action:'apply',manual:true,patches:[patch]});if(ok)setEditing(null)}
 function openBatchEditor(){setBatchAdds(emptyLabelChanges());setBatchRemoves(emptyLabelChanges());setBatchMode('add');setBatchError('');setBatchEditing(true)}
 function toggleBatchLabel(dim:Dimension,value:string){
  setBatchError('');
  const target=batchMode==='add'?setBatchAdds:setBatchRemoves,other=batchMode==='add'?setBatchRemoves:setBatchAdds;
  target(old=>{const next={...old,[dim]:new Set(old[dim])};if(next[dim].has(value))next[dim].delete(value);else next[dim].add(value);return next});
  other(old=>{if(!old[dim].has(value))return old;const next={...old,[dim]:new Set(old[dim])};next[dim].delete(value);return next});
 }
 const batchChangeCount=dimensions.reduce((count,dim)=>count+batchAdds[dim].size+batchRemoves[dim].size,0);
 async function saveBatchEditor(){
  if(!catalog||!chosen.length||!batchChangeCount)return;
  const patches=chosen.map(a=>({id:a.id,labels:mergeMaterialLabels(labelsOf(a),batchAdds,batchRemoves)}));
  const overflow=patches.find(p=>dimensions.some(dim=>p.labels[dim].length>8));
  if(overflow){setBatchError('部分素材的标签将超过每类 8 个，请先统一移除一些标签。');return}
  setSaving(true);setBatchError('');setError('');setFeedback('');
  try{
   const result=await request<{catalog:Catalog;assets:Asset[]}>('/catalog',{action:'apply',manual:true,patches,revision:catalog.revision});
   setCatalog(result.catalog);onUpdated(result.assets);setBatchEditing(false);setFeedback(`已统一更新 ${patches.length} 件素材的标签。`);
  }catch(e){setBatchError((e as Error).message)}finally{setSaving(false)}
 }
 async function setAssetGroups(ids:string[],group:string){const patches=materialGroupPatches(assets,ids,group);if(!patches.length){setFeedback(ids.length>1?`所选素材已在「${group}」。`:`素材已在「${group}」。`);return}const ok=await mutate({action:'apply',manual:true,patches});if(ok)setFeedback(patches.length>1?`已将 ${patches.length} 件素材移到「${group}」。`:`已移到「${group}」。`)}
 async function classify(ids=organizeAssets.map(a=>a.id),singleId?:string){if(!hasKey){onSettings();return}if(!ids.length){setFeedback(groupFilter==='unclassified'?'目前没有未分类素材。':'目前没有可整理的素材。');return}setSaving(true);setError('');setFeedback('');setClassifyingId(singleId||null);try{setJob(await request<Job>('/classify',{ids,useImages:vision,instruction:''}))}catch(e){setClassifyingId(null);setError((e as Error).message)}finally{setSaving(false)}} async function reopenAsset(a:Asset){
  setSaving(true);setError('');
  try{let src=a.src;if(!src.startsWith('/uploads/')){const image=await fetch(src,{cache:'no-store'});if(!image.ok)throw Error('当前素材图片读取失败。');const blob=await image.blob();if(!['image/png','image/jpeg','image/webp'].includes(blob.type))throw Error('当前素材格式暂不支持继续编辑。');const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>typeof reader.result==='string'?resolve(reader.result):reject(Error('素材图片读取失败。'));reader.onerror=()=>reject(Error('素材图片读取失败。'));reader.readAsDataURL(blob)});const upload=await fetch('/api/upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data})});const uploaded=await upload.json() as {src?:string;error?:string};if(!upload.ok||!uploaded.src)throw Error(uploaded.error||'素材副本保存失败。');src=uploaded.src}const source=await request<{source:string}>('/source',{src,name:a.name,replaceAssetId:isUserAsset(a)?a.id:undefined});onOpenStudio(source.source)}catch(e){setError((e as Error).message)}finally{setSaving(false)}
 }
 function hideBuiltIn(a:Asset){const next=new Set(hiddenIds);next.add(a.id);setHiddenIds(next);try{window.localStorage.setItem(hiddenKey,JSON.stringify([...next]))}catch{/* The item can still disappear for this session. */}setSelected(old=>{const n=new Set(old);n.delete(a.id);return n})}
 async function removeAsset(a:Asset){
  if(!isUserAsset(a)){hideBuiltIn(a);return}
  setSaving(true);setError('');try{const result=await request<{assets:Asset[]}>('/remove',{id:a.id});onUpdated(result.assets);setSelected(old=>{const n=new Set(old);n.delete(a.id);return n})}catch(e){setError((e as Error).message)}finally{setSaving(false)}
 }

 async function exportPack(){
  if(!chosen.length||packing)return;setPacking(true);setError('');setFeedback('');
  try{
   const response=await fetch('/api/materials/pack/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:chosen.map(a=>a.id)})});
   if(!response.ok){const failure=await response.json() as {error?:string};throw Error(failure.error||'素材包导出失败。');}
   const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');
   link.href=url;link.download=`拾光素材包-${chosen.length}件.shiguang-materials`;link.click();
   setTimeout(()=>URL.revokeObjectURL(url),60000);setFeedback(`已导出 ${chosen.length} 件成品素材及标签，不含原始整图、照片库或手帐。`);
  }catch(e){setError((e as Error).message)}finally{setPacking(false)}
 }
 async function importPack(file:File){
  if(packing)return;
  if(file.size>256*1024*1024){setError('素材包不能超过 256 MB，请分批导入。');return}
  setPacking(true);setError('');setFeedback('');
  try{
   const response=await fetch('/api/materials/pack/import',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file});
   const result=await response.json() as {error?:string;assets:Asset[];catalog:Catalog;added:number;skipped:number};if(!response.ok)throw Error(result.error||'素材包导入失败。');
   onUpdated(result.assets);setCatalog(result.catalog);setFeedback(`素材包已导入：新增 ${result.added} 件，跳过重复 ${result.skipped} 件。`);
  }catch(e){setError((e as Error).message)}finally{setPacking(false)}
 }
 const groupName=groupFilter==='all'?'全部素材':groupFilter==='unclassified'?'未分类':groupFilter;
 return <section className="material-library">
  <header className="library-heading">
   <h1><Layers/>素材库 <small>{libraryAssets.length} 件素材</small></h1>
   <div className="library-ai-actions">
    <input ref={packFile} type="file" accept=".shiguang-materials" hidden onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void importPack(file)}}/>
    <button className="outline" disabled={busy} onClick={()=>packFile.current?.click()}><Upload/>导入素材包</button>
    <button className="outline" disabled={busy||!chosen.length||chosen.length>200} title="最多 200 件、256 MB；只包含所选成品图片、名称与标签" onClick={()=>void exportPack()}>{packing?<Loader2 className="spinning"/>:<Download/>}导出所选素材包</button>

    <button className="outline ai-organize-top" title={chosen.length?`命名并整理选中的 ${chosen.length} 件素材`:groupFilter==='unclassified'?'命名并整理全部未分类素材':'命名并整理全部素材'} disabled={busy||!(chosen.length||organizeAssets.length)} onClick={()=>void classify(chosen.length?chosen.map(a=>a.id):undefined)}>
     {busy?<Loader2 className="spinning"/>:<Sparkles/>}{running(job)?'AI 识别中…':chosen.length?`AI 识别所选（${chosen.length}）`:'AI 一键识别'}
    </button>
   </div>
   <div className="search-field"><Search/><input aria-label="搜索全部素材" placeholder="搜索名称、标签或分类" value={query} onChange={e=>setQuery(e.target.value)}/></div>
   <div className="library-insert"><span className="library-chosen">已选 {chosen.length} 件</span><button className="primary" disabled={!chosen.length||chosen.length>24} onClick={()=>{if(onInsert(chosen))setSelected(new Set())}}><Plus/>插入手帐{chosen.length>24?'（每次最多24件）':''}</button></div>
   <button className="quiet" onClick={onBack}><ArrowLeft/>返回手帐</button>
  </header>
  {job&&<output className="library-ai-progress"><progress max={job.total||1} value={job.done}/><span>{running(job)?`AI 正在识别 ${job.done}/${job.total}`:job.status==='cancelled'?'AI 识别已停止':job.status==='failed'?'AI 识别失败':`AI 识别完成 · 已处理 ${job.proposals.length} 件`}</span>{running(job)?<button className="quiet" onClick={()=>void request('/classify/'+job.id+'/cancel',{}).catch(e=>setError(e.message))}>停止</button>:<button className="quiet" onClick={()=>void request('/classify/'+job.id+'/discard',{}).then(()=>{setClassifyingId(null);setJob(null)}).catch(e=>setError(e.message))}>关闭</button>}</output>}
  {!job&&feedback&&<output className="library-ai-progress"><span>{feedback}</span><button className="quiet" onClick={()=>setFeedback('')}>关闭</button></output>}
  {error&&<div className="library-error" role="alert">{error}<button aria-label="关闭素材提示" onClick={()=>setError('')}><X/></button></div>}
  <div className="library-body"><nav className="library-filters" aria-label="素材分类"><button className={groupFilter==='all'?'active':''} onClick={()=>setGroupFilter('all')}>全部素材 <span>{libraryAssets.length}</span></button><button className={groupFilter==='unclassified'?'active':''} onClick={()=>setGroupFilter('unclassified')}>未分类 <span>{unclassifiedAssets.length}</span></button><h3>主分类 <small>{draggingIds.length>1?`正在拖动 ${draggingIds.length} 件素材`:draggingIds.length?'拖到分类即可归类':''}</small></h3>{groups.map(g=><button key={g} className={`${groupFilter===g?'active ':''}${draggingIds.length?'drop-ready ':''}${dragOverGroup===g?'drop-target':''}`.trim()} aria-label={draggingIds.length?`将 ${draggingIds.length} 件素材移到${g}`:undefined} onClick={()=>setGroupFilter(g)} onDragOver={e=>{if(!draggingIds.length)return;e.preventDefault();e.dataTransfer.dropEffect='move';setDragOverGroup(g)}} onDrop={e=>{e.preventDefault();const ids=draggingIds.length?draggingIds:[e.dataTransfer.getData('text/material-id')].filter(Boolean);setDraggingIds([]);setDragOverGroup(null);if(ids.length)void setAssetGroups(ids,g)}}>{g}<span>{groupCounts[g]||0}</span></button>)}</nav>
   <div className="library-gallery" ref={gallery}>
    <section className="library-filter-section" aria-labelledby="library-filter-heading">
     <div className="library-filter-heading" id="library-filter-heading"><span>标签筛选</span>{pickedList.length>0&&<small>已用 {pickedList.length} 个标签</small>}</div>
     <div className="library-tagfilter" aria-label="标签筛选">{dimensions.map(dim=><div key={dim} className="library-taggroup"><h4>{dimensionNames[dim]}</h4><div className="library-tagchips">{catalog?.taxonomy.labels[dim].map(v=><Chip key={v} active={picked[dim].has(v)} onClick={()=>togglePicked(dim,v)}>{v}</Chip>)}{!catalog?.taxonomy.labels[dim].length&&<span className="muted">加载中…</span>}</div></div>)}</div>
    </section>
    <div className="library-status"><span>当前：<b>{groupName}</b> · {visible.length} 件结果</span><label className="library-sort">入库顺序<select aria-label="素材排序" value={sortOrder} onChange={e=>setSortOrder(e.target.value==='oldest'?'oldest':'newest')}><option value="newest">从新到旧</option><option value="oldest">从旧到新</option></select></label>{pickedList.length>0&&<span className="library-status-tags">已选标签：{pickedList.map(t=><em key={t.dim+t.value}>{dimensionNames[t.dim]}·{t.value}</em>)}</span>}{pickedList.length>0&&<button className="quiet" onClick={clearPicked}>清除标签</button>}<span className="library-status-actions">{chosen.length>1&&<button className="quiet library-batch-labels" onClick={openBatchEditor}><Pencil/>统一编辑标签（{chosen.length}）</button>}<button className="quiet" onClick={()=>setSelected(old=>new Set([...old,...visible.map(a=>a.id)]))}>全选当前结果</button>{selected.size>0&&<button className="quiet" onClick={()=>setSelected(new Set())}>清空选择</button>}</span></div>
    <div className="library-grid">{visible.map(a=>{const labels=labelsOf(a),chips=[a.group||'未分类',...labels.content,...labels.style,...labels.color];return <div key={a.id} className={`library-card ${selected.has(a.id)?'selected':''} ${draggingIds.includes(a.id)?'dragging':''}`}><button className="library-card-main" draggable={!!catalog&&!busy} aria-pressed={selected.has(a.id)} aria-label={`选择素材：${a.name}`} onDragStart={e=>{const ids=materialDragIds(a.id,selected,libraryAssets);e.dataTransfer.setData('text/material-id',a.id);e.dataTransfer.effectAllowed='move';setDraggingIds(ids)}} onDragEnd={()=>{setDraggingIds([]);setDragOverGroup(null)}} onClick={()=>toggle(a.id)}><div className="library-thumb"><img src={a.src} alt={a.name} loading="lazy"/><span className="library-check">{selected.has(a.id)&&<Check/>}</span>{draggingIds[0]===a.id&&draggingIds.length>1&&<span className="library-drag-count">{draggingIds.length} 件</span>}</div><strong>{a.name}</strong></button><div className="library-chips"><span>{a.group||'未分类'}</span>{chips.slice(1,4).map((v,i)=><span key={i}>{v}</span>)}{chips.length>4&&<span className="muted">+{chips.length-4}</span>}</div><div className="library-card-actions">
      <button className="library-edit" aria-label={`编辑${a.name}的标签`} onClick={()=>openEditor(a)}><Pencil/>编辑标签</button>
      <button className="library-edit" title="为这个素材命名并重新判断分类与标签" aria-label={`AI识别${a.name}`} disabled={busy} onClick={()=>void classify([a.id],a.id)}><RefreshCw/>{classifyingId===a.id?'识别中…':'AI识别'}</button>
      <button className="library-edit" title="以当前素材为起点继续抠图或识别" aria-label={`再次编辑${a.name}`} disabled={busy} onClick={()=>void reopenAsset(a)}><Scissors/>再次编辑</button>
      <button className="library-edit danger" aria-label={`删除${a.name}`} disabled={busy} onClick={()=>void removeAsset(a)}><Trash2/>删除</button>
    </div></div>})}</div>{!visible.length&&<div className="library-empty">没有匹配的素材。请调整或清除筛选条件，或导入新素材。</div>}
   </div>
  </div>
  <Dialog open={!!editing} onOpenChange={open=>{if(!open)setEditing(null)}}><DialogContent className="journal-dialog material-editor"><DialogTitle>编辑素材{editing?`：${editing.name}`:''}</DialogTitle><DialogDescription>修改主分类与标签，保存后立即生效。</DialogDescription>{editing&&<><div className="material-editor-head"><img src={editing.src} alt={editing.name}/><label>主分类<select aria-label="素材主分类" value={draftGroup} onChange={e=>setDraftGroup(e.target.value)}>{!draftGroup&&<option value="" disabled>未分类</option>}{groups.map(g=><option key={g} value={g}>{g}</option>)}</select></label></div>{dimensions.map(dim=><div key={dim} className="material-editor-dim"><h4>{dimensionNames[dim]}</h4><div className="library-tagchips">{catalog?.taxonomy.labels[dim].map(v=><Chip key={v} active={draftLabels[dim].includes(v)} onClick={()=>toggleDraftLabel(dim,v)}>{v}</Chip>)}</div><div className="library-new-category"><input aria-label={`新增${dimensionNames[dim]}标签`} placeholder={`新增${dimensionNames[dim]}标签`} value={newLabel[dim]} maxLength={12} onChange={e=>setNewLabel(old=>({...old,[dim]:e.target.value}))}/><button aria-label={`添加${dimensionNames[dim]}标签`} disabled={!newLabel[dim].trim()||busy} onClick={()=>void addLabel(dim,newLabel[dim]).then(msg=>{if(msg){setError(msg);return}const name=newLabel[dim].trim();setNewLabel(old=>({...old,[dim]:''}));setDraftLabels(old=>({...old,[dim]:old[dim].includes(name)?old[dim]:[...old[dim],name]}))})}><Plus/></button></div></div>)}<div className="row"><button className="outline" onClick={()=>setEditing(null)}>取消</button><button className="primary" disabled={saving} onClick={()=>void saveEditor()}>{saving?'保存中…':'保存修改'}</button></div></>}</DialogContent></Dialog>
  <Dialog open={batchEditing} onOpenChange={open=>{if(!open)setBatchEditing(false)}}><DialogContent className="journal-dialog material-batch-editor"><DialogTitle>统一编辑标签</DialogTitle><DialogDescription>为已选的 {chosen.length} 件素材统一添加或移除标签；没有选择的标签保持原样。</DialogDescription><div className="material-batch-mode" role="group" aria-label="批量标签操作"><button type="button" className={batchMode==='add'?'active':''} aria-pressed={batchMode==='add'} onClick={()=>setBatchMode('add')}><Plus/>统一添加</button><button type="button" className={batchMode==='remove'?'active remove':''} aria-pressed={batchMode==='remove'} onClick={()=>setBatchMode('remove')}><X/>统一移除</button></div><p className="material-batch-hint">{batchMode==='add'?'点击标签后，它会添加到每件已选素材；各自已有的其他标签不变。':'点击标签后，它会从每件已选素材中移除；各自其他标签不变。'}</p>{dimensions.map(dim=><div key={dim} className="material-editor-dim material-batch-dim"><h4>{dimensionNames[dim]}</h4><div className="library-tagchips">{catalog?.taxonomy.labels[dim].map(v=>{const change=batchAdds[dim].has(v)?'add':batchRemoves[dim].has(v)?'remove':'';return <button key={v} type="button" className={`chip-select${change?` batch-${change}`:''}`} aria-label={`${dimensionNames[dim]}标签${v}：${batchMode==='add'?'统一添加':'统一移除'}`} aria-pressed={change===batchMode} onClick={()=>toggleBatchLabel(dim,v)}>{v}{change&&<small>{change==='add'?'添加':'移除'}</small>}</button>})}</div></div>)}<div className="material-batch-summary">待处理：添加 {dimensions.reduce((n,d)=>n+batchAdds[d].size,0)} 个标签，移除 {dimensions.reduce((n,d)=>n+batchRemoves[d].size,0)} 个标签</div>{batchError&&<div className="material-batch-error" role="alert">{batchError}</div>}<div className="row"><button className="outline" onClick={()=>setBatchEditing(false)}>取消</button><button className="primary" disabled={saving||!batchChangeCount} onClick={()=>void saveBatchEditor()}>{saving?'保存中…':'统一保存'}</button></div></DialogContent></Dialog>
 </section>;
}
