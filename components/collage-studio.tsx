'use client';
import {useCallback,useEffect,useLayoutEffect} from 'react';
import {bookFormat,type Book,type CollageTemplate,type PaperFeel,type Piece,type Spread} from '@/lib/journal';

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
  version:2;
  copiedAt:number;
  sourceBookId:string;
  sourceBookTitle:string;
  template:CollageTemplate;
};

const CLIPBOARD_KEY='shiguang.groupClipboard';
const AUTOSAVE_SETTLE_MS=650;

function readClipboard():ClipboardPayload|null{
  try{
    const raw=localStorage.getItem(CLIPBOARD_KEY);
    if(!raw)return null;
    const value=JSON.parse(raw) as ClipboardPayload|{version?:number;template?:CollageTemplate;sourceBookId?:string;sourceBookTitle?:string;copiedAt?:number};
    if(!value?.template||!Array.isArray(value.template.elements)||typeof value.template.ratio!=='number')return null;
    return {
      version:2,
      copiedAt:Number(value.copiedAt)||Date.now(),
      sourceBookId:String(value.sourceBookId||''),
      sourceBookTitle:String(value.sourceBookTitle||''),
      template:value.template,
    };
  }catch{return null;}
}

function editingTarget(target:EventTarget|null){
  const el=target instanceof Element?target:null;
  return !!el?.closest('input,textarea,select,[contenteditable="true"],[role="dialog"],[role="alertdialog"]');
}

export default function CollageStudio({onInsert}:Props){
  const copySelection=useCallback(async()=>{
    const canvas=document.querySelector<HTMLElement>('.open-book');
    if(!canvas)return;
    const selectedNodes=Array.from(canvas.querySelectorAll<HTMLElement>('.piece.selected[data-piece-id]'));
    const ids=[...new Set(selectedNodes.map(node=>node.dataset.pieceId).filter((id):id is string=>!!id))];
    if(!ids.length)return;
    const measuredHeights=new Map(selectedNodes.map(node=>{
      const height=canvas.clientHeight?parseFloat(getComputedStyle(node).height)/canvas.clientHeight*100:NaN;
      return [node.dataset.pieceId||'',height] as const;
    }));
    // Main editor autosaves after 550 ms. Let that settle so a just-moved group copies its newest geometry.
    await new Promise(resolve=>window.setTimeout(resolve,AUTOSAVE_SETTLE_MS));
    try{
      const response=await fetch('/api/state');
      const state=await response.json() as {books?:Book[];error?:string};
      if(!response.ok||!Array.isArray(state.books))return;
      let sourceBook:Book|undefined,sourceSpread:Spread|undefined;
      for(const candidate of state.books){
        const spreads=[candidate.flyleaf,...candidate.spreads].filter((item):item is Spread=>!!item);
        const found=spreads.find(item=>ids.every(id=>item.elements.some(piece=>piece.id===id)));
        if(found){sourceBook=candidate;sourceSpread=found;break;}
      }
      if(!sourceBook||!sourceSpread)return;
      const selectedIds=new Set(ids);
      const pieces=sourceSpread.elements.filter(piece=>selectedIds.has(piece.id));
      if(!pieces.length)return;
      const minX=Math.min(...pieces.map(piece=>piece.x));
      const minY=Math.min(...pieces.map(piece=>piece.y));
      const elements:Piece[]=pieces.map(piece=>{
        const measured=measuredHeights.get(piece.id);
        return {
          ...piece,
          x:piece.x-minX+6,
          y:piece.y-minY,
          h:Number.isFinite(measured)?measured:piece.h,
          locked:false,
          dayId:undefined,
          originIds:undefined,
          sourceDayIds:undefined,
          paragraphIndex:undefined,
          forParagraph:undefined,
        };
      });
      const payload:ClipboardPayload={
        version:2,
        copiedAt:Date.now(),
        sourceBookId:sourceBook.id,
        sourceBookTitle:sourceBook.title,
        template:{
          id:crypto.randomUUID(),
          name:elements.length>1?'复制的组合':'复制的素材',
          elements,
          ratio:bookFormat(sourceBook).ratio,
        },
      };
      localStorage.setItem(CLIPBOARD_KEY,JSON.stringify(payload));
    }catch{/* Copy failure should not interrupt editing. */}
  },[]);

  useLayoutEffect(()=>{
    const simplifyControls=()=>{
      for(const button of Array.from(document.querySelectorAll<HTMLButtonElement>('.creation-tools button'))){
        const label=button.querySelector('span')?.textContent?.trim();
        if(label==='旅行拼贴'||label==='组合剪贴板'){
          button.hidden=true;
          button.tabIndex=-1;
          button.setAttribute('aria-hidden','true');
        }
      }
      for(const button of Array.from(document.querySelectorAll<HTMLButtonElement>('.cluster-tools button'))){
        const label=button.textContent?.trim();
        if(label==='保存组合'){
          button.hidden=true;
          button.tabIndex=-1;
          button.setAttribute('aria-hidden','true');
        }else if(label==='复制组合'){
          button.textContent='复制副本';
          button.title='在当前跨页复制一份 · Ctrl/Cmd+D';
        }
      }
    };
    simplifyControls();
    const observer=new MutationObserver(simplifyControls);
    observer.observe(document.body,{childList:true,subtree:true,characterData:true});
    return()=>observer.disconnect();
  },[]);

  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{
      if(event.repeat||editingTarget(event.target)||!(event.metaKey||event.ctrlKey)||event.altKey)return;
      const shortcut=event.key.toLowerCase();
      if(shortcut==='c'){
        if(!document.querySelector('.open-book .piece.selected[data-piece-id]'))return;
        event.preventDefault();
        void copySelection();
      }else if(shortcut==='v'){
        if(!document.querySelector('.open-book'))return;
        const payload=readClipboard();
        if(!payload)return;
        event.preventDefault();
        onInsert(payload.template);
      }
    };
    window.addEventListener('keydown',key,{capture:true});
    return()=>window.removeEventListener('keydown',key,{capture:true});
  },[copySelection,onInsert]);

  return null;
}
