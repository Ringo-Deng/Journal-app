'use client';
/* oxlint-disable next/no-img-element -- Local journal photographs retain their original pixels. */
import type { CSSProperties } from 'react';
import type { Piece } from '@/lib/journal';
import {journalFontFamily} from '@/lib/collage';
import {decoratedTextSegments} from '@/lib/text-runs';

export function pieceAppearance(p:Piece): CSSProperties {
  const stackOrder=(p as Piece & {stackOrder?:number}).stackOrder;
  return {
    '--piece-font':journalFontFamily(p.fontFamily),
    '--piece-leading':p.lineHeight,
    '--piece-tracking':p.letterSpacing!==undefined?`${p.letterSpacing}em`:undefined,
    '--piece-weight':p.fontWeight,
    '--piece-align':p.textAlign,
    '--photo-border':p.photoBorder!==undefined?`${p.photoBorder}cqw`:undefined,
    '--piece-shadow':p.shadow===undefined?undefined:`0.15cqw 0.3cqw ${.2+p.shadow*.55}cqw rgb(65 48 27 / ${p.shadow*.32})`,
    '--cutout-edge':`${p.cutoutOutline??.18}cqw`,
    zIndex:Number.isFinite(stackOrder)?stackOrder:19,
  } as CSSProperties;
}
export function pieceClasses(p:Piece) {
  return `${p.material?`material-${p.material}`:''} ${p.hideTape?'no-auto-tape':''} ${p.fontFamily?'has-typography':''} ${p.shadow!==undefined&&(p.kind!=='text'||!!p.frame&&p.frame!=='plain')?'has-shadow':''} ${p.kind==='photo'?'mounted-photo':''} ${p.tapeEdge==='straight'?'tape-straight':''}`;
}
export function PhotoArtwork({piece:p,alt=''}:{piece:Piece;alt?:string}) {
  return <div className={`photo-window ${p.frame==='plain'||p.frame==='cutout'?'natural-photo':''}`}>
    <img draggable={false} src={p.src} alt={alt} style={{objectPosition:`${p.crop??50}% ${p.cropY??50}%`,transform:`scale(${(p.cropZoom??1)*(p.flipX?-1:1)},${(p.cropZoom??1)*(p.flipY?-1:1)})`,transformOrigin:`${p.crop??50}% ${p.cropY??50}%`}}/>
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
