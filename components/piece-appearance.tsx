'use client';
import './photo-mask.css';
/* oxlint-disable next/no-img-element -- Local journal photographs retain their original pixels. */
import PhotoMaskPreview from './photo-mask-preview';
import type { CSSProperties } from 'react';
import type { Piece } from '@/lib/journal';
import {journalFontFamily} from '@/lib/collage';
import {decoratedTextSegments} from '@/lib/text-runs';
import {isVellumSheet,vellumColor,vellumVisual} from '@/lib/vellum-sheet';
import {textContourShapes} from '@/lib/text-contour';

export function pieceAppearance(p:Piece): CSSProperties {
  const stackOrder=(p as Piece & {stackOrder?:number}).stackOrder;
  const vellum=isVellumSheet(p)?vellumVisual(p):undefined;
  const contour=p.kind==='text'&&p.textFlow==='contour'?textContourShapes(p):undefined;
  return {
    '--piece-font':journalFontFamily(p.fontFamily),
    '--piece-leading':p.lineHeight,
    '--piece-tracking':p.letterSpacing!==undefined?`${p.letterSpacing}em`:undefined,
    '--piece-weight':p.fontWeight,
    '--piece-align':p.textAlign,
    '--text-contour-left':contour?.left,
    '--text-contour-right':contour?.right,
    '--photo-border':p.photoBorder!==undefined?`${p.photoBorder}cqw`:undefined,
    '--piece-shadow':p.shadow===undefined?undefined:`0.15cqw 0.3cqw ${.2+p.shadow*.55}cqw rgb(65 48 27 / ${p.shadow*.32})`,
    '--mask-shadow':p.shadow===0?'drop-shadow(0 0 0 transparent)':`drop-shadow(.15cqw .3cqw ${.2+(p.shadow??.4)*.55}cqw rgb(65 48 27 / ${(p.shadow??.4)*.32}))`,
    '--cutout-edge':`${p.cutoutOutline??.18}cqw`,
    '--vellum-color':vellum?vellumColor(p):undefined,
    '--vellum-strength':vellum?.strength,
    '--vellum-blur':vellum?`${vellum.blurCqw.toFixed(3)}cqw`:undefined,
    '--vellum-saturation':vellum?.saturation,
    '--vellum-contrast':vellum?.contrast,
    '--vellum-grain-opacity':vellum?.grainOpacity,
    '--vellum-edge-opacity':vellum?.edgeOpacity,
    zIndex:Number.isFinite(stackOrder)?stackOrder:19,
  } as CSSProperties;
}
export function pieceFrameClass(p:Piece) {
  return p.kind==='text'?'':p.frame||'';
}
export function pieceClasses(p:Piece) {
  return `${p.material?`material-${p.material}`:''} ${p.hideTape?'no-auto-tape':''} ${p.fontFamily?'has-typography':''} ${p.shadow!==undefined&&p.kind!=='text'?'has-shadow':''} ${p.kind==='photo'?'mounted-photo':''} ${p.tapeEdge==='straight'?'tape-straight':''} ${p.kind==='text'&&p.textFlow?`text-flow-${p.textFlow}`:''}`;
}
export function PhotoArtwork({piece:p,alt='',maskPreview}:{piece:Piece;alt?:string;maskPreview?:{shape:string;ratio:number;photoRotation?:number}}) {
  if(maskPreview)return <PhotoMaskPreview piece={p} {...maskPreview}/>;
  return <div className={`photo-window ${p.frame==='plain'||p.frame==='cutout'||p.frame==='masked'?'natural-photo':''}`}>
    <img draggable={false} src={p.src} alt={alt} style={{objectFit:p.photoFit==='contain'?'contain':undefined,objectPosition:`${p.crop??50}% ${p.cropY??50}%`,transform:`scale(${(p.cropZoom??1)*(p.flipX?-1:1)},${(p.cropZoom??1)*(p.flipY?-1:1)})`,transformOrigin:`${p.crop??50}% ${p.cropY??50}%`}}/>
  </div>;
}
export function TapeArtwork({piece:p}:{piece:Piece}) {
  return <div className="washi-tape" style={{backgroundColor:p.color||'#c5b08b'}}/>;
}

export function ColoredWriting({piece:p}:{piece:Piece}) {
  const text=p.text||'',segments=decoratedTextSegments(text,p.colorRuns,p.highlightRuns);
  if(!p.colorRuns?.length&&!p.highlightRuns?.length)return text;
  return segments.map(segment=><span key={segment.start} className={segment.highlight?'text-highlight':''} style={{color:segment.color,'--text-highlight':segment.highlight} as CSSProperties}>{segment.text}</span>);
}

export function TextContourFloats(){
  return <><span className="text-contour-float contour-left" aria-hidden="true"/><span className="text-contour-float contour-right" aria-hidden="true"/></>;
}

export function TextArtwork({piece}:{piece:Piece}){
  return <div className="piece-text">{piece.textFlow==='contour'&&<TextContourFloats/>}<ColoredWriting piece={piece}/></div>;
}
