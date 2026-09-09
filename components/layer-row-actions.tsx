'use client';
import {ArrowDownToLine,ArrowUpToLine,Eye,EyeOff,Lock,Unlock,Pencil} from 'lucide-react';

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
  const buttonStyle={width:22,height:22,padding:3,minWidth:22} as const;
  const iconProps={size:14,strokeWidth:1.8} as const;
  return <span className="layer-row-actions" style={{display:'flex',alignItems:'center',gap:1,flexShrink:0}} data-editor-ui="true">
    <button type="button" className="quiet icon" style={buttonStyle} aria-label={hidden?'显示图层':'隐藏图层'} title={hidden?'显示':'隐藏'} onClick={onVisibility}>{hidden?<EyeOff {...iconProps}/>:<Eye {...iconProps}/>}</button>
    <button type="button" className="quiet icon" style={buttonStyle} aria-label={locked?'解锁图层':'锁定图层'} title={locked?'解锁':'锁定'} onClick={onLock}>{locked?<Lock {...iconProps}/>:<Unlock {...iconProps}/>}</button>
    <button type="button" className="quiet icon" style={buttonStyle} aria-label="重命名图层" title="重命名" onClick={onRename}><Pencil {...iconProps}/></button>
    {onUp&&<button type="button" className="quiet icon" style={buttonStyle} disabled={locked} aria-label="置顶图层" title="置顶" onClick={onUp}><ArrowUpToLine {...iconProps}/></button>}
    {onDown&&<button type="button" className="quiet icon" style={buttonStyle} disabled={locked} aria-label="置底图层" title="置底" onClick={onDown}><ArrowDownToLine {...iconProps}/></button>}
  </span>;
}
