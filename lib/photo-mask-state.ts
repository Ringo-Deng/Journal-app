import type {Book,Piece} from './journal';
export type PhotoMaskDraft={pieceId:string;bookId:string;spreadId:string;before:Piece;piece:Piece;photoRotation:number;imageWidth:number;imageHeight:number;shape:string;generating:boolean;token:string};
export type PhotoTrashEntry={id:string;src:string;resultSrc:string;createdAt:string;bookId:string;spreadId:string;pieceId:string;original:Piece;applied?:Piece};
function samePhoto(a:Piece,b:Piece){
  const ordered=(p:Piece)=>JSON.stringify(Object.fromEntries(Object.entries(p).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b))));
  return ordered(a)===ordered(b);
}
export function appliedPhotoMask(piece:Piece,src:string):Piece {
  const result={...piece,src,frame:'masked',hideTape:true,crop:50,cropY:50,cropZoom:1,flipX:false,flipY:false,stretch:true,cutoutOutline:piece.cutoutOutline??.18};
  delete result.photoOriginal;
  return result;
}
export function restorePhotoMask(books:Book[],entry:PhotoTrashEntry,bookId:string,spreadId:string,id:string):Book[] {
  const sourceBook=books.find(b=>b.id===entry.bookId),sourceSpread=[sourceBook?.flyleaf,...(sourceBook?.spreads||[])].find(s=>s?.id===entry.spreadId);
  const target=sourceSpread?.elements.find(p=>p.id===entry.pieceId);
  // Any subsequent edit (including geometry) preserves the edited result.
  const replace=!!target&&target.src===entry.resultSrc&&!!entry.applied&&samePhoto(target,entry.applied);
  const destBookId=replace?entry.bookId:bookId,destSpreadId=replace?entry.spreadId:spreadId;
  let found=false;
  const result=books.map(b=>b.id!==destBookId?b:{...b,...(b.flyleaf?{flyleaf:update(b.flyleaf)}:{}),spreads:b.spreads.map(update)});
  function update(s:NonNullable<Book['flyleaf']>){
    if(s.id!==destSpreadId)return s;
    found=true;
    if(replace)return {...s,elements:s.elements.map(p=>p.id===entry.pieceId?{...entry.original}:p),days:s.days.map(d=>({...d,photos:d.photos.map(src=>src===entry.resultSrc?entry.src:src)}))};
    if(s.elements.length>=300)throw Error('本页素材过多，请翻到新页恢复。');
    const original={...entry.original,id,x:Math.max(0,Math.min(55,100-entry.original.w)),y:Math.max(0,Math.min(15,100-(entry.original.h??15))),locked:false};
    delete original.groupId;delete original.attachedTo;delete original.dayId;
    return {...s,elements:[...s.elements,original]};
  }
  if(!found)throw Error('请先打开要恢复照片的跨页。');
  return result;
}

export function applyMaskToBooks(books:Book[],draft:PhotoMaskDraft,src:string):Book[]{
  let found=false;
  const next=books.map(b=>b.id!==draft.bookId?b:{...b,flyleaf:b.flyleaf?update(b.flyleaf):undefined,spreads:b.spreads.map(update)});
  function update(s:NonNullable<Book['flyleaf']>){
    if(s.id!==draft.spreadId)return s;
    const target=s.elements.find(p=>p.id===draft.pieceId);
    if(!target||!samePhoto(target,draft.before))throw Error('照片已改变，请重新打开蒙版。');
    found=true;const result=appliedPhotoMask(draft.piece,src);
    const originalStillUsed=s.elements.some(p=>p.id!==target.id&&(p.src===target.src||p.photoOriginal===target.src));
    return {...s,elements:s.elements.map(p=>p.id===target.id?result:p),days:s.days.map(d=>d.id===target.dayId&&!originalStillUsed?{...d,photos:d.photos.map(url=>url===target.src?src:url)}:d)};
  }
  if(!found)throw Error('照片所在页面已改变。');
  return next;
}
