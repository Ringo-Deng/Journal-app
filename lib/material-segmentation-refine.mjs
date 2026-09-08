function connectedComponents(mask,width,height){
 const seen=new Uint8Array(mask.length);const sizes=[];
 const stack=[];
 for(let start=0;start<mask.length;start++){
  if(!mask[start]||seen[start])continue;
  seen[start]=1;stack.length=0;stack.push(start);let size=0;
  while(stack.length){
   const p=stack.pop();size++;const x=p%width,y=Math.floor(p/width);
   if(x>0){const q=p-1;if(mask[q]&&!seen[q]){seen[q]=1;stack.push(q)}}
   if(x+1<width){const q=p+1;if(mask[q]&&!seen[q]){seen[q]=1;stack.push(q)}}
   if(y>0){const q=p-width;if(mask[q]&&!seen[q]){seen[q]=1;stack.push(q)}}
   if(y+1<height){const q=p+width;if(mask[q]&&!seen[q]){seen[q]=1;stack.push(q)}}
  }
  sizes.push(size);
 }
 return sizes.sort((a,b)=>b-a);
}

export function hasThinBridge(alpha,width,height,{threshold=48}={}){
 if(!alpha||width<48||height<48||alpha.length<width*height)return false;
 const occupied=new Uint8Array(width*height);let total=0;
 for(let i=0;i<occupied.length;i++)if(alpha[i]>threshold){occupied[i]=1;total++}
 if(total<Math.max(120,width*height*.025))return false;
 const eroded=new Uint8Array(occupied.length);
 for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
  const i=y*width+x;
  if(occupied[i]&&occupied[i-1]&&occupied[i+1]&&occupied[i-width]&&occupied[i+width])eroded[i]=1;
 }
 const parts=connectedComponents(eroded,width,height);
 if(parts.length<2)return false;
 const substantial=Math.max(36,Math.round(total*.16));
 const major=parts.filter(size=>size>=substantial);
 if(major.length<2)return false;
 // A thin accidental bridge should connect two real masses. Requiring the two
 // largest eroded masses to retain most of the original pixels avoids splitting
 // lettering, stems and other intentionally narrow details.
 return major[0]+major[1]>=total*.58&&major[1]>=total*.20;
}

export function acceptDenseRefinement(beforeItems,afterItems){
 if(!Array.isArray(beforeItems)||!Array.isArray(afterItems)||!beforeItems.length)return false;
 if(afterItems.length<=beforeItems.length)return false;
 const maxCount=Math.max(beforeItems.length+6,Math.ceil(beforeItems.length*2.5),beforeItems.length===1?4:0);
 if(afterItems.length>maxCount)return false;
 if(afterItems.some(item=>Number(item?.width)<10||Number(item?.height)<10))return false;
 if(beforeItems.length===1){
  const sourceArea=Math.max(1,Number(beforeItems[0]?.width)*Number(beforeItems[0]?.height));
  const meaningful=afterItems.filter(item=>Number(item?.width)*Number(item?.height)>=sourceArea*.035);
  if(meaningful.length<2)return false;
 }
 return true;
}
