import {randomUUID} from 'node:crypto';
import {bounds, estimatedHeight, intersects} from '../lib/layout-safety.mjs';
import {isEmptyTextHint} from './editorial.mjs';

export const paperGroupSlots = {
  hero: {x:4.5,y:23,rotation:-9,w:12,h:25,description:'左上较大主素材，花枝或其他符合主题的主体'},
  leaf: {x:8,y:56,rotation:-7,w:9,h:16,description:'左下中等植物或不同款式配角'},
  butterfly: {x:33,y:25,rotation:9,w:10,h:14,description:'右上轻巧点缀，如蝴蝶、小图案'},
  script: {x:21,y:26,rotation:-6,w:10,h:10,description:'上缘小手写纸片、标签或票据'},
  accent: {x:33,y:62,rotation:9,w:5.5,h:10,description:'右下小点缀，可用一张邮票'},
  sprig: {x:37.5,y:46,rotation:8,w:6,h:14,description:'右缘细长轻盈素材'},
};

// Small writing groups have a real capacity. Longer writing/photos retain the existing layout path.
export function paperGroupContent(input) {
  if (/不要贴纸|无装饰|极简|杂志|不要底纸|no stickers|no decoration|minimal/i.test(input.instruction || '')) return null;
  if (input.requirements?.framed || input.requirements?.paragraphCount > 1) return null;
  const editable=(input.elements||[]).filter(p=>!p.locked&&!p.groupId);
  if (editable.some(p=>p.kind==='photo') || (!input.elements?.length && input.days.some(d=>d.photos?.length))) return null;
  const text=editable.filter(p=>p.kind==='text'&&!isEmptyTextHint(p));
  if (!text.length && input.elements?.length) return null;
  if (!text.length && input.days.length!==1) return null;
  const content=text.length?text.map(p=>({...p,sourceId:p.id})):input.days.flatMap((d,dayIndex)=>[
    ...(d.title?[{kind:'text',role:'title',text:d.title,dayIndex}]:[]),
    {kind:'text',role:'body',text:d.text??d.raw,dayIndex},
  ]);
  if (!content.length || content.some(p=>typeof p.text!=='string')) return null;
  const ratio=input.ratio || 1.43;
  const prepared=content.map(p=>({...p,x:18,y:0,w:17,h:0,rotation:0,frame:'plain',fontSize:p.role==='title'?22:16,fontFamily:p.fontFamily||'hand',textAlign:'center',lineHeight:p.role==='title'?1.4:1.65}));
  for (const p of prepared) p.h=estimatedHeight(p,ratio);
  const total=prepared.reduce((n,p)=>n+p.h,0)+Math.max(0,prepared.length-1)*2;
  if (total>21 || ratio<.8 || ratio>1.8) return null;
  let y=49.5-total/2;
  return prepared.map(p=>{const result={...p,y};y+=p.h+2;return result;});
}

