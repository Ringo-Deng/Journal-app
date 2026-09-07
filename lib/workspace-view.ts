export type WorkspacePosition = {page:number;opened:boolean;zoom:number;selected:string|null;scrollTop:number;scrollLeft:number};
export function restorePosition(value: unknown, count:number, hasFlyleaf:boolean): WorkspacePosition {
 const p=(value && typeof value==='object'?value:{}) as Partial<WorkspacePosition>;
 return {page:Math.max(hasFlyleaf?-1:0,Math.min(count-1,Number.isInteger(p.page)?p.page!:0)),opened:p.opened!==false,zoom:[100,115,130,150].includes(p.zoom||0)?p.zoom!:100,selected:typeof p.selected==='string'?p.selected:null,scrollTop:Number.isFinite(p.scrollTop)?Math.max(0,p.scrollTop!):0,scrollLeft:Number.isFinite(p.scrollLeft)?Math.max(0,p.scrollLeft!):0};
}
