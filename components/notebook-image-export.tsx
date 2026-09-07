'use client';
/* oxlint-disable next/no-img-element -- Preview the locally generated PNG without image optimization. */
import {useRef,useState,type CSSProperties} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {SpreadPreview} from './page-turn';
import {bookFormat,type Book,type Spread,type Asset} from '@/lib/journal';
import {exportFontCSS} from '@/lib/export-fonts';
import {toCanvas} from '../vendor/html-to-image/es/index';

export default function NotebookImageExport({book,spread,assets,pageIndex,flyleaf,open,onClose}:{book:Book;spread:Spread;assets:Asset[];pageIndex:number;flyleaf:boolean;open:boolean;onClose:()=>void}){
 const paper=useRef<HTMLDivElement>(null);
 const [side,setSide]=useState('spread'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[image,setImage]=useState('');
 const ratio=bookFormat(book).ratio;
 async function generate(){
  if(!paper.current||busy)return;
  setBusy(true);setError('');setImage('');
  try{
   await document.fonts.ready;
   await Promise.all(Array.from(paper.current.querySelectorAll('img')).map(img=>img.decode()));
   const fontEmbedCSS=await exportFontCSS(spread.elements);
   const full=await toCanvas(paper.current,{pixelRatio:2,fontEmbedCSS,backgroundColor:'#fff',style:{position:'relative',left:'0',top:'0',insetInlineStart:'0',insetBlockStart:'0',margin:'0',transform:'none',containerType:'normal'}});
   const output=document.createElement('canvas');
   output.width=side==='spread'?full.width:Math.floor(full.width/2);output.height=full.height;
   const ctx=output.getContext('2d');if(!ctx)throw Error('浏览器无法生成图片');
   ctx.drawImage(full,side==='right'?full.width/2:0,0,output.width,full.height,0,0,output.width,output.height);
   setImage(output.toDataURL('image/png'));
  }catch(e){setError(e instanceof Error?e.message:'图片生成失败，请重试');}finally{setBusy(false);}
 }
 const filename=`${book.title.replace(/[\\/:*?"<>|]/g,'-')}-${flyleaf?'扉页':`第${pageIndex+1}跨页`}-${side==='spread'?'左右页':side==='left'?'左页':'右页'}.png`;
 return <Dialog open={open} onOpenChange={v=>!v&&!busy&&onClose()}><DialogContent className="journal-dialog image-export-dialog">
  <DialogTitle>导出笔记图片</DialogTitle><DialogDescription>将当前纸面保存为高清 PNG，保留文字、照片和排版。</DialogDescription>
  <label className="export-scope">导出范围<select value={side} disabled={busy} onChange={e=>{setSide(e.target.value);setImage('');}}><option value="spread">当前跨页 · 左右两页</option><option value="left">仅左页</option><option value="right">仅右页</option></select></label>
  {image&&<img className="export-image-preview" src={image} alt="导出图片预览"/>}
  {error&&<p role="alert">{error}</p>}
  <div className="delete-notebook-actions"><button className="outline" disabled={busy} onClick={onClose}>关闭</button>{image?<a className="primary" href={image} download={filename}>保存 PNG 图片</a>:<button className="primary" disabled={busy} onClick={()=>void generate()}>{busy?'正在生成…':'生成图片'}</button>}</div>
  <div className="image-export-source" ref={paper} style={{width:1000,height:1000/ratio,'--spread-ratio':ratio} as CSSProperties}><SpreadPreview book={book} spread={spread} assets={assets} flyleaf={flyleaf} pageIndex={pageIndex}/></div>
 </DialogContent></Dialog>;
}
