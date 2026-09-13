'use client';
/* oxlint-disable next/no-img-element -- Local photo previews are served by the private journal service. */
import {useEffect,useRef,useState} from 'react';
import {CheckCheck,Download,Eye,FolderOpen,ImagePlus,Loader2,Plus,Scissors,Trash2,Upload,X} from 'lucide-react';
import {Checkbox} from '@/components/ui/checkbox';

export type PhotoLibraryItem={id:string;src:string;thumbnailSrc:string;originalName:string;mime:string;size:number;width:number;height:number;capturedAt:string;importedAt:string};
type Page={items:PhotoLibraryItem[];total:number;nextOffset:number|null;warning?:string};

async function result<T>(response:Response):Promise<T>{const data=await response.json() as T&{error?:string};if(!response.ok)throw Error(data.error||'照片操作失败。');return data}
const day=(value:string)=>new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
const month=(value:string)=>new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'long'}).format(new Date(value));
const size=(value:number)=>value>=1024*1024?`${(value/1024/1024).toFixed(1)} MB`:`${Math.max(1,Math.round(value/1024))} KB`;

export default function PhotoLibrary({onInsert,onProcess,protectedSources}:{onInsert:(sources:string[])=>boolean;onProcess:(item:PhotoLibraryItem)=>Promise<void>;protectedSources:string[]}){
 const photosInput=useRef<HTMLInputElement>(null),folderInput=useRef<HTMLInputElement>(null),restoreInput=useRef<HTMLInputElement>(null);
 const [items,setItems]=useState<PhotoLibraryItem[]>([]),[total,setTotal]=useState(0),[nextOffset,setNextOffset]=useState<number|null>(null),[selected,setSelected]=useState<string[]>([]),[preview,setPreview]=useState<PhotoLibraryItem|null>(null),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[message,setMessage]=useState('');
 async function load(reset=true){
  const offset=reset?0:nextOffset;if(offset===null)return;setLoading(true);
  try{const page=await result<Page>(await fetch(`/api/photos?offset=${offset}&limit=60`,{cache:'no-store'}));setItems(old=>reset?page.items:[...new Map([...old,...page.items].map(item=>[item.id,item])).values()]);setTotal(page.total);setNextOffset(page.nextOffset);if(page.warning)setMessage(page.warning)}catch(error){setMessage((error as Error).message)}finally{setLoading(false)}
 }
 useEffect(()=>{void load()},[]);
 async function importFiles(files:FileList|null){
  if(!files?.length)return;setBusy(true);let added=0,duplicates=0;const errors:string[]=[];
  try{
   const list=Array.from(files);
   for(let index=0;index<list.length;index++){
    const file=list[index];setMessage(`正在保存 ${index+1} / ${list.length}：${file.name}`);
    try{
     if(file.size>80*1024*1024)throw Error('单张照片不能超过 80 MB');
     const params=new URLSearchParams({filename:file.webkitRelativePath||file.name,lastModified:String(file.lastModified)});
     const imported=await result<{duplicate:boolean}>(await fetch('/api/photos/import?'+params,{method:'POST',headers:{'Content-Type':file.type||'application/octet-stream'},body:file}));
     if(imported.duplicate)duplicates++;else added++;
    }catch(error){errors.push(`${file.name}：${(error as Error).message}`)}
   }
   await load(true);setMessage(`已新增 ${added} 张照片${duplicates?`，跳过 ${duplicates} 张重复照片`:''}${errors.length?`；${errors.length} 张未导入：${errors.join('；')}`:'。'}`);
  }finally{setBusy(false);if(photosInput.current)photosInput.current.value='';if(folderInput.current)folderInput.current.value=''}
 }
 function insert(){const sources=items.filter(item=>selected.includes(item.id)).map(item=>item.src);if(!sources.length)return;if(onInsert(sources)){setSelected([]);setMessage(`已将 ${sources.length} 张照片放入当前跨页。`)}}
 async function processPhoto(item:PhotoLibraryItem){setBusy(true);try{await onProcess(item);setPreview(null)}catch(error){setMessage((error as Error).message)}finally{setBusy(false)}}
 async function remove(item:PhotoLibraryItem){
  if(!window.confirm(`从照片库删除「${item.originalName}」？电脑上的原文件不会受影响。`))return;setBusy(true);
  try{await result(await fetch('/api/photos/'+item.id,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({protectedSources})}));setPreview(null);setSelected(ids=>ids.filter(id=>id!==item.id));await load(true);setMessage('照片已从拾光手帐中删除，电脑原文件未改动。')}catch(error){setMessage((error as Error).message)}finally{setBusy(false)}
 }
 async function restore(file?:File){
  if(!file)return;setBusy(true);setMessage('正在恢复照片库，已有照片会自动跳过。');
  try{const restored=await result<{restored:number;duplicates:number}>(await fetch('/api/photos/restore',{method:'POST',headers:{'Content-Type':'application/x-shiguang-photo-library'},body:file}));await load(true);setMessage(`已恢复 ${restored.restored} 张照片${restored.duplicates?`，跳过 ${restored.duplicates} 张已有照片`:''}。`)}catch(error){setMessage((error as Error).message)}finally{setBusy(false);if(restoreInput.current)restoreInput.current.value=''}
 }
 const grouped=new Map<string,PhotoLibraryItem[]>();for(const item of items){const key=month(item.capturedAt);grouped.set(key,[...(grouped.get(key)||[]),item])}
 return <section className="photo-library" aria-label="照片库">
  <header className="photo-library-tools">
   <div><strong>照片库</strong><small>{total?`${total} 张 · 按拍摄时间排列`:'原片会按拍摄时间自动排列'}</small></div>
   <button className="primary" disabled={busy} onClick={()=>photosInput.current?.click()}><ImagePlus/>导入照片</button>
   <button className="outline" disabled={busy} onClick={()=>folderInput.current?.click()}><FolderOpen/>导入文件夹</button>
   <button className="outline" disabled={busy||!items.length} onClick={()=>{window.location.href='/api/photos/backup'}}><Download/>导出照片库</button>
   <button className="outline" disabled={busy} onClick={()=>restoreInput.current?.click()}><Upload/>恢复照片库</button>
  </header>
  <div className="photo-library-selection">
   <span>{selected.length?`已选择 ${selected.length} 张`:'单击照片即可选择'}</span>
   <button className="quiet" disabled={busy||!items.length} onClick={()=>setSelected(items.map(item=>item.id))}><CheckCheck/>选择当前已加载照片</button>
   <button className="quiet" disabled={busy||!selected.length} onClick={()=>setSelected([])}>清空选择</button>
   <button className="primary" disabled={busy||!selected.length} onClick={insert}><Plus/>添加到当前跨页</button>
  </div>
  <div className="photo-library-scroll" aria-busy={loading||busy}>
   {loading&&!items.length?<div className="photo-library-empty"><Loader2 className="spinning"/>正在整理照片时间线…</div>:!items.length?<div className="photo-library-empty"><ImagePlus/><strong>还没有照片</strong><span>导入照片或文件夹后，会自动按时间排好。</span></div>:[...grouped].map(([label,photos])=><section className="photo-month" key={label}><h3>{label}<small>{photos.length} 张</small></h3><div className="photo-grid">{photos.map(item=><article className={selected.includes(item.id)?'chosen':''} key={item.id}>
    <label htmlFor={`photo-select-${item.id}`} title={selected.includes(item.id)?'点击取消选择':'点击选择照片'}><img src={item.thumbnailSrc} alt={item.originalName} draggable={false}/><Checkbox id={`photo-select-${item.id}`} aria-label={`选择${item.originalName}`} checked={selected.includes(item.id)} disabled={busy} onCheckedChange={checked=>setSelected(ids=>checked?[...ids.filter(id=>id!==item.id),item.id]:ids.filter(id=>id!==item.id))}/></label>
    <div><span title={item.originalName}>{item.originalName}</span><small>{day(item.capturedAt)}</small></div>
    <button className="quiet" disabled={busy} onClick={()=>setPreview(item)}><Eye/>预览</button>
   </article>)}</div></section>)}
   {nextOffset!==null&&<button className="outline photo-load-more" disabled={loading||busy} onClick={()=>void load(false)}>{loading?<Loader2 className="spinning"/>:null}加载更早照片</button>}
  </div>
  <footer className="photo-library-status" role="status">{busy&&!message?'正在处理照片…':message||'照片只保存在本机；导入不会自动改变当前跨页。'}</footer>
  {preview&&<div className="photo-preview-overlay" role="dialog" aria-modal="true" aria-label="照片预览"><div className="photo-preview-card"><button className="quiet photo-preview-close" aria-label="关闭照片预览" onClick={()=>setPreview(null)}><X/></button><img src={preview.src} alt={preview.originalName}/><div><strong>{preview.originalName}</strong><span>{day(preview.capturedAt)} · {preview.width} × {preview.height} · {size(preview.size)}</span></div><footer><button className="outline danger" disabled={busy} onClick={()=>void remove(preview)}><Trash2/>删除照片</button><button className="outline" disabled={busy} onClick={()=>void processPhoto(preview)}><Scissors/>送到素材处理</button><button className="primary" disabled={busy} onClick={()=>{if(onInsert([preview.src])){setPreview(null);setSelected([])}}}><Plus/>添加到当前跨页</button></footer></div></div>}
  <input hidden ref={photosInput} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" multiple onChange={event=>void importFiles(event.target.files)}/>
  <input hidden ref={folderInput} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" multiple {...({webkitdirectory:'',directory:''} as Record<string,string>)} onChange={event=>void importFiles(event.target.files)}/>
  <input hidden ref={restoreInput} type="file" accept=".shiguang-photos,application/x-shiguang-photo-library" onChange={event=>void restore(event.target.files?.[0])}/>
 </section>;
}
