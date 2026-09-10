'use client';
import type {PhotoMaskDraft} from '@/lib/photo-mask-state';
import type {Piece} from '@/lib/journal';
import {PHOTO_MASK_SHAPES,maskPath} from '@/lib/photo-mask.mjs';
import './photo-mask.css';
function Range({label,value,min,max,step=1,unit='',onChange}:{label:string;value:number;min:number;max:number;step?:number;unit?:string;onChange:(v:number)=>void}){
 return <label className="photo-mask-range"><span>{label}</span><output>{Math.round(value*10)/10}{unit}</output><input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={e=>onChange(Number(e.target.value))}/></label>;
}
export default function PhotoMaskTools({draft,onShape,onPatch,onRotation,onSize,onApply,onCancel}:{draft:PhotoMaskDraft;onShape:(shape:string)=>void;onPatch:(p:Partial<Piece>)=>void;onRotation:(v:number)=>void;onSize:(axis:'w'|'h',v:number)=>void;onApply:()=>void;onCancel:()=>void}){
 const p=draft.piece;
 return <aside className="photo-mask-panel" data-editor-ui="true" aria-label="照片蒙版设置">
  <h2>照片蒙版</h2><fieldset disabled={draft.generating}>
   <div className="photo-mask-shapes">{Object.entries(PHOTO_MASK_SHAPES).map(([id,name])=><button type="button" key={id} aria-pressed={draft.shape===id} onClick={()=>onShape(id)}><svg viewBox="0 0 100 100" aria-hidden="true"><path d={maskPath(id)}/></svg>{name}</button>)}</div>
   <Range label="取景横向" value={p.crop??50} min={0} max={100} unit="%" onChange={crop=>onPatch({crop})}/>
   <Range label="取景纵向" value={p.cropY??50} min={0} max={100} unit="%" onChange={cropY=>onPatch({cropY})}/>
   <div className="photo-mask-zoom"><span>照片大小</span><output>{Math.round((p.cropZoom??1)*100)}%</output></div>
   <div className="photo-mask-row"><button type="button" disabled={(p.cropZoom??1)<=1} onClick={()=>onPatch({cropZoom:Math.max(1,(p.cropZoom??1)-.1)})}>− 缩小</button><button type="button" disabled={(p.cropZoom??1)>=4} onClick={()=>onPatch({cropZoom:Math.min(4,(p.cropZoom??1)+.1)})}>＋ 放大</button></div>
   <Range label="照片旋转" value={draft.photoRotation} min={-180} max={180} unit="°" onChange={onRotation}/>
   <div className="photo-mask-row"><button type="button" aria-pressed={!!p.flipX} onClick={()=>onPatch({flipX:!p.flipX})}>↔ 水平</button><button type="button" aria-pressed={!!p.flipY} onClick={()=>onPatch({flipY:!p.flipY})}>↕ 垂直</button></div>
   <div className="photo-mask-pair"><Range label="白边宽度" value={(p.cutoutOutline??.18)*10} min={0} max={12} step={.5} onChange={v=>onPatch({cutoutOutline:v/10})}/><Range label="阴影强度" value={(p.shadow??.4)*100} min={0} max={100} unit="%" onChange={v=>onPatch({shadow:v/100})}/></div>
   <Range label="整体旋转" value={p.rotation} min={-180} max={180} unit="°" onChange={rotation=>onPatch({rotation})}/>
   <div className="photo-mask-dimensions"><label>框宽<input type="number" aria-label="蒙版框宽" min={1} max={100} step={.5} value={Math.round(p.w*10)/10} onChange={e=>{const v=Number(e.target.value);if(v>=1&&v<=100)onSize('w',v);}}/></label><label>框高<input type="number" aria-label="蒙版框高" min={1} max={100} step={.5} value={Math.round((p.h??15)*10)/10} onChange={e=>{const v=Number(e.target.value);if(v>=1&&v<=100)onSize('h',v);}}/></label></div>
   <button className="primary full" type="button" onClick={onApply}>应用蒙版</button>
  </fieldset>
  <button className="quiet full" type="button" onClick={onCancel}>取消</button>
  <small role="status">{draft.generating?'正在生成蒙版…':'拖动照片取景，控制点调整照片框。空间不足时先放大。'}</small>
 </aside>;
}
