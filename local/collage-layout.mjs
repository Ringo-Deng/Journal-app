import {selectStickers} from './sticker-selection.mjs';
// Physical paper layers and safe edge clusters, applied after content validation.
const frames=new Set(['note','torn','ticket','postcard','vellum','label','collage']);
export function textFootprint(p) {
 const size=(p.fontSize||18)/10;
 const padding=frames.has(p.frame)?3.2:0;
 const width=Math.max(2,p.w-padding);
 const lines=String(p.text||'').split('\n').reduce((n,l)=>n+Math.max(1,Math.ceil(Array.from(new Intl.Segmenter('zh',{granularity:'grapheme'}).segment(l)).reduce((v,{segment})=>v+(segment.codePointAt(0)<128?.55:1),0)*size/width)),0);
 return {x:p.x-1,y:p.y-1,w:p.w+2,h:Math.max(p.h||0,(lines*size*1.9+padding)*1.43)+2};
}
const overlap=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
export function finishCollage(elements,input,assets) {
 const result=elements.map(p=>({...p}));
 const source=input.elements||[];
 const locked=source.filter(p=>p.locked);
 // Explicit alternate art direction and locked arrangements retain the model's composition.
 if(/极简|不要贴纸|无装饰|不要花|minimal|no stickers/i.test(input.instruction||'')) return result;
 const texts=result.filter(p=>p.kind==='text');
 if(!texts.length)return result;
 const bodies=texts.filter(p=>!['title','date','decor'].includes(p.role));
 const titles=texts.filter(p=>p.role==='title');
 const dates=texts.filter(p=>p.role==='date');
 const short=!locked.length&&!result.some(p=>p.kind==='photo')&&bodies.length>0&&bodies.length<=4&&titles.length<=2&&dates.length<=2&&texts.every(p=>p.role!=='decor')&&texts.reduce((n,p)=>n+(p.text||'').length,0)<=380;
 if(short) {
  const originalTexts=texts.map(p=>({...p}));
  // Capacity depends on the actual text, never on a fixed number of calendar days.
  const cursor=[23,bodies.length<=2?72:29];
  titles.forEach((p,i)=>Object.assign(p,{x:i?58:8,y:i?12:8,w:32,h:undefined,rotation:0,fontSize:29,fontFamily:'serif',frame:'plain',background:undefined}));
  titles.forEach((p,i)=>{cursor[i]=Math.max(cursor[i],p.y+textFootprint(p).h+5)});
  let fits=true;const placements=[];
  bodies.forEach((p,i)=>{
   const side=i%2;
   const q={...p,x:side?59:8,y:cursor[side],w:32,h:undefined,fontSize:18,rotation:0,fontFamily:'hand',frame:i===0?'collage':i%2?'torn':'ticket',background:i%2?'#fff8e8':'#f8f0db'};
   const h=textFootprint(q).h;cursor[side]+=h+8;
   if(cursor[side]>92)fits=false;
   placements.push(q);
  });
  if(fits) bodies.forEach((p,i)=>Object.assign(p,placements[i]));
  dates.forEach((p,i)=>Object.assign(p,{x:i?58:8,y:91,w:29,h:undefined,rotation:0,fontSize:12,frame:'plain'}));
  if(!fits)texts.forEach((p,i)=>{for(const k of Object.keys(p))delete p[k];Object.assign(p,originalTexts[i]);});
 }
 // Layering is a rendering treatment: text remains editable and its content untouched.
 for(const p of texts) if(!locked.some(s=>s.id===p.sourceId)&&p.frame==='note')p.frame='collage';
 const protectedBoxes=[...texts.map(textFootprint),...locked.map(p=>({...p,h:p.h||25})),...result.filter(p=>p.kind==='photo').map(p=>({...p,h:p.h||p.w*1.43}))];
 const occupied=[];
 const arrowSources=[];
 const ratio=a=>(a.height&&a.width?a.height/a.width:1)*1.43;
 const slots=[{x:7,y:49,w:27},{x:63,y:25,w:27},{x:37,y:18,w:9},{x:87,y:39,w:9},{x:3,y:76,w:12},{x:80,y:78,w:12},{x:56,y:14,w:10},{x:32,y:79,w:10},{x:6,y:37,w:10},{x:86,y:15,w:9},{x:56,y:78,w:9}];
 const crowds=(a,b)=>{const area=Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));return area>Math.min(a.w*a.h,b.w*b.h)*.4;};
 function place(p,a,preferred=false){
  const options=preferred?[{x:p.x,y:p.y,w:Math.min(p.w,25)},...slots]:slots;
  for(const slot of options){
   const w=slot.w,h=w*ratio(a);const r={...slot,h};
   if(r.y+h>93||protectedBoxes.some(b=>overlap(r,b))||occupied.some(b=>crowds(r,b)))continue;
   Object.assign(p,r,{rotation:occupied.length%2?5:-5,frame:'plain',background:undefined});
   occupied.push(r);return true;
  }return false;
 }
 // Reposition unlocked decorative assets into available edge space; never move photos.
 const heroPieces=[];
 if(short){
  const text=bodies.map(p=>p.text).join(' ');
  for(const a of selectStickers(assets.filter(a=>a.functions?.includes('主插画')&&a.tags?.some(t=>text.includes(t))),text,[],2)){
   const p={kind:'asset',assetId:a.id,src:a.src,rotation:0};
   if(place(p,a)){heroPieces.push(p);}
  }
 }
 const kept=result.filter(p=>{
  if(p.kind!=='asset'||locked.some(s=>s.id===p.sourceId))return true;
  if(p.assetId==='collage-paper')return false;
  if(p.assetId?.startsWith('collage-arrow')){arrowSources.push(p);return false;}
  if(heroPieces.some(a=>a.assetId===p.assetId))return false;
  const a=assets.find(a=>a.id===p.assetId);
  return a&&place(p,a,!short);
 });
 kept.push(...heroPieces);
 const used=new Set(kept.map(p=>p.assetId));
 const choices=assets.filter(a=>!used.has(a.id)&&!a.id.startsWith('collage-arrow'));
 // AI-selected materials stay first; coordinated flowers/ephemera supply small supporting pieces.
 const extras=choices.filter(a=>/花|邮票|票根|flower|stamp/i.test([a.name,...a.tags||[]].join(' ')));
 let count=kept.filter(p=>p.kind==='asset').length;
 for(const a of extras){
  if(count>=7)break;
  const p={kind:'asset',assetId:a.id,src:a.src,x:0,y:0,w:10,rotation:0};
  if(place(p,a)){kept.push(p);used.add(a.id);count++;}
 }
 for(const id of ['collage-arrow-rust','collage-arrow-sage']){
  const a=assets.find(a=>a.id===id);if(!a||used.has(id))continue;
  const p={...arrowSources.find(p=>p.assetId===id),kind:'asset',assetId:id,src:a.src,x:0,y:0,w:8,rotation:0};
  // Arrows are actual reusable cut-paper assets rather than arbitrary model paths.
  for(const t of bodies){
   const box=textFootprint(t);const r={x:t.x+t.w-9,y:box.y+box.h+1,w:8,h:8*ratio(a)};
   if(r.y+r.h<93&&!protectedBoxes.some(b=>overlap(r,b))&&!occupied.some(b=>overlap(r,b))){Object.assign(p,r);occupied.push(r);kept.push(p);break;}
  }
 }
 // Omit generated thin arrows when a paper arrow is available. Other pen accents remain.
 for(const t of bodies.filter(p=>p.sourceId)){
  const b=textFootprint(t);
  const near=kept.filter(a=>a.kind==='asset'&&(a.x<50)===(t.x<50)).map(a=>({a,gap:Math.max(0,a.y-b.y-b.h,b.y-a.y-(a.h||12))})).filter(v=>v.gap<=15).sort((a,b)=>a.gap-b.gap);
  const pick=near.find(v=>v.a.forParagraph===t.sourceId)||near.find(v=>!v.a.forParagraph);
  if(pick)pick.a.forParagraph=t.sourceId;
 }
 if(short&&!titles.length)kept.push({kind:'text',role:'decor',text:'日常片段',x:8,y:9,w:32,fontSize:30,fontFamily:'serif',frame:'plain',rotation:0,color:'#684d38'});
 const hasArrow=kept.some(p=>p.assetId?.startsWith('collage-arrow'));
 const paper=assets.find(a=>a.id==='collage-paper');
 const layers=paper?heroPieces.map(p=>({kind:'asset',assetId:paper.id,src:paper.src,x:p.x-1,y:p.y-2,w:p.w+2,h:p.h+3,rotation:p.rotation-2,frame:'collage-paper'})):[];
 return [...layers,...kept.filter(p=>p.kind!=='doodle'||p.sourceId||(!(hasArrow&&p.doodleMotif==='arrow')&&!protectedBoxes.some(b=>overlap({...p,h:p.h||12},b))))];
}
