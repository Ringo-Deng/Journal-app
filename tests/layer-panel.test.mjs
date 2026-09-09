import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const pagePath=new URL('../app/page.tsx',import.meta.url);
const previewPath=new URL('../components/page-turn.tsx',import.meta.url);
const actionPath=new URL('../components/layer-row-actions.tsx',import.meta.url);
const appearancePath=new URL('../components/piece-appearance.tsx',import.meta.url);
const metaPath=new URL('../lib/layer-meta.ts',import.meta.url);
const stackPath=new URL('../lib/stack-order.ts',import.meta.url);

test('page items panel is promoted to a real layer panel',async()=>{
  const source=await readFile(pagePath,'utf8');
  assert.match(source,/<Layers\/><span>图层<\/span>/);
  assert.match(source,/\? 'LAYERS'/);
  assert.match(source,/\? '图层'/);
  assert.match(source,/\[\.\.\.pageElementRows\]\.reverse\(\)/);
  assert.match(source,/LayerRowActions/);
  assert.match(source,/setLayerVisibility/);
  assert.match(source,/setLayerLocked/);
  assert.match(source,/renameLayer/);
  assert.match(source,/moveLayer/);
});

test('layer row actions stay compact and target the journal canvas stack',async()=>{
  const page=await readFile(pagePath,'utf8');
  const actions=await readFile(actionPath,'utf8');
  const appearance=await readFile(appearancePath,'utf8');
  const meta=await readFile(metaPath,'utf8');
  assert.match(actions,/ArrowDownToLine,ArrowUpToLine/);
  assert.match(actions,/width:22,height:22,padding:3,minWidth:22/);
  assert.match(actions,/size:14,strokeWidth:1\.8/);
  assert.match(actions,/aria-label="置顶图层"/);
  assert.match(actions,/aria-label="置底图层"/);
  assert.match(page,/onUp=\{\(\)=>moveLayer\(members,'up'\)\}/);
  assert.match(page,/onDown=\{\(\)=>moveLayer\(members,'down'\)\}/);
  assert.match(meta,/canvasAction = action === 'up' \? 'top' : action === 'down' \? 'bottom' : action/);
  assert.match(meta,/return reorderStack\(items, memberIds, canvasAction\)/);
  assert.match(appearance,/zIndex:Number\.isFinite\(stackOrder\)\?stackOrder:19/);
});

test('hidden layers stay in data but disappear from editor and previews',async()=>{
  const page=await readFile(pagePath,'utf8');
  const preview=await readFile(previewPath,'utf8');
  assert.match(page,/decorative\.filter\(p=>!isPieceHidden\(p\)\)\.map/);
  assert.match(page,/piece&&!isPieceHidden\(piece\)/);
  assert.match(preview,/spread\.elements\.filter\(\(p\)=>!isPieceHidden\(p\)\)\.map/);
});

test('canvas stack metadata keeps the layer panel data order stable',async()=>{
  const source=await readFile(stackPath,'utf8');
  assert.match(source,/export function reorderStack/);
  assert.match(source,/return items\.map\(\(item\) => \(\{ \.\.\.item, stackOrder:/);
  assert.match(source,/selected\.forEach\(\(item\) => ranks\.set\(item\.id, STACK_MAX\)\)/);
  assert.match(source,/selected\.forEach\(\(item\) => ranks\.set\(item\.id, STACK_MIN\)\)/);
});

test('undo has a matching redo stack and standard shortcuts',async()=>{
  const source=await readFile(pagePath,'utf8');
  assert.match(source,/future = useRef<Book\[\]\[\]>\(\[\]\)/);
  assert.match(source,/const redo = \(\) =>/);
  assert.match(source,/e\.shiftKey&&e\.key\.toLowerCase\(\)==='z'/);
  assert.match(source,/e\.key\.toLowerCase\(\)==='y'/);
  assert.match(source,/aria-label="重做调整"/);
});
