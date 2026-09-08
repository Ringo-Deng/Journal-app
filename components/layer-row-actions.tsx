'use client';
import {ArrowDown,ArrowUp,Eye,EyeOff,Lock,Unlock,Pencil} from 'lucide-react';

export default function LayerRowActions({
  hidden,
  locked,
  onVisibility,
  onLock,
  onRename,
  onUp,
  onDown,
}:{
  hidden:boolean;
  locked:boolean;
  onVisibility:()=>void;
  onLock:()=>void;
  onRename:()=>void;
  onUp?:()=>void;
  onDown?:()=>void;
}){
  const buttonStyle={width:28,height:28,padding:5,minWidth:28} as const;
  return <span className="layer-row-actions" style={{display:'flex',alignItems:'center',gap:2,flexShrink:0}} data-editor-ui="true">
    <button type="button" className="quiet icon" style={buttonStyle} aria-label={hidden?'显示图层':'隐藏图层'} title={hidden?'显示':'隐藏'} onClick={onVisibility}>{hidden?<EyeOff/>:<Eye/>}</button>
    <button type="button" className="quiet icon" style={buttonStyle} aria-label={locked?'解锁图层':'锁定图层'} title={locked?'解锁':'锁定'} onClick={onLock}>{locked?<Lock/>:<Unlock/>}</button>
    <button type="button" className="quiet icon" style={buttonStyle} aria-label="重命名图层" title="重命名" onClick={onRename}><Pencil/></button>
    {onUp&&<button type="button" className="quiet icon" style={buttonStyle} disabled={locked} aria-label="上移图层" title="上移一层" onClick={onUp}><ArrowUp/></button>}
    {onDown&&<button type="button" className="quiet icon" style={buttonStyle} disabled={locked} aria-label="下移图层" title="下移一层" onClick={onDown}><ArrowDown/></button>}
  </span>;
}
