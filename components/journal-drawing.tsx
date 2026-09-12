import type {Piece} from '@/lib/journal';
export default function JournalDrawing({piece:p}:{piece:Piece}) {
  const layers=p.drawing?.length?p.drawing:[{path:p.path||'',fill:p.doodleMotif?'none':p.frame==='sticker'?p.background||'#fff7df':'none',stroke:p.color||'#62734e',width:2}];
  return <svg data-hand-doodle={p.doodleMotif||undefined} viewBox="0 0 100 100" preserveAspectRatio={p.doodleMotif||p.stretch?"none":"xMidYMid meet"} style={{width:'100%',height:'100%',overflow:'visible',transform:`scale(${p.flipX?-1:1},${p.flipY?-1:1})`}} aria-label={p.artLabel||'手绘插画'}>{layers.map((l,i)=><path key={i} d={l.path} fill={l.fill||'none'} stroke={l.stroke||p.color||'#62734e'} strokeWidth={p.doodleMotif?1.35:l.width||1.5} vectorEffect={p.doodleMotif||p.frame==='vellum-sheet'?"non-scaling-stroke":undefined} strokeLinecap="round" strokeLinejoin="round"/>)}</svg>;
}
