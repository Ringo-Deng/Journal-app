'use client';
/* oxlint-disable next/no-img-element -- The picker previews local material-library images. */
import {useEffect,useMemo,useState} from 'react';
import {Layers,Search,X} from 'lucide-react';
import type {Asset} from '@/lib/journal';

const hiddenKey='journal-hidden-materials-v1';

export default function PaperMaterialPicker({assets,onChoose,onClose}:{assets:Asset[];onChoose:(asset:Asset)=>void;onClose:()=>void}){
 const [query,setQuery]=useState(''),[group,setGroup]=useState('all'),[hiddenIds,setHiddenIds]=useState<Set<string>>(new Set());
 useEffect(()=>{try{const saved=JSON.parse(window.localStorage.getItem(hiddenKey)||'[]');if(Array.isArray(saved))setHiddenIds(new Set(saved.filter((id):id is string=>typeof id==='string')))}catch{/* Hidden built-ins are optional browser preferences. */}},[]);
 const available=useMemo(()=>assets.filter(asset=>!hiddenIds.has(asset.id)),[assets,hiddenIds]);
 const groups=useMemo(()=>[...new Set(available.map(asset=>asset.group).filter((value):value is string=>!!value&&value!=='未分类'))].sort((a,b)=>a.localeCompare(b,'zh-CN')),[available]);
 const visible=useMemo(()=>{
  const needle=query.trim().toLowerCase();
  return [...available].reverse().filter(asset=>{
   if(group!=='all'&&(asset.group||'未分类')!==group)return false;
   if(!needle)return true;
   const labels=asset.labels;
   return [asset.name,asset.group||'未分类',...(asset.tags||[]),...(labels?.content||[]),...(labels?.style||[]),...(labels?.color||[])].join(' ').toLowerCase().includes(needle);
  });
 },[available,group,query]);
 return <section className="paper-material-picker" aria-label="从素材库选择内页">
  <div className="paper-material-picker-heading"><span><Layers/><span><strong>从素材库选择</strong><small>选择一张图片作为整页背景，页面内容不会改变。</small></span></span><button className="quiet" aria-label="关闭素材库选择" onClick={onClose}><X/></button></div>
  <div className="paper-material-picker-filters">
   <label><Search/><input aria-label="搜索内页素材" placeholder="搜索名称、标签或分类" value={query} onChange={event=>setQuery(event.target.value)}/></label>
   <select aria-label="筛选素材主分类" value={group} onChange={event=>setGroup(event.target.value)}><option value="all">全部分类</option><option value="未分类">未分类</option>{groups.map(name=><option key={name} value={name}>{name}</option>)}</select>
  </div>
  <div className="paper-material-picker-grid">
   {visible.map(asset=><button key={asset.id} aria-label={`使用 ${asset.name} 作为自定义内页`} onClick={()=>onChoose(asset)}><span><img src={asset.src} alt="" loading="lazy"/></span><strong>{asset.name}</strong><small>{asset.group||'未分类'}</small></button>)}
   {!visible.length&&<p>{available.length?'没有匹配的素材，请换个关键词或分类。':'素材库还是空的，请先在素材库导入图片。'}</p>}
  </div>
 </section>;
}
