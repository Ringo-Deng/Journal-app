'use client';
/* oxlint-disable next/no-img-element -- Local uploaded paper backgrounds require direct positioning and scaling. */
import type { CSSProperties } from 'react';
import {pageSpread,paperSettings,paperBgOf,headerOf,renderHeader,pageInk,type Book,type Spread} from '@/lib/journal';

/** Shared by the editor and both faces of the animated reading view. */
export default function NotebookPaper({book,spread,pageIndex}:{book:Book;spread:Spread;pageIndex:number}){
 return <>{(['left','right'] as const).map((side,index)=>{
  const current=pageSpread(spread,side)!;
  const paper=paperSettings(book,current),bg=paperBgOf(book,current),header=headerOf(book,current);
  const feel=current.paperFeel||book.paperFeel;
  const ink=pageInk(book,spread,side);
  const singleBackground=spread.pages?.[side]?.paperBg !== undefined;
  return <div key={side} className={`notebook-page-layer ${side}-paper paper-${paper.style} ruling-${paper.rulingSize}`} style={{'--paper':paper.color,'--ink':ink,'--ruling':ink==='#f5f5ed'?'var(--reading-ruling-dark, #ffffff35)':'var(--reading-ruling-light, #47556925)'} as CSSProperties}>
    <div className="paper-ruling"/>
    {feel&&<div className="collage-paper-feel" style={{'--texture-strength':feel.texture,'--spine-strength':feel.spine,'--edge-strength':feel.edge} as CSSProperties}><div className="collage-paper-fibers"/><div className="collage-paper-edge"/><div className="collage-paper-spine"/></div>}
    {bg && <div className="paper-bg-layer"><img src={bg.src} alt="" draggable={false} style={{left:`${singleBackground?bg.x:bg.x*2-index*100}%`,top:`${bg.y}%`,width:`${singleBackground?bg.scale:bg.scale*2}%`}}/></div>}
    {header.enabled && <div className="notebook-page-header" style={{height:`${header.height}%`,paddingInline:`${header.margin*2}%`,fontSize:`${header.fontSize/10}cqw`,color:header.color||ink,textAlign:header.align}}>
      {renderHeader(header,{date:current.date||current.days[0]?.date,page:pageIndex*2+index+1})}
    </div>}
  </div>;
 })}</>;
}
