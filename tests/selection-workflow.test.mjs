import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const pagePath=new URL('../app/page.tsx',import.meta.url);
const cssPath=new URL('../app/globals.css',import.meta.url);

test('selection toolbar keeps a fixed slot whether or not a piece is selected', async()=>{
  const [page,css]=await Promise.all([readFile(pagePath,'utf8'),readFile(cssPath,'utf8')]);
  assert.match(page,/className=\{`fixed-element-tools \$\{piece\?'has-selection':'is-empty'\}`\}/);
  assert.match(css,/\.fixed-element-tools\{[\s\S]*?height:46px;[\s\S]*?min-height:46px;[\s\S]*?max-height:46px;/);
  assert.match(css,/\.fixed-element-tools \.cluster-tools\{[\s\S]*?flex-wrap:nowrap;/);
});

test('multi-selection overlay leaves its interior clickable and keeps edge dragging', async()=>{
  const [page,css]=await Promise.all([readFile(pagePath,'utf8'),readFile(cssPath,'utf8')]);
  assert.match(page,/className=\{`selection-box \$\{multiSelection\?'multi-move-box':''\}`\}/);
  assert.match(page,/className="selection-move-edge edge-top" onPointerDown=\{e=>pointerDown\(e,piece\.id,'move'\)\}/);
  assert.match(page,/\{!multiSelection&&resizeHandles\.map/);
  assert.match(page,/\{!multiSelection&&<button className="rotate-handle"/);
  assert.match(css,/\.selection-box\.multi-move-box\{[\s\S]*?pointer-events:none;/);
  assert.match(css,/\.selection-move-edge\{[\s\S]*?pointer-events:auto;[\s\S]*?cursor:grab;/);
});

test('canvas marquee reuses the shared selection owner and skips locked or hidden pieces',async()=>{
  const page=await readFile(pagePath,'utf8');
  assert.match(page,/onPointerDown=\{canvasSelectionDown\}/);
  assert.match(page,/setSelectionPreviewIds\(idsInSelectionRect\(canvasSelectionGeometry\(\),rect,editingGroup\)\)/);
  assert.match(page,/commitSelectionIds\(mergeSelection\(gesture\.baseSelection,hits,gesture\.toggle\),!!editingGroup\)/);
  assert.match(page,/spread\.elements\.filter\(p=>!p\.locked&&!isPieceHidden\(p\)\)/);
  assert.match(page,/selectPiece\(p,e\.shiftKey\|\|e\.metaKey\|\|e\.ctrlKey\)/);
});

test('pointer moving previews directly and commits only positions for a moved group',async()=>{
  const page=await readFile(pagePath,'utf8');
  assert.match(page,/if\(d\.mode==='move'\)\{d\.lastBox=box;paintPointerMovePreview\(d,box\);return;\}/);
  const commit=page.slice(page.indexOf('function endPointerDrag'),page.indexOf('function cancelPointerDrag'));
  assert.match(commit,/x:p\.x\+dx,y:p\.y\+dy/);
  assert.doesNotMatch(commit,/stretch|w:p\.w|h:p\.h/);
});

test('a completed move drops the shared selection and suppresses its follow-up click',async()=>{
  const page=await readFile(pagePath,'utf8');
  const commit=page.slice(page.indexOf('function endPointerDrag'),page.indexOf('function cancelPointerDrag'));
  const runEnd=new Function('drag','changeSpread','suppressSelectionClick','setSelected','clearPointerMovePreview','setSnapGuides',`${commit}\nendPointerDrag();`);
  const pieces=[{id:'a',x:10,y:20,w:12,h:18},{id:'b',x:30,y:40,w:15,h:10},{id:'other',x:60,y:50,w:9,h:9}];
  let spread={elements:pieces},selected='a',previewCleared=false,guides;
  const suppress={current:false};
  const drag={current:{started:true,mode:'move',box:{x:100,y:100},lastBox:{x:140,y:130},canvasW:1000,canvasH:600,members:pieces.slice(0,2)}};
  runEnd(drag,update=>{spread=update(spread);},suppress,value=>{selected=value;},()=>{previewCleared=true;},value=>{guides=value;});
  assert.deepEqual(spread.elements,[{...pieces[0],x:14,y:25},{...pieces[1],x:34,y:45},pieces[2]]);
  assert.equal(selected,null);
  assert.equal(suppress.current,true);
  assert.equal(drag.current,null);
  assert.equal(previewCleared,true);
  assert.deepEqual(guides,{});
});

test('clicks, cancelled previews and adjustment gestures keep their selection',async()=>{
  const page=await readFile(pagePath,'utf8');
  const commit=page.slice(page.indexOf('function endPointerDrag'),page.indexOf('function cancelPointerDrag'));
  const runEnd=new Function('drag','changeSpread','suppressSelectionClick','setSelected','clearPointerMovePreview','setSnapGuides',`${commit}\nendPointerDrag();`);
  for(const gesture of [null,{started:false,mode:'move'},{started:true,mode:'move'},{started:true,mode:'resize-se'},{started:true,mode:'rotate'},{started:true,mode:'crop'},{started:true,mode:'mask-crop'}]){
    let selected='a',committed=false;
    const drag={current:gesture},suppress={current:false};
    runEnd(drag,()=>{committed=true;},suppress,value=>{selected=value;},()=>{},()=>{});
    assert.equal(selected,'a',JSON.stringify(gesture));
    assert.equal(committed,false,JSON.stringify(gesture));
    assert.equal(suppress.current,false,JSON.stringify(gesture));
    assert.equal(drag.current,null);
  }
  const cancel=page.slice(page.indexOf('function cancelPointerDrag'),page.indexOf('function insertLibraryAssets'));
  assert.doesNotMatch(cancel,/changeSpread|setSelected|suppressSelectionClick/);
});

test('drop click suppression resets for a new gesture and preserves keyboard selection',async()=>{
  const page=await readFile(pagePath,'utf8');
  const down=page.slice(page.indexOf('function pointerDown'),page.indexOf('function pointerMove'));
  assert.match(down,/suppressSelectionClick\.current=false;/);
  assert.ok(down.indexOf('suppressSelectionClick.current=false;')<down.indexOf("if((e.shiftKey||e.metaKey||e.ctrlKey)&&mode==='move')return;"));
  const piece=page.slice(page.indexOf('data-piece-id={p.id}'),page.indexOf('onPointerDown={(e) => pointerDown(e, p.id)}'));
  assert.match(piece,/if\(suppressSelectionClick\.current&&e\.detail>0\)return;[\s\S]*selectPiece\(p,e\.shiftKey\|\|e\.metaKey\|\|e\.ctrlKey\)/);
  assert.match(piece,/onDoubleClick=\{\(\)=>\{if\(!suppressSelectionClick\.current&&!reading&&!p\.locked\)enterGroup\(p\)\}\}/);
  const keyboard=piece.slice(piece.indexOf('onKeyDown'),piece.indexOf('onDoubleClick'));
  assert.match(keyboard,/e\.key === 'Enter'[\s\S]*selectPiece\(p,e\.shiftKey\|\|e\.metaKey\|\|e\.ctrlKey\)/);
  assert.doesNotMatch(keyboard,/suppressSelectionClick/);
});

test('corner resize keeps the visible ratio by default and edge resize stays single-axis',async()=>{
  const page=await readFile(pagePath,'utf8');
  assert.match(page,/d\.members\.length>1\|\|isCornerResizeHandle\(handle\)\|\|\(!maskDraftRef\.current&&proportional\)\|\|e\.shiftKey/);
  assert.match(page,/isCornerResizeHandle\(handle\)\?'自动保持比例':'可单独调整比例'/);
});

test('page item rows show stable group parents with indented selectable members', async()=>{
  const [page,css]=await Promise.all([readFile(pagePath,'utf8'),readFile(cssPath,'utf8')]);
  assert.match(page,/const pageElementRows=\(\(\)=>\{/);
  assert.match(page,/groupNumber\+=1/);
  assert.match(page,/const members=decorative\.filter\(q=>q\.groupId===p\.groupId\)/);
  assert.match(page,/const groupLabel=pieceGroupName\(p\)\|\|`组合\$\{groupNumber\}`/);
  assert.match(page,/className="page-element-children"/);
  assert.match(page,/onClick=\{\(\)=>toggleSidebarSelection\(members\)\}/);
  assert.match(page,/onClick=\{\(\)=>toggleSidebarMember\(member\)\}/);
  assert.match(page,/isPartial=selectedCount>0&&!isSelected/);
  assert.match(css,/\.page-element-children \{[\s\S]*?margin-left: 22px;[\s\S]*?border-left:/);
  assert.match(page,/锁定素材不能加入多选/);
});

test('new text starts empty and editing uses one compact neutral frame', async()=>{
  const [page,css]=await Promise.all([readFile(pagePath,'utf8'),readFile(cssPath,'utf8')]);
  const addText=page.slice(page.indexOf('function addText()'),page.indexOf('async function cutout()'));
  assert.match(addText,/kind: 'text',[\s\S]*?text: '',/);
  assert.match(page,/className="inline-writing"[\s\S]*?rows=\{1\}/);
  assert.doesNotMatch(css,/\.piece-text:empty::before/);
  assert.match(css,/\.inline-writing\{[^}]*min-height:2\.4em;[^}]*border:0;[^}]*box-shadow:inset 0 0 0 1px/);
  assert.match(css,/\.inline-writing:focus,.inline-writing:focus-visible\{[^}]*outline:none;/);
});
