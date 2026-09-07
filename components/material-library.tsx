'use client';
/* oxlint-disable next/no-img-element -- The gallery shows local material originals. */
import {useEffect,useMemo,useState} from 'react';
import {Layers,Search,Sparkles,Plus,Check,ImagePlus,ArrowLeft,Loader2,X,Pencil,RefreshCw,Trash2,Scissors} from 'lucide-react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import type {Asset} from '@/lib/journal';
type Dimension='content'|'style'|'color';
type Labels=Record<Dimension,string[]>;
type Taxonomy={groups:string[];labels:Record<Dimension,string[]>};
type Catalog={revision:number;taxonomy:Taxonomy;lastJobId?:string};
type Proposal={id:string;group?:string;labels?:Partial<Labels>;review?:{pending:boolean;reason?:string};reason?:string};
type Job={id:string;status:string;done:number;total:number;proposals:Proposal[];errors:{id:string;message:string}[];message?:string};
type GroupFilter='all'|'pending'|string;
const dimensionNames:Record<Dimension,string>={content:'内容',style:'风格',color:'颜色'};
const dimensions=Object.keys(dimensionNames) as Dimension[];
const emptyLabels=():Labels=>({content:[],style:[],color:[]});
const labelsOf=(a:Asset):Labels=>({content:a.labels?.content||[],style:a.labels?.style||[],color:a.labels?.color||[]});
const isPending=(a:Asset)=>!a.group||!!a.review?.pending;
const running=(j:Job|null)=>!!j&&['queued','running'].includes(j.status);
async function request<T>(path:string,input?:unknown,signal?:AbortSignal):Promise<T>{
 const r=await fetch('/api/materials'+path,{method:input===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},body:input===undefined?undefined:JSON.stringify(input),signal});
 const data=await r.json() as T & {error?:string};if(!r.ok)throw Error(data.error||'素材操作失败');return data;
}
function Chip({active,onClick,children}:{active?:boolean;onClick:()=>void;children:React.ReactNode}){
 return <button type="button" className={`chip-select${active?' active':''}`} aria-pressed={active} onClick={onClick}>{children}</button>;
}
export default function MaterialLibrary({assets,onUpdated,onInsert,onBack,onImport,onSettings,hasKey,vision}:{assets:Asset[];onUpdated:(a:Asset[])=>void;onInsert:(a:Asset[],side:number)=>boolean;onBack:()=>void;onImport:()=>void;onSettings:()=>void;hasKey:boolean;vision:boolean}){
 const [catalog,setCatalog]=useState<Catalog|null>(null),[error,setError]=useState(''),[saving,setSaving]=useState(false);
 const [query,setQuery]=useState(''),[groupFilter,setGroupFilter]=useState<GroupFilter>('all');
 const [picked,setPicked]=useState<Record<Dimension,Set<string>>>({content:new Set(),style:new Set(),color:new Set()});
 const [selected,setSelected]=useState<Set<string>>(new Set()),[side,setSide]=useState(0);
 const [draggingId,setDraggingId]=useState<string|null>(null),[dragOverGroup,setDragOverGroup]=useState<string|null>(null);
 const [editing,setEditing]=useState<Asset|null>(null),[draftGroup,setDraftGroup]=useState(''),[draftLabels,setDraftLabels]=useState<Labels>(emptyLabels());
 const [newLabel,setNewLabel]=useState<Record<Dimension,string>>({content:'',style:'',color:''});
 const [job,setJob]=useState<Job|null>(null),[review,setReview]=useState(false),[accepted,setAccepted]=useState<Set<string>>(new Set());
 const [adjusted,setAdjusted]=useState<Record<string,{group:string;labels:Labels}>>({});
 const busy=saving||running(job);
 const groups=catalog?.taxonomy.groups||['纸张','胶带','边框','标签便签','文字数字','装饰贴纸'];
 useEffect(()=>{const c=new AbortController();void request<Catalog>('/catalog',undefined,c.signal).then(async data=>{setCatalog(data);if(data.lastJobId){const previous=await request<Job>('/classify/'+data.lastJobId,undefined,c.signal);setJob(previous);}}).catch(e=>{if(e.name!=='AbortError')setError(e.message)});return()=>c.abort();},[]);
 const isRunning=running(job);
 useEffect(()=>{
  if(!job?.id||!isRunning)return;
  const c=new AbortController();let timer:ReturnType<typeof setTimeout>;const id=job.id;
  const poll=async()=>{try{const next=await request<Job>('/classify/'+id,undefined,c.signal);setJob(next);if(running(next)){timer=setTimeout(()=>void poll(),1400);}else openReview(next);}catch(e){if(!c.signal.aborted){setError((e as Error).message);setJob(j=>j?{...j,status:'failed'}:j);}}};
  timer=setTimeout(()=>void poll(),1000);return()=>{clearTimeout(timer);c.abort()};
 },[job?.id,isRunning]);
 function openReview(j:Job){
  setAccepted(new Set(j.proposals.map(p=>p.id)));
  setAdjusted(Object.fromEntries(j.proposals.map(p=>{const a=assets.find(a=>a.id===p.id);return[p.id,{group:a?.manual?.group?(a.group||''):(p.group||''),labels:a?.manual?.labels?labelsOf(a):{content:p.labels?.content||[],style:p.labels?.style||[],color:p.labels?.color||[]}}]})));
  setReview(true);
 }
 const pendingCount=useMemo(()=>assets.filter(isPending).length,[assets]);
 const groupCounts=useMemo(()=>Object.fromEntries(groups.map(g=>[g,assets.filter(a=>a.group===g).length])),[assets,groups]);
 const pickedList=useMemo(()=>dimensions.flatMap(d=>[...picked[d]].map(v=>({dim:d,value:v}))),[picked]);
 const visible=useMemo(()=>assets.filter(a=>{
  const groupOk=groupFilter==='all'||(groupFilter==='pending'?isPending(a):a.group===groupFilter);
  if(!groupOk)return false;
  const labels=labelsOf(a);
  if(dimensions.some(d=>picked[d].size&&!labels[d].some(v=>picked[d].has(v))))return false;
  if(query){
   const hay=[a.name,...a.tags,a.group||'待确认',...labels.content,...labels.style,...labels.color].join(' ').toLowerCase();
   if(!hay.includes(query.toLowerCase()))return false;
  }
  return true;
 }),[assets,groupFilter,picked,query]);
 const chosen=assets.filter(a=>selected.has(a.id));
 const toggle=(id:string)=>setSelected(old=>{const next=new Set(old);if(next.has(id))next.delete(id);else next.add(id);return next;});
 const togglePicked=(dim:Dimension,value:string)=>setPicked(old=>{const next={...old,[dim]:new Set(old[dim])};if(next[dim].has(value))next[dim].delete(value);else next[dim].add(value);return next;});
 const clearPicked=()=>setPicked({content:new Set(),style:new Set(),color:new Set()});
 async function mutate(input:Record<string,unknown>){
  if(!catalog)return false;setSaving(true);setError('');
  try{const result=await request<{catalog:Catalog;assets:Asset[]}>('/catalog',{...input,revision:catalog.revision});setCatalog(result.catalog);onUpdated(result.assets);return true;}
  catch(e){setError((e as Error).message);return false;}finally{setSaving(false);}
 }
 async function addLabel(dim:Dimension,name:string):Promise<string|null>{
  const trimmed=name.trim();
  if(!trimmed)return '标签名不能为空。';
  if(catalog?.taxonomy.labels[dim].includes(trimmed))return `「${trimmed}」已存在，直接勾选即可。`;
  return await mutate({action:'add-label',dimension:dim,name:trimmed})?null:'新增标签失败。';
 }
 function openEditor(a:Asset){setEditing(a);setDraftGroup(a.group||'');setDraftLabels(labelsOf(a));setNewLabel({content:'',style:'',color:''});}
 const toggleDraftLabel=(dim:Dimension,value:string)=>setDraftLabels(old=>{const list=old[dim].includes(value)?old[dim].filter(v=>v!==value):[...old[dim],value];return{...old,[dim]:list};});
 async function saveEditor(){
  if(!editing)return;
  const ok=await mutate({action:'apply',manual:true,patches:[{id:editing.id,group:draftGroup,labels:draftLabels,review:{pending:!draftGroup}}]});
  if(ok)setEditing(null);
 }
 async function setAssetGroup(id:string,group:string){
  const current=assets.find(a=>a.id===id);
  if(!current||(current.group||'')===group)return;
  await mutate({action:'apply',manual:true,patches:[{id,group,review:{pending:!group}}]});
 }
 async function classify(ids=assets.map(a=>a.id)){
  if(!hasKey){onSettings();return;}setSaving(true);setError('');
  try{const next=await request<Job>('/classify',{ids,useImages:vision,instruction:''});setJob(next);}
  catch(e){setError((e as Error).message);}finally{setSaving(false);}
 }
 async function applySuggestions(){
  if(!job)return;
  const patches=[...accepted].map(id=>{const p=job.proposals.find(p=>p.id===id);const adj=adjusted[id];if(!p||!adj)return null;return{id,group:adj.group,labels:adj.labels,review:adj.group?(p.review||{pending:false}):{pending:true,reason:p.reason||p.review?.reason||'待确认'}};}).filter(Boolean);
  if(await mutate({action:'apply',jobId:job.id,patches})){setReview(false);setJob(null);}
 }
 async function removeAsset(a:Asset){
  if(!a.sourceImage&&!a.sourceUrl?.startsWith('/uploads/')){setError('内置素材不能删除。');return;}
  if(!window.confirm(`删除素材「${a.name}」？`))return;
  setSaving(true);setError('');
  try{const result=await request<{assets:Asset[]}>('/remove',{id:a.id});onUpdated(result.assets);setSelected(old=>{const n=new Set(old);n.delete(a.id);return n});}
  catch(e){setError((e as Error).message);}finally{setSaving(false);}
 }
 const groupName=groupFilter==='all'?'全部素材':groupFilter==='pending'?'待确认':groupFilter;
 return <section className="material-library">
  <header className="library-heading">
   <h1><Layers/>素材库 <small>{assets.length} 件素材</small></h1>
   <button className="primary ai-organize-top" title="整理全部素材" disabled={busy||!assets.length} onClick={()=>void classify()}>{busy?<Loader2 className="spinning"/>:<Sparkles/>}{running(job)?'AI 整理中…':'AI 一键整理'}</button>
   <div className="search-field"><Search/><input aria-label="搜索全部素材" placeholder="搜索名称、标签或分类" value={query} onChange={e=>setQuery(e.target.value)}/></div>
   <button className="outline" onClick={onImport}><ImagePlus/>导入与拆分</button>
   <div className="library-insert">
    <span className="library-chosen">已选 {chosen.length} 件</span>
    <select aria-label="素材插入位置" value={side} onChange={e=>setSide(Number(e.target.value))}><option value={0}>插入左页</option><option value={1}>插入右页</option></select>
    <button className="primary" disabled={!chosen.length||chosen.length>24} onClick={()=>{if(onInsert(chosen,side))setSelected(new Set())}}><Plus/>插入手帐{chosen.length>24?'（每次最多24件）':''}</button>
   </div>
   <button className="quiet" onClick={onBack}><ArrowLeft/>返回手帐</button>
  </header>
  {job&&<output className="library-ai-progress"><progress max={job.total||1} value={job.done}/><span>{running(job)?`AI 正在整理 ${job.done}/${job.total}`:job.status==='cancelled'?'AI 整理已停止':job.status==='failed'?'AI 整理失败':`AI 整理完成 · ${job.proposals.length} 件建议`}</span>{running(job)?<button className="quiet" onClick={()=>void request('/classify/'+job.id+'/cancel',{}).catch(e=>setError(e.message))}>停止</button>:<><button className="outline" onClick={()=>openReview(job)}>查看结果</button><button className="quiet" onClick={()=>void request('/classify/'+job.id+'/discard',{}).then(()=>setJob(null)).catch(e=>setError(e.message))}>丢弃</button></>}</output>}
  {error&&<div className="library-error" role="alert">{error}<button aria-label="关闭素材提示" onClick={()=>setError('')}><X/></button></div>}
  <div className="library-body">
   <nav className="library-filters" aria-label="素材分类">
    <button className={groupFilter==='all'?'active':''} onClick={()=>setGroupFilter('all')}>全部素材 <span>{assets.length}</span></button>
    <button className={`${groupFilter==='pending'?'active ':''}${draggingId?'drop-ready ':''}${dragOverGroup===''?'drop-target':''}`.trim()} onClick={()=>setGroupFilter('pending')} onDragOver={e=>{if(!draggingId)return;e.preventDefault();e.dataTransfer.dropEffect='move';setDragOverGroup('')}} onDrop={e=>{e.preventDefault();const id=e.dataTransfer.getData('text/material-id')||draggingId;setDraggingId(null);setDragOverGroup(null);if(id)void setAssetGroup(id,'')}}>待确认 <span>{pendingCount}</span></button>
    <h3>主分类 <small>{draggingId?'拖到分类即可归类':''}</small></h3>
    {groups.map(g=><button key={g} className={`${groupFilter===g?'active ':''}${draggingId?'drop-ready ':''}${dragOverGroup===g?'drop-target':''}`.trim()} onClick={()=>setGroupFilter(g)} onDragOver={e=>{if(!draggingId)return;e.preventDefault();e.dataTransfer.dropEffect='move';setDragOverGroup(g)}} onDrop={e=>{e.preventDefault();const id=e.dataTransfer.getData('text/material-id')||draggingId;setDraggingId(null);setDragOverGroup(null);if(id)void setAssetGroup(id,g)}}>{g}<span>{groupCounts[g]||0}</span></button>)}
   </nav>
   <div className="library-gallery">
    <div className="library-tagfilter" aria-label="标签筛选">
     {dimensions.map(dim=><div key={dim} className="library-taggroup"><h4>{dimensionNames[dim]}</h4><div className="library-tagchips">{catalog?.taxonomy.labels[dim].map(v=><Chip key={v} active={picked[dim].has(v)} onClick={()=>togglePicked(dim,v)}>{v}</Chip>)}{!catalog?.taxonomy.labels[dim].length&&<span className="muted">加载中…</span>}</div></div>)}
    </div>
    <div className="library-status">
     <span>当前：<b>{groupName}</b> · {visible.length} 件结果</span>
     {pickedList.length>0&&<span className="library-status-tags">已选标签：{pickedList.map(t=><em key={t.dim+t.value}>{dimensionNames[t.dim]}·{t.value}</em>)}</span>}
     {pickedList.length>0&&<button className="quiet" onClick={clearPicked}>清除标签</button>}
     <span className="library-status-actions"><button className="quiet" onClick={()=>setSelected(old=>new Set([...old,...visible.map(a=>a.id)]))}>全选当前结果</button>{selected.size>0&&<button className="quiet" onClick={()=>setSelected(new Set())}>清空选择</button>}</span>
    </div>
    <div className="library-grid">{visible.map(a=>{const labels=labelsOf(a);const chips=[a.group||'待确认',...labels.content,...labels.style,...labels.color];return <div key={a.id} className={`library-card ${selected.has(a.id)?'selected':''} ${draggingId===a.id?'dragging':''}`}>
      <button className="library-card-main" draggable={!!catalog&&!busy} aria-pressed={selected.has(a.id)} aria-label={`选择素材：${a.name}`} onDragStart={e=>{e.dataTransfer.setData('text/material-id',a.id);e.dataTransfer.effectAllowed='move';setDraggingId(a.id)}} onDragEnd={()=>{setDraggingId(null);setDragOverGroup(null)}} onClick={()=>toggle(a.id)}><div className="library-thumb"><img src={a.src} alt={a.name} loading="lazy"/><span className="library-check">{selected.has(a.id)&&<Check/>}</span></div><strong>{a.name}</strong></button>
      <div className="library-chips"><span className={a.group?'':'chip-pending'}>{a.group||'待确认'}</span>{chips.slice(1,4).map((v,i)=><span key={i}>{v}</span>)}{chips.length>4&&<span className="muted">+{chips.length-4}</span>}</div>
      <label className="library-card-group"><span>分类</span><select aria-label={`设置${a.name}的分类`} value={a.group||''} disabled={busy||!catalog} onChange={e=>void setAssetGroup(a.id,e.target.value)}><option value="">待确认</option>{groups.map(g=><option key={g} value={g}>{g}</option>)}</select></label>
      <div className="library-card-actions"><button className="library-edit" aria-label={`编辑${a.name}的标签`} onClick={()=>openEditor(a)}><Pencil/>编辑标签</button>{(a.sourceImage||a.sourceUrl?.startsWith('/uploads/'))&&<><button className="library-edit" aria-label={`再次识别${a.name}`} disabled={busy} onClick={()=>void classify([a.id])}><RefreshCw/>再次识别</button><button className="library-edit" aria-label={`再次编辑${a.name}`} disabled={busy} onClick={()=>void request('/reopen',{id:a.id}).then(()=>onImport()).catch(e=>setError(e.message))}><Scissors/>再次编辑</button><button className="library-edit danger" aria-label={`删除${a.name}`} disabled={busy} onClick={()=>void removeAsset(a)}><Trash2/>删除</button></>}</div>
     </div>})}</div>
    {!visible.length&&<div className="library-empty">没有匹配的素材。请调整或清除筛选条件，或导入新素材。</div>}
   </div>
  </div>
  <Dialog open={!!editing} onOpenChange={open=>{if(!open)setEditing(null)}}><DialogContent className="journal-dialog material-editor"><DialogTitle>编辑素材{editing?`：${editing.name}`:''}</DialogTitle><DialogDescription>修改主分类与标签，保存后立即生效。</DialogDescription>
   {editing&&<>
    <div className="material-editor-head"><img src={editing.src} alt={editing.name}/><label>主分类<select aria-label="素材主分类" value={draftGroup} onChange={e=>setDraftGroup(e.target.value)}><option value="">待确认（暂不归入分类）</option>{groups.map(g=><option key={g} value={g}>{g}</option>)}</select></label></div>
    {dimensions.map(dim=><div key={dim} className="material-editor-dim"><h4>{dimensionNames[dim]}</h4><div className="library-tagchips">{catalog?.taxonomy.labels[dim].map(v=><Chip key={v} active={draftLabels[dim].includes(v)} onClick={()=>toggleDraftLabel(dim,v)}>{v}</Chip>)}</div><div className="library-new-category"><input aria-label={`新增${dimensionNames[dim]}标签`} placeholder={`新增${dimensionNames[dim]}标签`} value={newLabel[dim]} maxLength={12} onChange={e=>setNewLabel(old=>({...old,[dim]:e.target.value}))}/><button aria-label={`添加${dimensionNames[dim]}标签`} disabled={!newLabel[dim].trim()||busy} onClick={()=>void addLabel(dim,newLabel[dim]).then(async msg=>{if(msg){setError(msg);return;}const name=newLabel[dim].trim();setNewLabel(old=>({...old,[dim]:''}));setDraftLabels(old=>({...old,[dim]:old[dim].includes(name)?old[dim]:[...old[dim],name]}));})}><Plus/></button></div></div>)}
    <div className="row"><button className="outline" onClick={()=>setEditing(null)}>取消</button><button className="primary" disabled={saving} onClick={()=>void saveEditor()}>{saving?'保存中…':'保存修改'}</button></div>
   </>}
  </DialogContent></Dialog>
  <Dialog open={review} onOpenChange={setReview}><DialogContent className="journal-dialog classification-review"><DialogTitle>确认整理建议</DialogTitle><DialogDescription>勾选要保存的结果，可逐条调整后再保存。整理不会改变素材图片，也不会改变已放入手帐的内容。</DialogDescription>{error&&<p className="library-error" role="alert">{error}</p>}{job?.message&&<p>{job.message}</p>}<div className="row"><button className="quiet" onClick={()=>setAccepted(new Set(job?.proposals.map(p=>p.id)))}>全选建议</button><button className="quiet" onClick={()=>setAccepted(new Set())}>取消全选</button><span>{accepted.size} 件已选</span></div><div className="classification-results">{job?.proposals.map(p=>{const a=assets.find(a=>a.id===p.id);const adj=adjusted[p.id]||{group:'',labels:emptyLabels()};const pending=!!p.review?.pending||!adj.group;return <div key={p.id} className="classification-row">
     <input type="checkbox" aria-label={`保存${a?.name}的整理结果`} checked={accepted.has(p.id)} onChange={()=>setAccepted(old=>{const n=new Set(old);if(n.has(p.id))n.delete(p.id);else n.add(p.id);return n})}/>
     <img src={a?.src} alt={a?.name||''}/>
     <div className="classification-detail">
      <strong>{a?.name}</strong>
      <p>主分类：<select aria-label={`${a?.name}的建议主分类`} value={adj.group} onChange={e=>setAdjusted(old=>({...old,[p.id]:{...adj,group:e.target.value}}))}><option value="">待确认</option>{groups.map(g=><option key={g} value={g}>{g}</option>)}</select>{pending&&<em className="chip-pending">待确认</em>}</p>
      {dimensions.map(dim=>{const list=adj.labels[dim];return list.length>0&&<p key={dim}>{dimensionNames[dim]}：{list.map(v=><button key={v} type="button" className="chip-select active chip-removable" aria-label={`移除${dimensionNames[dim]}标签${v}`} onClick={()=>setAdjusted(old=>({...old,[p.id]:{...adj,labels:{...adj.labels,[dim]:adj.labels[dim].filter(x=>x!==v)}}}))}>{v}<X/></button>)}</p>})}
      {p.review?.pending?(p.review.reason||p.reason)&&<small>待确认原因：{p.review.reason||p.reason}</small>:p.reason&&<small>判断依据：{p.reason}</small>}
      {a?.manual?.group||a?.manual?.labels?<small>已保护手动分类/标签，AI 保存时不会覆盖。</small>:null}
     </div>
    </div>})}{job?.errors.map(e=><p key={e.id} className="library-error">{assets.find(a=>a.id===e.id)?.name}：{e.message}</p>)}</div><div className="row"><button className="outline" onClick={()=>setReview(false)}>暂不保存</button><button className="primary" disabled={saving||!accepted.size||isRunning} onClick={()=>void applySuggestions()}>{saving?'保存中…':`保存 ${accepted.size} 件`}</button></div></DialogContent></Dialog>
 </section>;
}
