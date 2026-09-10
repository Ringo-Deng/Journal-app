import {makeHandDoodle} from './hand-doodles.mjs';
import {isEmptyTextHint} from './editorial.mjs';
import {stickerPath} from './sticker-art.mjs';
import {isEditorialShape, makeEditorialShape} from './editorial-shapes.mjs';
// Only structured drawing data is accepted; never markup or remote image URLs.
export function validatePlan(elements, input, assets) {
  if (!Array.isArray(elements) || !elements.length || elements.length > 250)
    throw Error('AI 未返回完整的跨页设计，请重试。');
  const sources = input.elements || [];
  const color = v => /^#[a-f0-9]{6}$/i.test(v || '') ? v : undefined;
  const number = (v, lo, hi, fallback) => Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback;
  const result = elements.map(p => {
    if (!p || !['text','asset','photo','doodle'].includes(p.kind)) throw Error('AI 页面元素类型无效。');
    let source = sources.find(s => s.id === p.sourceId);
    if(source?.kind==='text' && ['doodle','asset'].includes(p.kind)) {p={...p,sourceId:undefined,forParagraph:p.forParagraph||source.id};source=undefined;}
    const day = input.days[p.dayIndex];
    const w = number(p.w, 3, 44, 30);
    let x = number(p.x, 2, 98-w, 5);
    if (x < 50 && x+w > 48) x = Math.max(2,48-w);
    const base = {kind:p.kind,x,y:number(p.y,3,88,10),w,rotation:number(p.rotation,-30,30,0),fontSize:number(p.fontSize,12,42,18),color:color(p.color),background:color(p.background),frame:['plain','polaroid','stamp','cutout','note','outline','torn','underline','sticker','ticket','postcard','vellum','label','collage'].includes(p.frame)?p.frame:'plain'};
    if (typeof p.region === 'string' && /^[a-z-]{1,24}$/.test(p.region)) base.region = p.region;
    if (source && source.kind !== p.kind) throw Error('AI 更改了原始元素类型。');
    if (source) Object.assign(base,{sourceId:source.id,dayId:source.dayId,originIds:source.originIds,sourceDayIds:source.sourceDayIds,paragraphIndex:source.paragraphIndex,stickerKeywords:source.stickerKeywords});
    base.fontFamily=['serif','hand','sans','brush','pen','script'].includes(p.fontFamily)?p.fontFamily:source?.fontFamily||'hand';
    for(const [field,lo,hi] of [['lineHeight',1,3],['letterSpacing',-.05,.4],['fontWeight',400,700],['shadow',0,1]]) {
      if(Number.isFinite(p[field]??source?.[field]))base[field]=number(p[field]??source?.[field],lo,hi,lo);
    }
    if(['left','center','right'].includes(p.textAlign??source?.textAlign))base.textAlign=p.textAlign??source.textAlign;
    if(source?.groupId)base.groupId=source.groupId;
    if(source?.attachedTo)base.attachedTo=source.attachedTo;
    if(source?.material)base.material=source.material;
    if(source?.tapeEdge)base.tapeEdge=source.tapeEdge;
    if(Number.isFinite(source?.opacity))base.opacity=source.opacity;
    if(p.kind==='text' && Number.isFinite(p.h)) base.h=number(p.h,5,55,12);
    if(typeof p.artLabel==='string') base.artLabel=p.artLabel.slice(0,80);
    if(typeof p.forParagraph==='string') base.forParagraph=p.forParagraph;
    if (day) Object.assign(base,{dayIndex:p.dayIndex});
    if(p.kind==='text') {
      const role = source?.role || (['title','body','date'].includes(p.role)?p.role:undefined);
      const text = source?.text ?? (day && role==='body' ? day.text || day.raw : day && role==='title' ? day.title || p.text : p.text);
      if(typeof text!=='string' || text.length>8000) throw Error('AI 文本框内容无效。');
      return {...base,role,text};
    }
    if(p.kind==='asset') {
      const a=assets.find(a=>a.id===(source?.assetId || p.assetId));
      if(!a) throw Error('AI 选择了不存在的素材。');
      return {...base,assetId:a.id,src:a.src};
    }
    if(p.kind==='photo') {
      const src=source?.src || day?.photos?.[p.photoIndex];
      if(!src) throw Error('AI 照片引用无效。');
      const presentation={};
      for(const [field,lo,hi] of [['crop',0,100],['cropY',0,100],['cropZoom',1,4],['photoBorder',0,2.5],['cutoutOutline',0,1],['h',1,95]]){
        if(Number.isFinite(p[field]??source?.[field]))presentation[field]=number(p[field]??source?.[field],lo,hi,lo);
      }
      return {...base,...presentation,frame:['plain','polaroid','torn','stamp','cutout'].includes(p.frame)?p.frame:['plain','polaroid','torn','stamp','cutout'].includes(source?.frame)?source.frame:'polaroid',hideTape:p.hideTape??source?.hideTape,stretch:source?.stretch,flipX:source?.flipX,flipY:source?.flipY,src,photoOriginal:source?.photoOriginal || src};
    }
    if(source?.locked && isEditorialShape(source)) return {...source,sourceId:source.id};
    const shapeMotif=p.motif??source?.doodleMotif;
    if(isEditorialShape({kind:p.kind,doodleMotif:shapeMotif})) {
      const shape=makeEditorialShape({...source,...p,motif:shapeMotif},input.ratio);
      let sx=number(p.x??source?.x,2,98-shape.w,5);
      if(sx<50 && sx+shape.w>48) sx=Math.max(2,48-shape.w);
      return {...base,...shape,x:sx,y:number(p.y??source?.y,3,94-shape.h,10),rotation:number(p.rotation??source?.rotation,-30,30,0),flipX:source?.flipX,flipY:source?.flipY};
    }
    if(input.doodleMode==='handdrawn' && !source?.locked) {
      const hand=makeHandDoodle(p);
      let hx=number(p.x,2,98-hand.w,5);
      if(hx<50 && hx+hand.w>48) hx=Math.max(2,48-hand.w);
      return {...base,...hand,x:hx,y:number(p.y,3,94-hand.h,10),color:color(p.color)||'#756650',background:undefined};
    }
    const paragraph=sources.find(s=>s.id===p.forParagraph);
    if(p.frame==='sticker'&&!p.path&&!p.drawing?.length) p={...p,path:stickerPath((paragraph?.stickerKeywords||[]).join(' ')+' '+(paragraph?.text||''))||p.path};
    const pathOK=v=>typeof v==='string'&&v.length<=6000&&/^\s*M[\d\s.,MmLlHhVvCcSsQqTtAaZz+-]+$/.test(v);
    if(p.drawing?.length) {
      if(!Array.isArray(p.drawing)||p.drawing.length>24||p.drawing.some(l=>!pathOK(l.path))) throw Error('AI 插画图层无效。');
      const drawing=p.drawing.map(l=>({path:l.path,fill:color(l.fill)||'none',stroke:color(l.stroke)||base.color||'#504337',width:number(l.width,0.3,5,1.4)}));
      return {...base,drawing,h:number(p.h,3,50,20)};
    }
    if(!pathOK(p.path)) throw Error('AI 涂鸦路径无效。');
    return {...base,path:p.path,h:number(p.h,3,50,15)};
  });
  if(input.doodleMode==='handdrawn' && result.filter(p=>p.doodleMotif&&!isEditorialShape(p)).length>6) throw Error('手绘点缀过多，每跨页最多6处，请减少装饰并保留留白。');
  // A redesign must account for all visible writing and photos, including free text.
  for(const s of sources.filter(s=>!s.locked && ['text','photo'].includes(s.kind))) {
    if(!result.some(p=>p.sourceId===s.id)) {
      if(isEmptyTextHint(s)) result.push({...s,sourceId:s.id});
      else throw Object.assign(Error('AI 设计遗漏了原有文字或照片，请重试。'),{retryHint:`缺少原始元素sourceId：${s.id}。请引用此元素，不要删除。`});
    }
  }
  if(!sources.length) for(let i=0;i<input.days.length;i++) {
    if(!result.some(p=>p.dayIndex===i&&p.kind==='text'&&p.role==='body')) throw Error('AI 设计遗漏了记录正文。');
    for(let j=0;j<(input.days[i].photos||[]).length;j++) if(!result.some(p=>p.kind==='photo'&&p.src===input.days[i].photos[j])) throw Error('AI 设计遗漏了照片。');
  }
  const refs=result.filter(p=>p.sourceId).map(p=>p.sourceId);
  if(new Set(refs).size!==refs.length) throw Error('AI 设计重复引用了原有元素。');
  return result;
}
