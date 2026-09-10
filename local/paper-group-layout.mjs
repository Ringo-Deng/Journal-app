import {randomUUID} from 'node:crypto';
import {bounds, estimatedHeight, intersects} from '../lib/layout-safety.mjs';
import {isEmptyTextHint} from './editorial.mjs';
import {paperShapes,paperPatterns,isPaperAsset} from './paper-art.mjs';

export const paperGroupSlots = {
  hero:'主素材，靠书写区左上方', leaf:'左下呼应', butterfly:'右上轻点缀',
  script:'上缘标签', accent:'右下点缀', sprig:'右缘细长素材',
};
export const paperPositions = {top:'上方露出',bottom:'下方露出',left:'左侧露出',right:'右侧露出',diagonal:'斜向错叠'};
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

const color=v=>typeof v==='string'&&/^#[a-f0-9]{6}$/i.test(v);
const range=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const member=(options,v)=>typeof v==='string'&&Object.hasOwn(options,v);
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
const luminance=values=>values.map(c=>c/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4).reduce((n,c,i)=>n+c*[.2126,.7152,.0722][i],0);
const contrast=(a,b)=>(Math.max(a,b)+.05)/(Math.min(a,b)+.05);

export function validatePaperSelection(output, candidates) {
  const palette=output?.palette,writing=output?.writing;
  if (['backPaper','frontPaper','ink','tape'].some(k=>!color(palette?.[k]))) throw Error('底纸配色不完整，请重新选择六位色值。');
  if (!writing||!member(paperShapes,writing.shape)||!member(paperPatterns,writing.pattern)||!range(writing.width,16,28)||writing.align!==undefined&&!['left','center','right'].includes(writing.align)) throw Error('请为书写纸选择形状、花纹和 16 至 28 的文字宽度。');
  const base=rgb(palette.frontPaper),ink=luminance(rgb(palette.ink));
  const mark=base[0]*.299+base[1]*.587+base[2]*.114>165?rgb('#514B43'):[255,255,255];
  const opacity={plain:0,grid:.18,dots:.25,ruled:.20}[writing.pattern];
  if ([base,base.map((v,i)=>v*(1-opacity)+mark[i]*opacity)].some(c=>contrast(luminance(c),ink)<4.5)) throw Error('文案与书写纸颜色对比不足，请使用清晰可读的配色。');
  if (!Array.isArray(output.papers)||output.papers.length>2) throw Error('请返回零至两张衬纸，不要省略 papers。');
  const papers=output.papers.map(p=>{
    if (!p||!member(paperPositions,p.position)||!range(p.width,14,36)||!range(p.rotation??0,-12,12)) throw Error('衬纸位置或尺寸无效，请使用提供的叠接方向和尺寸范围。');
    const base={position:p.position,width:p.width,rotation:p.rotation??0};
    if (p.assetId!==undefined) {
      const asset=candidates.find(a=>a.id===p.assetId);
      if (!asset||!isPaperAsset(asset)) throw Error('请从标记为纸张的真实候选中选择底纸。');
      return {...base,assetId:asset.id};
    }
    if (!member(paperShapes,p.shape)||!member(paperPatterns,p.pattern)||!color(p.color)||!range(p.height,8,48)) throw Error('生成衬纸需要有效的形状、花纹、颜色和高度。');
    return {...base,shape:p.shape,pattern:p.pattern,color:p.color,height:p.height};
  });
  const stickers=output.stickers;
  if (!Array.isArray(stickers)||stickers.length<1||stickers.length>6||stickers.some(s=>!s||!member(paperGroupSlots,s.slot)||!range(s.width??8,3,10)||!candidates.some(a=>a.id===s.assetId))||!stickers.some(s=>s.slot==='hero')||new Set(stickers.map(s=>s.slot)).size!==stickers.length) throw Error('请选择一至六张有效素材，保留一个 hero 主素材，每个位置最多一张。');
  const ids=[...papers.filter(p=>p.assetId).map(p=>p.assetId),...stickers.map(s=>s.assetId)];
  if(new Set(ids).size!==ids.length)throw Error('底纸和周边素材不要重复使用同一张图片。');
  if(stickers.filter(s=>{const a=candidates.find(a=>a.id===s.assetId);return /邮票|stamp/i.test(a.category+' '+a.name);}).length>1)throw Error('邮票只能作为一处小点缀。');
  const tapes=output.tapes??[];
  if(!Array.isArray(tapes)||tapes.length>2||tapes.some(t=>!t||!['top','bottom'].includes(t.position)||!range(t.width,4,10)))throw Error('胶带最多两段，请选择上缘或下缘和有效宽度。');
  return {palette,writing:{shape:writing.shape,pattern:writing.pattern,width:writing.width,align:writing.align||'center'},papers,stickers:stickers.map(s=>({slot:s.slot,assetId:s.assetId,width:s.width??8})),tapes:tapes.map(t=>({position:t.position,width:t.width}))};
}

