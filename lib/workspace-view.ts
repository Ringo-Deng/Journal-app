import type { Book } from './journal';

export type WorkspacePosition = {page:number;opened:boolean;zoom:number;selected:string|null;scrollTop:number;scrollLeft:number};
export function restorePosition(value: unknown, count:number, hasFlyleaf:boolean): WorkspacePosition {
 const p=(value && typeof value==='object'?value:{}) as Partial<WorkspacePosition>;
 return {page:Math.max(hasFlyleaf?-1:0,Math.min(count-1,Number.isInteger(p.page)?p.page!:0)),opened:p.opened!==false,zoom:[100,115,130,150].includes(p.zoom||0)?p.zoom!:100,selected:typeof p.selected==='string'?p.selected:null,scrollTop:Number.isFinite(p.scrollTop)?Math.max(0,p.scrollTop!):0,scrollLeft:Number.isFinite(p.scrollLeft)?Math.max(0,p.scrollLeft!):0};
}

/** History can remove the active book or page; keep the cursor on an existing sheet. */
export function restoreHistoryPosition(books: Book[], bookId: string, page: number, opened: boolean) {
 const book=books.find(item=>item.id===bookId)||books[0];
 if(!book)return {bookId:'',page:-1,opened:false};
 const position=restorePosition({page,opened},book.spreads.length,!!book.flyleaf);
 return {bookId:book.id,page:position.page,opened:opened&&!!(position.page===-1?book.flyleaf:book.spreads[position.page])};
}
