import type {Piece} from './journal';

export const TEXT_CONTOUR_Y=[8,29,50,71,92] as const;
const EMPTY=[0,0,0,0,0];

export const TEXT_CONTOUR_PRESETS={
  straight:{textContourLeft:EMPTY,textContourRight:EMPTY},
  leftUpper:{textContourLeft:[42,42,32,6,0],textContourRight:EMPTY},
  rightUpper:{textContourLeft:EMPTY,textContourRight:[42,42,32,6,0]},
  hourglass:{textContourLeft:[0,10,18,10,0],textContourRight:[0,10,18,10,0]},
} as const;

export function normalizedTextContour(p:Pick<Piece,'textContourLeft'|'textContourRight'>){
  const side=(values?:number[])=>Array.from({length:TEXT_CONTOUR_Y.length},(_,index)=>{
    const value=Number(values?.[index]);
    return Number.isFinite(value)?Math.max(0,Math.min(45,value)):0;
  });
  const left=side(p.textContourLeft),right=side(p.textContourRight);
  for(let index=0;index<TEXT_CONTOUR_Y.length;index++){
    const total=left[index]+right[index];
    if(total>80){const scale=80/total;left[index]*=scale;right[index]*=scale;}
  }
  return {left,right};
}

export function moveTextContourNode(p:Piece,side:'left'|'right',index:number,delta:number):Partial<Piece>{
  const contour=normalizedTextContour(p),values=[...contour[side]],other=contour[side==='left'?'right':'left'];
  if(index<0||index>=values.length)return {};
  values[index]=Math.max(0,Math.min(45,80-other[index],values[index]+delta));
  return side==='left'?{textContourLeft:values}:{textContourRight:values};
}

function contourPolygon(values:number[],side:'left'|'right'){
  const x=(value:number)=>side==='left'?value*2:100-value*2;
  const edge=side==='left'?0:100;
  const points=[`${edge}% 0%`,`${x(values[0])}% 0%`,...values.map((value,index)=>`${x(value)}% ${TEXT_CONTOUR_Y[index]}%`),`${x(values.at(-1)||0)}% 100%`,`${edge}% 100%`];
  return `polygon(${points.join(',')})`;
}

export function textContourShapes(p:Pick<Piece,'textContourLeft'|'textContourRight'>){
  const {left,right}=normalizedTextContour(p);
  return {left:contourPolygon(left,'left'),right:contourPolygon(right,'right')};
}