export function validatePaperSelection(output, candidates) {
  const palette=output?.palette;
  if (['backPaper','frontPaper','ink','tape'].some(k=>!/^#[a-f0-9]{6}$/i.test(palette?.[k]||''))) throw Error('底纸配色不完整，请重新选择六位色值。');
  const luminance=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4).reduce((n,c,i)=>n+c*[.2126,.7152,.0722][i],0);
  const a=luminance(palette.frontPaper),b=luminance(palette.ink);
  if ((Math.max(a,b)+.05)/(Math.min(a,b)+.05)<4.5) throw Error('文案与便签颜色对比不足，请使用清晰可读的配色。');
  const stickers=output.stickers;
  if (!Array.isArray(stickers)||stickers.length<4||stickers.length>Object.keys(paperGroupSlots).length||new Set(stickers.map(s=>s.slot)).size!==stickers.length||new Set(stickers.map(s=>s.assetId)).size!==stickers.length) throw Error('请选择至少四款不重复的周边素材，每个位置放一款。');
  const chosen=stickers.map(s=>{
    const asset=candidates.find(a=>a.id===s.assetId);
    if (!asset || !paperGroupSlots[s.slot]) throw Error('选择了候选列表之外的素材或位置。');
    return asset;
  });
  if (chosen.filter(a=>/邮票|stamp/i.test(a.category+' '+a.name)).length>1) throw Error('邮票只能作为一处小点缀，请混选其他款式。');
  if (new Set(candidates.map(a=>a.category)).size>=3 && new Set(chosen.map(a=>a.category)).size<3) throw Error('素材款式过于单一，请混选至少三类素材。');
  return {palette,stickers};
}

export function placePaperGroup(content, selection, candidates, paperSources, input, groupId=randomUUID()) {
  const ratio=input.ratio || 1.43;
  const papers=[
    {kind:'asset',src:paperSources[0],x:9,y:28,w:30,h:39,rotation:-7,stackOrder:1},
    {kind:'asset',src:paperSources[1],x:13,y:31,w:27,h:36,rotation:3,stackOrder:2},
  ].map(p=>({...p,frame:'collage-paper',stretch:true,shadow:.15}));
  const stickers=selection.stickers.map(({assetId,slot})=>{
    const a=candidates.find(p=>p.id===assetId),s=paperGroupSlots[slot];
    const w=Math.min(s.w,s.h*a.width/a.height/ratio);
    return {kind:'asset',assetId,src:a.src,x:s.x,y:s.y,w,h:w*a.height/a.width*ratio,rotation:s.rotation,frame:'plain',stackOrder:4};
  });
  stickers.push(...[{x:14.5,y:31,w:8,h:3.2,rotation:-14},{x:22,y:65,w:9,h:3,rotation:7}].map(p=>({kind:'asset',material:'tape',src:'/materials/collage-paper.svg',...p,color:selection.palette.tape,opacity:.78,stackOrder:7,tapeEdge:'torn'})));
  const text=content.map(p=>({...p,color:selection.palette.ink,stackOrder:10}));
  // Try smaller peripheral pieces before rejecting an unsafe selection; never shrink writing.
  for (const sticker of stickers) {
    for (let attempt=0;attempt<4 && text.some(t=>intersects(bounds(t,ratio),bounds(sticker,ratio),.3));attempt++) {
      const oldW=sticker.w,oldH=sticker.h;sticker.w*=.85;sticker.h*=.85;
      sticker.x+=(oldW-sticker.w)/2;sticker.y+=(oldH-sticker.h)/2;
    }
    if (text.some(t=>intersects(bounds(t,ratio),bounds(sticker,ratio),.3))) throw Error('选中的素材挡住文案，请换用更窄的周边素材。');
    if (!papers.some(p=>intersects(bounds(p,ratio),bounds(sticker,ratio)))) throw Error('周边素材未压住底纸，请换用适合纸边的素材。');
  }
  const group=[...papers,...stickers,...text].map(({id:_id,locked:_locked,...p})=>({...p,groupId,groupName:'双底纸拼贴'}));
  const boxes=group.map(p=>bounds(p,ratio));
  const left=Math.min(...boxes.map(b=>b.x)),top=Math.min(...boxes.map(b=>b.y));
  const width=Math.max(...boxes.map(b=>b.x+b.w))-left,height=Math.max(...boxes.map(b=>b.y+b.h))-top;
  if (width*height/5000>.5) throw Error('素材尺寸超过半页，请选择更紧凑的周边素材。');
  const occupied=[...(input.occupiedElements||[]),...(input.elements||[]).filter(p=>p.locked||p.groupId)].map(p=>bounds(p,ratio));
  const header=Math.max(3,Math.min(23,Number(input.headerSpace)||3));
  const right=input.entrySide==='right'||/右页|右侧|right page/i.test(input.instruction||'');
  for (const side of right?[50,0]:[0,50]) {
    for (let y=header+2;y+height<=96;y+=2) {
      const dx=side+3-left,dy=y-top;
      const moved=boxes.map(b=>({...b,x:b.x+dx,y:b.y+dy}));
      if (moved.some(b=>b.x<side+2||b.x+b.w>side+48||occupied.some(o=>intersects(b,o,2)))) continue;
      return group.map(p=>({...p,x:p.x+dx,y:p.y+dy}));
    }
  }
  throw Object.assign(Error('当前跨页没有足够空间放下这个组合，请翻到空白页再生成。'),{code:'group_space'});
}
