'use client';
import {useCallback,useEffect,useState} from 'react';
import {Copy,ClipboardPaste,Trash2} from 'lucide-react';
import {bookFormat,type Book,type CollageTemplate,type PaperFeel,type Piece,type Spread} from '@/lib/journal';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';

type Props={
  open:boolean;
  onClose:()=>void;
  feel?:PaperFeel;
  color:string;
  onFeel:(f:PaperFeel)=>void;
  onColor:(c:string)=>void;
  onCream:()=>void;
  onCheck:()=>void;
  onTidy:()=>void;
  templates:CollageTemplate[];
  onInsert:(t:CollageTemplate)=>void;
};

type ClipboardPayload={
  version:1;
  copiedAt:number;
  sourceBookId:string;
  sourceBookTitle:string;
  template:CollageTemplate;
};

const CLIPBOARD_KEY='shiguang.groupClipboard';

function readClipboard():ClipboardPayload|null{
  try{
    const raw=localStorage.getItem(CLIPBOARD_KEY);
    if(!raw)return null;
    const value=JSON.parse(raw) as ClipboardPayload;
    if(value?.version!==1||!value.template||!Array.isArray(value.template.elements)||typeof value.template.ratio!=='number')return null;
    return value;
  }catch{return null;}
}

export default function CollageStudio(props:Props){
  const {open,onClose,onInsert}=props;
  const [clipboard,setClipboard]=useState<ClipboardPayload|null>(null);
  const [status,setStatus]=useState('');

  useEffect(()=>{setClipboard(readClipboard());},[]);

  const flashCopyButton=useCallback((label:string)=>{
    const button=document.querySelector<HTMLButtonElement>('.cluster-tools button[data-group-clipboard-copy="true"]');
    if(!button)return;
    button.textContent=label;
    window.setTimeout(()=>{if(button.isConnected)button.textContent='复制组合';},1200);
  },[]);

  const copySelectedGroup=useCallback(async()=>{
    try{
      const selectedNodes=Array.from(document.querySelectorAll<HTMLElement>('.open-book .piece.selected[data-piece-id]'));
      const ids=[...new Set(selectedNodes.map(node=>node.dataset.pieceId).filter((id):id is string=>!!id))];
      if(ids.length<2)throw Error('请先选中一个贴纸组合。');
      const response=await fetch('/api/state');
      const state=await response.json() as {books?:Book[];error?:string};
      if(!response.ok||!Array.isArray(state.books))throw Error(state.error||'读取当前手帐失败。');
      let sourceBook:Book|undefined,sourceSpread:Spread|undefined;
      for(const candidate of state.books){
        const spreads=[candidate.flyleaf,...candidate.spreads].filter((spread):spread is Spread=>!!spread);
        const found=spreads.find(spread=>ids.every(id=>spread.elements.some(piece=>piece.id===id)));
        if(found){sourceBook=candidate;sourceSpread=found;break;}
      }
      if(!sourceBook||!sourceSpread)throw Error('没有找到当前选中的组合，请重新选择后再复制。');
      const canvas=selectedNodes[0]?.closest<HTMLElement>('.open-book');
      if(!canvas)throw Error('当前纸面尚未准备好。');
      const canvasRect=canvas.getBoundingClientRect();
      if(!canvasRect.width||!canvasRect.height)throw Error('当前纸面尺寸异常，请重新打开手帐。');
      const nodeById=new Map(selectedNodes.map(node=>[node.dataset.pieceId||'',node]));
      const rects=selectedNodes.map(node=>node.getBoundingClientRect());
      const groupX=(Math.min(...rects.map(rect=>rect.left))-canvasRect.left)/canvasRect.width*100;
      const groupY=(Math.min(...rects.map(rect=>rect.top))-canvasRect.top)/canvasRect.height*100;
      const selectedIds=new Set(ids);
      const pieces=sourceSpread.elements.filter(piece=>selectedIds.has(piece.id));
      const elements:Piece[]=pieces.map(piece=>{
        const node=nodeById.get(piece.id);
        const cssHeight=node?parseFloat(getComputedStyle(node).height):NaN;
        const measuredHeight=Number.isFinite(cssHeight)&&canvas.clientHeight?cssHeight/canvas.clientHeight*100:piece.h;
        return {
          ...piece,
          x:piece.x-groupX+6,
          y:piece.y-groupY,
          h:measuredHeight,
          locked:false,
          dayId:undefined,
          originIds:undefined,
          sourceDayIds:undefined,
          paragraphIndex:undefined,
          forParagraph:undefined,
        };
      });
      const nameInput=document.querySelector<HTMLInputElement>('.cluster-tools input[aria-label="组合名称"]');
      const template:CollageTemplate={
        id:crypto.randomUUID(),
        name:(nameInput?.value.trim()||`贴纸组合 ${elements.length} 件`).slice(0,40),
        elements,
        ratio:bookFormat(sourceBook).ratio,
      };
      const payload:ClipboardPayload={
        version:1,
        copiedAt:Date.now(),
        sourceBookId:sourceBook.id,
        sourceBookTitle:sourceBook.title,
        template,
      };
      localStorage.setItem(CLIPBOARD_KEY,JSON.stringify(payload));
      setClipboard(payload);
      setStatus(`已复制 ${elements.length} 个素材，可切换到其他笔记本粘贴。`);
      flashCopyButton('已复制');
    }catch(error){
      const message=error instanceof Error?error.message:'复制组合失败。';
      setStatus(message);
      flashCopyButton('复制失败');
    }
  },[flashCopyButton]);

  useEffect(()=>{
    const syncLabels=()=>{
      for(const button of Array.from(document.querySelectorAll<HTMLButtonElement>('.creation-tools button'))){
        const span=button.querySelector('span');
        if(span?.textContent?.trim()==='旅行拼贴'){
          span.textContent='组合剪贴板';
          button.setAttribute('aria-label','组合剪贴板');
          button.title=clipboard?'粘贴已复制的组合':'跨笔记本复制和粘贴组合';
        }
      }
      for(const button of Array.from(document.querySelectorAll<HTMLButtonElement>('.cluster-tools button'))){
        if(button.textContent?.trim()==='保存组合')button.textContent='复制组合';
        if(button.textContent?.trim()==='复制组合'){
          button.dataset.groupClipboardCopy='true';
          button.setAttribute('aria-label','复制组合到跨笔记本剪贴板');
          button.title='复制后可切换到其他笔记本粘贴';
        }
      }
    };
    syncLabels();
    const observer=new MutationObserver(syncLabels);
    observer.observe(document.body,{childList:true,subtree:true,characterData:true});
    return()=>observer.disconnect();
  },[clipboard]);

  useEffect(()=>{
    const intercept=(event:MouseEvent)=>{
      const target=event.target instanceof Element?event.target.closest<HTMLButtonElement>('button[data-group-clipboard-copy="true"]'):null;
      if(!target)return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      void copySelectedGroup();
    };
    document.addEventListener('click',intercept,true);
    return()=>document.removeEventListener('click',intercept,true);
  },[copySelectedGroup]);

  useEffect(()=>{if(open)setClipboard(readClipboard());},[open]);

  function clearClipboard(){
    localStorage.removeItem(CLIPBOARD_KEY);
    setClipboard(null);
    setStatus('组合剪贴板已清空。');
  }

  return <Dialog open={open} onOpenChange={value=>!value&&onClose()}>
    <DialogContent className="journal-dialog collage-studio group-clipboard-dialog">
      <DialogTitle>组合剪贴板</DialogTitle>
      <DialogDescription>把一组贴纸、文字或照片复制下来，切换到另一本笔记本后继续粘贴。复制的组合会保留相对位置、大小、旋转和层级关系。</DialogDescription>
      {clipboard?<div className="collage-template-list group-clipboard-list">
        <div className="outline group-clipboard-card">
          <span><strong>{clipboard.template.name}</strong><small>{clipboard.template.elements.length} 个素材 · 来自「{clipboard.sourceBookTitle||'未命名笔记本'}」</small></span>
          <small>{new Date(clipboard.copiedAt).toLocaleString('zh-CN')}</small>
        </div>
        <button className="primary" onClick={()=>onInsert(clipboard.template)}><ClipboardPaste/>粘贴到当前跨页</button>
        <button className="quiet" onClick={clearClipboard}><Trash2/>清空剪贴板</button>
      </div>:<div className="page-elements-empty group-clipboard-empty"><Copy/><strong>剪贴板还是空的</strong><span>在纸面选中一个组合，点击上方「复制组合」，再切换笔记本打开这里。</span></div>}
      {status&&<p className="microcopy" aria-live="polite">{status}</p>}
      <p className="microcopy">旧版“旅行拼贴”中已经保存的组合数据仍保留在原笔记本中，本次不会删除历史数据。</p>
      <button className="outline" onClick={onClose}>回到纸面</button>
    </DialogContent>
  </Dialog>;
}
