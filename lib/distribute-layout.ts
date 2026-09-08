export type DistributionAxis='x'|'y';
export type DistributionRect={id:string;x:number;y:number;w:number;h:number};

export function distributeRects(rects:DistributionRect[],axis:DistributionAxis):Record<string,number>{
  const deltas=Object.fromEntries(rects.map(rect=>[rect.id,0])) as Record<string,number>;
  if(rects.length<3)return deltas;
  const position=axis==='x'?'x':'y',size=axis==='x'?'w':'h';
  const ordered=[...rects].sort((a,b)=>a[position]-b[position]);
  const first=ordered[0],last=ordered.at(-1)!;
  const start=first[position],end=last[position]+last[size];
  const occupied=ordered.reduce((sum,rect)=>sum+rect[size],0);
  const gap=(end-start-occupied)/(ordered.length-1);
  let cursor=start;
  for(const rect of ordered){
    deltas[rect.id]=cursor-rect[position];
    cursor+=rect[size]+gap;
  }
  return deltas;
}
