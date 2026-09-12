import type { Piece, Spread, CollageTemplate } from './journal';
import type { Box } from './piece-transform';

export const journalFonts = [
  {id:'hand',name:'经典楷体',family:'"Kaiti SC", "STKaiti", "KaiTi", serif'},
  {id:'brush',name:'毛笔 · 马善政',family:'"Journal Brush", "Kaiti SC", serif'},
  {id:'pen',name:'细笔 · 龙藏',family:'"Journal Pen", "Kaiti SC", serif'},
  {id:'liyu',name:'漓雨手书',family:'"Journal Liyu", "Journal Pen", "Kaiti SC", serif'},
  {id:'xiaolai',name:'小赖字体',family:'"Journal Xiaolai", "Journal Pen", "Kaiti SC", serif'},
  {id:'yozai',name:'悠哉字体',family:'"Journal Yozai", "Journal Pen", "Kaiti SC", serif'},
  {id:'kaiti-gb',name:'AR PL 简中楷',family:'"Journal Kaiti GB", "Journal Pen", "Kaiti SC", serif'},
  {id:'kaiti-big5',name:'AR PL 繁中楷',family:'"Journal Kaiti Big5", "Journal Pen", "Kaiti SC", serif'},
  {id:'wenkai',name:'霞鹜文楷 · 清秀手写',family:'"Journal Wenkai", "Journal Pen", "Kaiti SC", serif'},
  {id:'chill-round',name:'寒蝉全圆 · 软萌圆体',family:'"Journal Chill Round", "Journal Pen", "Kaiti SC", serif'},
  {id:'zcool-kuaile',name:'站酷快乐体 · 俏皮手绘',family:'"Journal Zcool Kuaile", "Journal Pen", "Kaiti SC", serif'},
  {id:'zcool-huangyou',name:'站酷庆科黄油体 · 圆润标题',family:'"Journal Zcool Huangyou", "Journal Pen", "Kaiti SC", serif'},
  {id:'zcool-xiaowei',name:'站酷小薇体 · 文艺标题',family:'"Journal Zcool Xiaowei", "Journal Pen", "Kaiti SC", serif'},
  {id:'noto-serif-sc',name:'Noto 宋体 · 书刊正文',family:'"Journal Noto Serif SC", "Journal Pen", "Kaiti SC", serif'},
  {id:'patrick-hand',name:'英文手写 · Patrick Hand',family:'"Journal Patrick Hand", "Journal Pen", "Kaiti SC", serif'},
  {id:'dancing-script',name:'英文花体 · Dancing Script',family:'"Journal Dancing Script", "Journal Pen", "Kaiti SC", serif'},
  {id:'script',name:'英文连笔 · Caveat',family:'"Journal Script", "Journal Pen", cursive'},
  {id:'comic-neue',name:'Comic Neue',family:'"Journal Comic Neue", "Journal Pen", cursive'},
  {id:'lobster-two',name:'Lobster Two',family:'"Journal Lobster Two", "Journal Pen", cursive'},
  {id:'purisa',name:'Purisa',family:'"Journal Purisa", "Journal Pen", cursive'},
  {id:'serif',name:'书刊宋体',family:'Georgia, "Songti SC", serif'},
  {id:'sans',name:'简洁黑体',family:'"PingFang SC", sans-serif'},
];
export function userFontFamily(id:string){
  const safe=String(id||'').replace(/^user:/,'');
  return /^[a-f0-9]{24}$/.test(safe)?`Journal User ${safe}`:undefined;
}
export function journalFontFamily(id?:string){
  if(!id)return journalFonts[0].family;
  return journalFonts.find(f=>f.id===id)?.family || (userFontFamily(id)?`"${userFontFamily(id)}", "Journal Pen", "Kaiti SC", serif`:undefined);
}
export const creamFeel = {texture:.25,spine:.45,edge:.35};
export function creamTravel(s: Spread): Spread {
  return {...s,paperStyle:'blank',paperColor:'#f5edda',paperFeel:creamFeel,
    pages:s.pages?Object.fromEntries(Object.entries(s.pages).map(([side,p])=>[side,{...p,paperStyle:'blank',paperColor:'#f5edda',paperFeel:creamFeel,paperBg:null}])):undefined,
    paperBg:null,
    elements:s.elements.map(p=>p.locked?p:p.kind==='text'?{...p,fontFamily:p.role==='title'?'brush':Array.from(p.text||'').every(c=>c.charCodeAt(0)<128)?'script':'pen',fontWeight:400,lineHeight:p.role==='title'?1.25:1.6,letterSpacing:.04,color:'#393a32'}:p.kind==='photo'?{...p,frame:p.frame==='cutout'?'cutout':'polaroid',photoBorder:.65,shadow:.45,hideTape:true}:{...p,shadow:.3})};
}

