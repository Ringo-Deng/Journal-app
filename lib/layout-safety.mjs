/** The server estimates footprints; the editor supplies measured boxes after fonts/images load. */
export function estimatedHeight(p, ratio=1.43) {
  if(p.kind!=='text')return p.h || (p.kind==='photo'?p.w*ratio/(p.frame==='plain'||p.frame==='cutout'?1.25:1.7)+3:p.w*ratio);
  const size=(p.fontSize||18)/10,leading=p.lineHeight||(p.role==='title'?1.4:1.9);
  const pad=0;
  const width=Math.max(1,p.w-pad),tracking=p.letterSpacing??.03;
  const units=line=>Array.from(line).reduce((sum,ch)=>sum+((ch.codePointAt(0)||0)<256?.55:1)+tracking,0);
  const lines=String(p.text||'').split('\n').reduce((n,l)=>n+Math.max(1,Math.ceil(units(l)*size/width)),0);
  return Math.max(p.h||0,(lines*size*leading+pad)*ratio);
}
export function bounds(p,ratio=1.43) {
  const h=estimatedHeight(p,ratio),a=(p.rotation||0)*Math.PI/180;
  const w=Math.abs(p.w*Math.cos(a))+Math.abs(h/ratio*Math.sin(a));
  const rh=Math.abs(h*Math.cos(a))+Math.abs(p.w*ratio*Math.sin(a));
  return {x:p.x+p.w/2-w/2,y:p.y+h/2-rh/2,w,h:rh};
}
export function intersects(a,b,gap=0) {return a.x<b.x+b.w+gap&&a.x+a.w+gap>b.x&&a.y<b.y+b.h+gap&&a.y+a.h+gap>b.y;}
const key=p=>p.id||p.sourceId;
const underPaper=p=>p.assetId==='collage-paper'||p.frame==='collage-paper'||p.kind==='doodle'&&p.frame==='vellum-sheet';
export function layoutIssues(elements,ratio=1.43,header=3) {
  const issues=[];
  const boxes=elements.map(p=>bounds(p,ratio));
  elements.forEach((p,i)=>{
    const b=boxes[i];
    if(b.x<1||b.y<header||b.x+b.w>99||b.y+b.h>98)issues.push({type:'edge',ids:[key(p)],message:'元素超出纸面或进入页眉'});
    if(p.kind==='text'&&b.x<51&&b.x+b.w>49)issues.push({type:'spine',ids:[key(p)],message:'文字经过书脊'});
    for(let j=i+1;j<elements.length;j++){
      const q=elements[j];
      // A backing paper may intentionally sit under text. Other objects must not cover writing.
      if((p.kind!=='text'&&q.kind!=='text')||underPaper(p)||underPaper(q))continue;
      if(!intersects(b,boxes[j],.25))continue;
      issues.push({type:'overlap',ids:[key(p),key(q)],message:p.kind==='text'&&q.kind==='text'?'两处文字相互重叠':'装饰或照片与文字重叠'});
    }
  });
  return issues;
}

/** Move whole groups; never delete content, shrink fonts, or alter locked geometry. */
export function tidyLayout(elements,ratio=1.43,header=3) {
  const result=elements.map(p=>({...p})),groups=new Map();
  for(const p of result){const id=p.groupId||key(p)||p;const group=groups.get(id)||[];group.push(p);groups.set(id,group);}
  const units=[...groups.values()].sort((a,b)=>Number(b.some(p=>p.locked))-Number(a.some(p=>p.locked))||Number(b.some(p=>p.kind==='text'||p.kind==='photo'))-Number(a.some(p=>p.kind==='text'||p.kind==='photo')));
  const occupied=[];
  for(const group of units){
    const original=group.map(p=>bounds(p,ratio));
    const minX=Math.min(...original.map(b=>b.x)),minY=Math.min(...original.map(b=>b.y));
    const w=Math.max(...original.map(b=>b.x+b.w))-minX,h=Math.max(...original.map(b=>b.y+b.h))-minY;
    const locked=group.some(p=>p.locked);
    const safe=(dx,dy)=>{
      const shifted=group.map((p,i)=>({...original[i],x:original[i].x+dx,y:original[i].y+dy}));
      if(shifted.some((b,i)=>b.x<2||b.x+b.w>98||b.y<header||b.y+b.h>97||(group[i].kind==='text'&&b.x<51&&b.x+b.w>49)))return false;
      return !group.some((p,i)=>occupied.some(o=>!underPaper(p)&&!underPaper(o.p)&&(p.kind==='text'||o.p.kind==='text'||(p.kind==='photo'&&o.p.kind==='photo'))&&intersects(shifted[i],o.box,1)));
    };
    if(!locked&&!safe(0,0)){
      const candidates=[];
      for(const side of [minX<50?0:50,minX<50?50:0])for(let y=header;y<=97-h;y+=2)for(let x=side+3;x<=side+47-w;x+=2)candidates.push({dx:x-minX,dy:y-minY});
      candidates.sort((a,b)=>Math.hypot(a.dx,a.dy/ratio)-Math.hypot(b.dx,b.dy/ratio));
      const move=candidates.find(v=>safe(v.dx,v.dy));
      if(move)group.forEach(p=>{p.x+=move.dx;p.y+=move.dy;});
    }
    group.forEach(p=>occupied.push({p,box:bounds(p,ratio)}));
  }
  return {elements:result,issues:layoutIssues(result,ratio,header)};
}
