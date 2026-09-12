'use client';
import {useEffect,useRef,useState} from 'react';
import {Palette,SlidersHorizontal,Sparkles} from 'lucide-react';
import type {Piece} from '@/lib/journal';
import {journalFonts} from '@/lib/collage';
import {DEFAULT_VELLUM_COLOR,DEFAULT_VELLUM_OPACITY,isVellumSheet,vellumColor,vellumDisplayOpacity} from '@/lib/vellum-sheet';
import {NumberControl} from './element-controls';
import ToolbarPopover from './toolbar-popover';

type UserFont={id:string;name:string;family:string;url:string;size:number;originalName?:string};
const vellumColors=[['#edf1f0','雾白'],['#dfe7e8','冷灰'],['#dce8ef','雾蓝'],['#eee1e5','雾粉'],['#e1e9df','雾绿']];

function fontResponse(value:unknown):{fonts:UserFont[];error?:string}{
 if(!value||typeof value!=='object')throw Error('字体服务返回的数据无效。');
 const data=value as Record<string,unknown>;
 const fonts=Array.isArray(data.fonts)?data.fonts.filter((font:unknown):font is UserFont=>{
  if(!font||typeof font!=='object')return false;
  const item=font as Record<string,unknown>;
  return ['id','name','family','url'].every(key=>typeof item[key]==='string'&&item[key]!=='' )&&typeof item.size==='number'&&Number.isFinite(item.size)&&item.size>=0&&(item.originalName===undefined||typeof item.originalName==='string');
 }):[];
 return {fonts,error:typeof data.error==='string'?data.error:undefined};
}

