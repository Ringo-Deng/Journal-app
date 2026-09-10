'use client';
import {useEffect,useId,useState} from 'react';
import type {Piece} from '@/lib/journal';
import {maskPath,maskImageRect} from '@/lib/photo-mask.mjs';
export default function PhotoMaskPreview({piece,shape,ratio,photoRotation=0}:{piece:Piece;shape:string;ratio:number;photoRotation?:number}){
  const id=useId().replaceAll(':','');
  const [image,setImage]=useState<{src:string;width:number;height:number}|null>(null);
  useEffect(()=>{let live=true;const img=new Image();img.onload=()=>{if(live)setImage({src:piece.src!,width:img.naturalWidth,height:img.naturalHeight});};img.src=piece.src!;return()=>{live=false;};},[piece.src]);
  const width=100*ratio,height=100;
  const r=image&&image.src===piece.src?maskImageRect(image.width,image.height,width,height,piece.crop??50,piece.cropY??50,piece.cropZoom??1,photoRotation):null;
  return <svg className="photo-mask-preview" width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-label="照片蒙版预览">
    <defs><clipPath id={id}><path transform={`scale(${ratio} 1)`} d={maskPath(shape)}/></clipPath></defs>
    {r&&<g clipPath={`url(#${id})`}><image href={piece.src} {...r} preserveAspectRatio="none" transform={`rotate(${photoRotation} ${width/2} ${height/2}) translate(${piece.flipX?width:0} ${piece.flipY?height:0}) scale(${piece.flipX?-1:1} ${piece.flipY?-1:1})`}/></g>}
  </svg>;
}