// The model chooses materials and proportions; only writing height and safe edge placement are computed.
export function placePaperGroup(content, selection, candidates, paperSources, input, groupId=randomUUID()) {
  const ratio=input.ratio||1.43,{writing,palette}=selection;
  const text=content.map(p=>({...p,x:25-writing.width/2,y:0,w:writing.width,h:0,rotation:0,textAlign:writing.align,color:palette.ink,stackOrder:10}));
  for(const p of text)p.h=estimatedHeight(p,ratio);
  const total=text.reduce((n,p)=>n+p.h,0)+Math.max(0,text.length-1)*2;
  let cursor=50-total/2;
  for(const p of text){p.y=cursor;cursor+=p.h+2;}
  const writingBox={x:25-writing.width/2,y:50-total/2,w:writing.width,h:total};
  // The rectangle of writing stays inside an oval, including its corner glyphs.
  const expand=writing.shape==='oval'?1.5:1;
  const paperW=(writing.width+4)*expand,paperH=(total+6)*expand;
  const front={kind:'asset',src:paperSources.at(-1),x:25-paperW/2,y:50-paperH/2,w:paperW,h:paperH,rotation:0,frame:'collage-paper',stretch:true,shadow:.12,stackOrder:3};
  const papers=selection.papers.map((p,i)=>{
    const asset=candidates.find(a=>a.id===p.assetId);
    let w=p.width,h=asset?w*asset.height/asset.width*ratio:p.height;
    if(h>48){w*=48/h;h=48;}
    const x=p.position==='left'?front.x-w*.32:p.position==='right'?front.x+front.w-w*.68:p.position==='diagonal'?front.x-w*.12:25-w/2;
    const y=p.position==='top'?front.y-h*.32:p.position==='bottom'?front.y+front.h-h*.68:p.position==='diagonal'?front.y-h*.18:50-h/2;
    return {kind:'asset',src:asset?.src||paperSources[i],...(asset?{assetId:asset.id}:{}),x,y,w,h,rotation:p.rotation,frame:'collage-paper',stretch:!asset,shadow:.12,stackOrder:i+1};
  });
  papers.push(front);
  const around=(slot,w,h)=>{
    const top=slot==='hero'||slot==='butterfly'||slot==='script';
    let x=slot==='hero'||slot==='leaf'?writingBox.x-w*.35:slot==='script'?25-w/2:slot==='sprig'?writingBox.x+writingBox.w+1:writingBox.x+writingBox.w-w*.65;
    let y=slot==='sprig'?50-h/2:top?writingBox.y-h-1:writingBox.y+writingBox.h+1;
    return {x,y};
  };
  const stickers=selection.stickers.map(s=>{
    const a=candidates.find(a=>a.id===s.assetId);
    const w=Math.min(s.width,17*a.width/a.height/ratio),h=w*a.height/a.width*ratio;
    return {kind:'asset',assetId:a.id,src:a.src,...around(s.slot,w,h),w,h,rotation:0,frame:'plain',stackOrder:5};
  });
  for(const tape of selection.tapes)stickers.push({kind:'asset',material:'tape',src:'/materials/collage-paper.svg',x:25-tape.width/2,y:tape.position==='top'?writingBox.y-3.5:writingBox.y+writingBox.h+1,w:tape.width,h:2.5,rotation:0,color:palette.tape,opacity:.78,stackOrder:7,tapeEdge:'torn'});
  if(stickers.some(s=>text.some(t=>intersects(bounds(s,ratio),bounds(t,ratio),.3))))throw Error('选中的素材挡住文案，请调整素材尺寸。');
  // Generated writing paper protects content even when a library paper contains text or transparent holes.
  const group=[...papers,...stickers,...text].map(({id:_id,locked:_locked,...p})=>({...p,groupId,groupName:'纸张拼贴'}));
  const boxes=group.map(p=>bounds(p,ratio));
  const left=Math.min(...boxes.map(b=>b.x)),top=Math.min(...boxes.map(b=>b.y));
  const width=Math.max(...boxes.map(b=>b.x+b.w))-left,height=Math.max(...boxes.map(b=>b.y+b.h))-top;
  if(width>45||height>90)throw Error('组合超出单页，请减小衬纸或文字区域的宽度，不要缩小字号。');
  const occupied=[...(input.occupiedElements||[]),...(input.elements||[]).filter(p=>p.locked||p.groupId)].map(p=>bounds(p,ratio));
  const header=Math.max(3,Math.min(23,Number(input.headerSpace)||3));
  const right=input.entrySide==='right'||/右页|右侧|right page/i.test(input.instruction||'');
  for(const side of right?[50,0]:[0,50])for(let y=header+2;y+height<=96;y+=2){
    const dx=side+3-left,dy=y-top;
    const moved=boxes.map(b=>({...b,x:b.x+dx,y:b.y+dy}));
    if(moved.some(b=>b.x<side+2||b.x+b.w>side+48||occupied.some(o=>intersects(b,o,2))))continue;
    return group.map(p=>({...p,x:p.x+dx,y:p.y+dy}));
  }
  throw Object.assign(Error('当前跨页没有足够空间放下这个组合，请翻到空白页再生成。'),{code:'group_space'});
}