export default function CollageTools({piece:p,onPatch,onCaption,onTape,onCutout,onMask,cropping,onCrop,busy,hasTextRange,onTextColor,onTextHighlight}:{piece:Piece;onPatch:(patch:Partial<Piece>)=>void;onCaption:()=>void;onTape:()=>void;onCutout:()=>void;onMask:()=>void;cropping:boolean;onCrop:()=>void;busy:boolean;hasTextRange:boolean;onTextColor:(color:string|null)=>void;onTextHighlight:(color:string|null)=>void}) {
 const [userFonts,setUserFonts]=useState<UserFont[]>([]);
 const [fontMessage,setFontMessage]=useState('');
 const [fontError,setFontError]=useState(false);
 const [fontBusy,setFontBusy]=useState(false);
 const fontInput=useRef<HTMLInputElement>(null);
 useEffect(()=>{let live=true;fetch('/api/fonts').then(async r=>{const data=fontResponse(await r.json());if(!r.ok)throw Error(data.error||'读取字体失败。');if(live)setUserFonts(data.fonts);}).catch(()=>{});return()=>{live=false};},[]);
 async function importFonts(files:FileList|null){
  if(!files?.length)return;
  setFontBusy(true);setFontError(false);setFontMessage('正在导入字体…');
  try{
   const imported:UserFont[]=[];
   for(const file of Array.from(files)){
    if(file.size>80*1024*1024)throw Error(`${file.name} 太大，单个字体包不能超过 80 MB。`);
    const response=await fetch(`/api/fonts/import?filename=${encodeURIComponent(file.name)}`,{method:'POST',headers:{'Content-Type':file.name.toLowerCase().endsWith('.zip')?'application/zip':'application/octet-stream'},body:file});
    const data=fontResponse(await response.json());
    if(!response.ok)throw Error(data.error||`${file.name} 导入失败。`);
    imported.push(...data.fonts);
   }
   const deduped=[...new Map([...userFonts,...imported].map(font=>[font.id,font])).values()];
   setUserFonts(deduped);
   for(const font of imported){
    try{const face=new FontFace(font.family,`url("${font.url}")`);await face.load();document.fonts.add(face);}catch{/* CSS 刷新仍会再次加载，单个字体加载失败不影响其他字体。 */}
   }
   const link=document.querySelector<HTMLLinkElement>('link[data-user-fonts="true"]');
   if(link)link.href=`/api/fonts.css?v=${Date.now()}`;
   if(imported[0])onPatch({fontFamily:`user:${imported[0].id}`});
   setFontMessage(imported.length?`已导入 ${imported.length} 个字体${imported[0]?'，已切换到第一个。':'。'}`:'没有找到可导入的字体文件。');
  }catch(e){setFontError(true);setFontMessage(e instanceof Error?e.message:'字体导入失败。');}
  finally{setFontBusy(false);if(fontInput.current)fontInput.current.value='';}
 }

 if(p.kind==='text') return <div className="collage-context-tools compact-context-tools" aria-label="文字细节">
   <label className="compact-select-control compact-font-control">字体<select aria-label="手写字形" value={p.fontFamily||'hand'} onChange={e=>onPatch({fontFamily:e.target.value})}>
     <optgroup label="内置字体">{journalFonts.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</optgroup>
     {!!userFonts.length&&<optgroup label="我的字体">{userFonts.map(f=><option key={f.id} value={`user:${f.id}`}>{f.name}</option>)}</optgroup>}
   </select></label>
   <ToolbarPopover label="文字排版" icon={<SlidersHorizontal/>} className="compact-primary-style" panelClassName="text-style-popover">
     <div className="toolbar-popover-title">文字排版</div>
     <div className="toolbar-popover-grid">
       <NumberControl label="行距" value={p.lineHeight||(p.role==='title'?1.4:1.9)} min={1} max={3} onCommit={lineHeight=>onPatch({lineHeight})}/>
       <NumberControl label="字距" value={(p.letterSpacing??.03)*100} min={-5} max={40} unit="%" onCommit={v=>onPatch({letterSpacing:v/100})}/>
     </div>
     <div className="toolbar-popover-row">
       <label>粗细<select aria-label="文字粗细" value={p.fontWeight||400} onChange={e=>onPatch({fontWeight:Number(e.target.value)})}><option value={400}>常规</option><option value={600}>加粗</option></select></label>
       <label>对齐<select aria-label="文字对齐" value={p.textAlign||'left'} onChange={e=>onPatch({textAlign:e.target.value as Piece['textAlign']})}><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option></select></label>
     </div>
     <div className="toolbar-popover-section"><span className="toolbar-popover-subtitle">局部文字样式</span>
       <div className="text-run-control"><span>文字颜色</span><div className="toolbar-popover-actions">
         <label title="双击文字，选中要着色的字句">自定义<input type="color" aria-label="选中文字颜色" disabled={!hasTextRange} defaultValue="#af7856" onInput={e=>onTextColor(e.currentTarget.value)}/></label>
         {hasTextRange&&<div className="text-color-swatches">{[['#b36742','赭色'],['#587a91','湖蓝'],['#608060','苔绿']].map(([color,name])=><button key={color} className="text-color-swatch" style={{background:color}} aria-label={`选中文字设为${name}`} onMouseDown={e=>e.preventDefault()} onClick={()=>onTextColor(color)}/>)}</div>}
         {!!p.colorRuns?.length&&<button className="quiet" onClick={()=>onTextColor(null)}>清除局部颜色</button>}
       </div></div>
       <div className="text-run-control"><span>荧光笔</span><div className="toolbar-popover-actions">
         <label title="双击文字，选中要标记的字句">自定义<input type="color" aria-label="自定义荧光笔颜色" disabled={!hasTextRange} defaultValue="#f2d45c" onChange={e=>onTextHighlight(e.currentTarget.value)}/></label>
         <div className="text-color-swatches">{[['#f2d45c','柔黄'],['#ee9aa2','柔粉'],['#82bdd5','湖蓝'],['#9bc58a','苔绿'],['#b79ad0','柔紫']].map(([color,name])=><button key={color} className="text-color-swatch" disabled={!hasTextRange} style={{background:color}} aria-label={`选中文字添加${name}荧光标记`} onMouseDown={e=>e.preventDefault()} onClick={()=>onTextHighlight(color)}/>)}</div>
         {!!p.highlightRuns?.length&&<button className="quiet" onClick={()=>onTextHighlight(null)}>清除本框高亮</button>}
       </div></div>
       <small className="text-highlight-hint">双击文字并选择字句，添加标记；完成编辑后显示。</small>
     </div>
     <div className="toolbar-popover-section"><span className="toolbar-popover-subtitle">字体管理</span><button type="button" className="quiet font-import-button" disabled={fontBusy} onClick={()=>fontInput.current?.click()}>{fontBusy?'导入中…':'导入字体'}</button><input ref={fontInput} hidden type="file" multiple accept=".ttf,.otf,.woff,.woff2,.zip" onChange={e=>void importFonts(e.currentTarget.files)}/>{!!fontMessage&&<small className={`font-import-status${fontError?' is-error':''}`}>{fontMessage}</small>}</div>
   </ToolbarPopover>
 </div>;

 if(p.kind==='photo'&&p.frame==='masked')return <div className="collage-context-tools compact-context-tools"><span>蒙版已定稿 · 可撤销或从照片回收站恢复原图</span><NumberControl label="轮廓白边" value={(p.cutoutOutline??.18)*10} min={0} max={25} onCommit={v=>onPatch({cutoutOutline:v/10})}/><NumberControl label="阴影" value={(p.shadow??.4)*100} min={0} max={100} onCommit={v=>onPatch({shadow:v/100})}/></div>;
 if(p.kind==='photo') return <div className="collage-context-tools compact-context-tools" aria-label="照片细节">
   <button className="quiet" disabled={busy} onClick={onMask}>照片蒙版</button>
   <label className="compact-select-control compact-photo-frame">装裱<select aria-label="照片装裱" value={p.frame||'polaroid'} onChange={e=>onPatch({frame:e.target.value,hideTape:true})}>{[['polaroid','拍立得'],['torn','撕纸'],['stamp','邮票'],['plain','原图'],['cutout','白边剪贴']].map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
   <button className="quiet compact-photo-crop" aria-pressed={cropping} onClick={onCrop}>{cropping?'完成裁切':'裁切'}</button>
   <ToolbarPopover label="照片细节" icon={<SlidersHorizontal/>} className="compact-photo-detail" panelClassName="photo-detail-popover">
     <div className="toolbar-popover-title">照片细节</div>
     <div className="toolbar-popover-grid"><NumberControl label="白边宽度" value={(p.photoBorder??.7)*10} min={0} max={25} onCommit={v=>onPatch({photoBorder:v/10})}/><NumberControl label="阴影" value={(p.shadow??.4)*100} min={0} max={100} unit="%" onCommit={v=>onPatch({shadow:v/100})}/>{p.frame==='cutout'&&<NumberControl label="剪贴描边" value={(p.cutoutOutline??.18)*10} min={0} max={10} onCommit={v=>onPatch({cutoutOutline:v/10})}/>}</div>
     <div className="toolbar-popover-actions"><button className="quiet" onClick={onCaption}>添加／编辑图注</button><button className="quiet" onClick={onTape}>贴一段胶带</button><button className="quiet" disabled={busy} onClick={onCutout}>{busy?'正在抠图…':'本地抠图'}</button></div>
     {cropping&&<div className="toolbar-popover-section"><span className="toolbar-popover-subtitle">取景</span><div className="toolbar-popover-grid"><NumberControl label="横向" value={p.crop??50} min={0} max={100} onCommit={crop=>onPatch({crop})}/><NumberControl label="纵向" value={p.cropY??50} min={0} max={100} onCommit={cropY=>onPatch({cropY})}/><NumberControl label="放大" value={(p.cropZoom??1)*100} min={100} max={400} unit="%" onCommit={v=>onPatch({cropZoom:v/100})}/></div><button className="quiet" onClick={()=>onPatch({crop:50,cropY:50,cropZoom:1})}>重置取景</button></div>}
   </ToolbarPopover>
 </div>;

 if(isVellumSheet(p)){
   const color=vellumColor(p),opacity=vellumDisplayOpacity(p);
   return <div className="collage-context-tools compact-context-tools" aria-label="硫酸纸外观">
     <ToolbarPopover label="纸张外观" icon={<Palette/>} className="compact-material-style" panelClassName="vellum-style-popover">
       <div className="toolbar-popover-title">硫酸纸颜色与纸张浓度</div>
       <label className="vellum-custom-color">自定义颜色<input type="color" aria-label="硫酸纸颜色" value={color} onChange={e=>onPatch({color:e.target.value,opacity})}/></label>
       <div className="vellum-color-swatches" aria-label="硫酸纸预设颜色">
         {vellumColors.map(([value,name])=><button key={value} type="button" className="vellum-color-swatch" aria-label={`硫酸纸设为${name}`} aria-pressed={color===value} style={{background:value}} onClick={()=>onPatch({color:value,opacity})}/>)}
       </div>
       <div className="toolbar-popover-grid"><NumberControl label="纸张浓度" value={opacity*100} min={0} max={100} unit="%" onCommit={value=>onPatch({color,opacity:value/100})}/></div>
       <small className="vellum-style-hint">浓度越低越透；雾感只作用于图层中位于它下方的素材。</small>
       <div className="toolbar-popover-actions"><button type="button" className="quiet" onClick={()=>onPatch({color:DEFAULT_VELLUM_COLOR,opacity:DEFAULT_VELLUM_OPACITY})}>恢复雾白</button></div>
     </ToolbarPopover>
   </div>;
 }

 return <div className="collage-context-tools compact-context-tools" aria-label="素材细节">
   <ToolbarPopover label="质感" icon={<Sparkles/>} className="compact-material-style" panelClassName="material-style-popover">
     <div className="toolbar-popover-title">素材质感</div>
     <NumberControl label="阴影强度" value={(p.shadow??.4)*100} min={0} max={100} unit="%" onCommit={v=>onPatch({shadow:v/100})}/>
     {p.kind==='asset'&&<label>材质<select aria-label="素材材质" value={p.material||'paper'} onChange={e=>onPatch({material:e.target.value as Piece['material']})}><option value="paper">纸片</option><option value="botanical">植物</option><option value="tape">胶带</option></select></label>}
     {p.material==='tape'&&<><label>胶带颜色<input type="color" aria-label="胶带颜色" value={p.color||'#c5b08b'} onChange={e=>onPatch({color:e.target.value})}/></label><NumberControl label="胶带透明度" value={(p.opacity??.7)*100} min={10} max={100} unit="%" onCommit={v=>onPatch({opacity:v/100})}/><label>撕口<select aria-label="胶带撕口" value={p.tapeEdge||'torn'} onChange={e=>onPatch({tapeEdge:e.target.value as Piece['tapeEdge']})}><option value="torn">不规则撕口</option><option value="straight">平直边缘</option></select></label></>}
   </ToolbarPopover>
 </div>;
}