/** Bounds and transformations use physical pixels so rotation is correct on any paper ratio. */
export function unionBoxes(boxes: Box[]): Box {
  if(!boxes.length)return {x:0,y:0,w:0,h:0,rotation:0};
  const points=boxes.flatMap(b=>{
    const a=b.rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
    return [-1,1].flatMap(hx=>[-1,1].map(hy=>({x:b.x+b.w/2+hx*b.w/2*c-hy*b.h/2*s,y:b.y+b.h/2+hx*b.w/2*s+hy*b.h/2*c})));
  });
  const x=Math.min(...points.map(p=>p.x)),y=Math.min(...points.map(p=>p.y));
  return {x,y,w:Math.max(...points.map(p=>p.x))-x,h:Math.max(...points.map(p=>p.y))-y,rotation:0};
}
export function transformCluster(pieces: Piece[], boxes: Box[], before: Box, after: Box, cw: number, ch: number): Piece[] {
  const scale=after.w/before.w,a=(after.rotation-before.rotation)*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  return pieces.map((p,i)=>{
    const b=boxes[i],dx=(b.x+b.w/2-before.x-before.w/2)*scale,dy=(b.y+b.h/2-before.y-before.h/2)*scale;
    return {...p,x:(after.x+after.w/2+dx*c-dy*s-b.w*scale/2)/cw*100,y:(after.y+after.h/2+dx*s+dy*c-b.h*scale/2)/ch*100,
      w:b.w*scale/cw*100,h:b.h*scale/ch*100,rotation:p.rotation+after.rotation-before.rotation,stretch:true,
      ...(p.kind==='text'?{fontSize:(p.fontSize||18)*scale}:{}),
      ...(p.kind==='photo'?{photoBorder:(p.photoBorder??.7)*scale}:{}),
      ...(p.cutoutOutline!==undefined?{cutoutOutline:p.cutoutOutline*scale}:{}),
    };
  });
}
export function cloneCluster(pieces: Piece[], id:()=>string, dx=2,dy=2): Piece[] {
  const ids=new Map(pieces.map(p=>[p.id,id()])),groups=new Map<string,string>();
  for(const p of pieces)if(p.groupId&&!groups.has(p.groupId))groups.set(p.groupId,id());
  return pieces.map(p=>({...p,id:ids.get(p.id)!,groupId:p.groupId?groups.get(p.groupId):undefined,attachedTo:p.attachedTo?ids.get(p.attachedTo):undefined,x:p.x+dx,y:p.y+dy,locked:false}));
}
export function instantiateTemplate(t: CollageTemplate, id:()=>string, ratio:number): Piece[] {
  const copy=cloneCluster(t.elements,id,0,0),group=id();
  // Keep the original physical proportions when inserting into a different notebook format.
  const factor=ratio/t.ratio;
  return copy.map(p=>({...p,groupId:group,y:8+p.y*factor,h:p.h===undefined?undefined:p.h*factor}));
}
