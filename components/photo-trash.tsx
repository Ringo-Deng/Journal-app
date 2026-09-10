'use client';
/* oxlint-disable next/no-img-element -- Local photo thumbnails. */
import {useEffect,useState} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
import type {PhotoTrashEntry} from '@/lib/photo-mask-state';
type Props={open:boolean;onClose:()=>void;onRestore:(entry:PhotoTrashEntry)=>Promise<void>;onPrepare:()=>Promise<string[]>};
async function request<T>(path:string,method='GET',protectedSources?:string[]):Promise<T>{const r=await fetch('/api/photo-trash'+path,{method,cache:'no-store',...(protectedSources?{headers:{'content-type':'application/json'},body:JSON.stringify({protectedSources})}:{})});const data=await r.json() as T&{error?:string};if(!r.ok)throw Error(data.error||'照片回收站操作失败。');return data;}
export default function PhotoTrash({open,onClose,onRestore,onPrepare}:Props){
 const [entries,setEntries]=useState<PhotoTrashEntry[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[confirm,setConfirm]=useState<string|null>(null);
 useEffect(()=>{if(!open)return;let live=true;setMessage('');setConfirm(null);setBusy(true);void request<{entries:PhotoTrashEntry[]}>('').then(d=>{if(live)setEntries(d.entries);}).catch(e=>{if(live)setMessage(e.message);}).finally(()=>{if(live)setBusy(false);});return()=>{live=false;};},[open]);
 async function action(id:string,restore=false){
  setBusy(true);setMessage('');
  try{
   const protectedSources=await onPrepare();
   if(restore){await onRestore(await request<PhotoTrashEntry>('/'+id+'/restore','POST'));setMessage('原图已恢复。');}
   else if(id==='clear'){const result=await request<{deleted:number;blocked:number}>('/clear','POST',protectedSources);setMessage(`已删除 ${result.deleted} 项，${result.blocked} 项仍被引用，已保留。`);}
   else {await request('/'+id,'DELETE',protectedSources);setMessage('已彻底删除。');}
   setEntries((await request<{entries:PhotoTrashEntry[]}>('')).entries);setConfirm(null);
  }catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
 }
 return <Dialog open={open} onOpenChange={v=>{if(!v&&!busy)onClose();}}><DialogContent className="journal-dialog photo-trash-dialog"><DialogTitle>照片回收站</DialogTitle><DialogDescription>原图保留在原位置。恢复时保留后续编辑；仍被手帐或历史备份引用的照片不能彻底删除。</DialogDescription>
  <button className="quiet" disabled={busy||!entries.length} onClick={()=>setConfirm('clear')}>清空可安全删除的项目</button>
  {confirm&&<div className="photo-trash-confirm"><p>{confirm==='clear'?'彻底删除所有未被引用的原图？':'彻底删除这张原图？'}此操作无法撤销。</p><button className="quiet" disabled={busy} onClick={()=>void action(confirm)}>确认彻底删除</button><button className="quiet" disabled={busy} onClick={()=>setConfirm(null)}>取消</button></div>}
  <div className="photo-trash-list">{entries.map(entry=><div className="photo-trash-item" key={entry.id}><img src={entry.src} alt="回收站原图"/><div><small>{new Date(entry.createdAt).toLocaleString()}</small><div><button className="quiet" disabled={busy} onClick={()=>void action(entry.id,true)}>恢复原图</button><button className="quiet" disabled={busy} onClick={()=>setConfirm(entry.id)}>彻底删除</button></div></div></div>)}</div>
  {!entries.length&&!busy&&<p>照片回收站为空。</p>}<p role="status">{busy?'正在处理…':message}</p>
 </DialogContent></Dialog>;
}
