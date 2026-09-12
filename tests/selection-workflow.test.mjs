import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';

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

test('a moved piece settles at its final DOM position before the preview is cleared',async()=>{
  const page=await readFile(pagePath,'utf8');
  const source=page.slice(page.indexOf('function settlePointerMovePreview'),page.indexOf('function pointerDown'));
  const runSettle=new Function('canvas','selectedNode','dragValue','dx','dy',`${stripTypeScriptTypes(source)}\nsettlePointerMovePreview(dragValue,dx,dy);`);
  const properties=new Map(),selectionProperties=new Map();
  const style=properties=>({setProperty:(name,value)=>properties.set(name,value)});
  const piece={style:style(properties)},selection={style:style(selectionProperties)};
  runSettle({current:{querySelector:()=>selection}},()=>piece,{members:[{id:'asset',x:12,y:18}],lastBox:{x:365,y:276}},24.5,28);
  assert.deepEqual(Object.fromEntries(properties),{left:'36.5%',top:'46%'});
  assert.deepEqual(Object.fromEntries(selectionProperties),{left:'365px',top:'276px'});
  const commit=page.slice(page.indexOf('function endPointerDrag'),page.indexOf('function cancelPointerDrag'));
  assert.ok(commit.indexOf('settlePointerMovePreview(d,dx,dy)')<commit.indexOf('changeSpread('));
  assert.ok(commit.indexOf('changeSpread(')<commit.indexOf('clearPointerMovePreview()'));
});

test('canvas movement stays free of automatic snapping and blue guides',async()=>{
  const page=await readFile(pagePath,'utf8');
  const move=page.slice(page.indexOf('function pointerDown'),page.indexOf('function endPointerDrag'));
  assert.match(move,/box\.x=d\.box\.x\+limited\.x;box\.y=d\.box\.y\+limited\.y;/);
  assert.doesNotMatch(page,/from '@\/lib\/snap-guides'/);
  assert.doesNotMatch(move,/snapMoveBox|snapGuides|altKey/);
  assert.doesNotMatch(page,/rgba\(59,130,246/);
  assert.match(page,/拖动元素自由调整位置/);
});

test('a completed move drops the shared selection and suppresses its follow-up click',async()=>{
  const page=await readFile(pagePath,'utf8');
  const commit=page.slice(page.indexOf('function endPointerDrag'),page.indexOf('function cancelPointerDrag'));
  const runEnd=new Function('drag','changeSpread','suppressSelectionClick','setSelected','clearPointerMovePreview','settlePointerMovePreview',`${commit}\nendPointerDrag();`);
  const pieces=[{id:'a',x:10,y:20,w:12,h:18},{id:'b',x:30,y:40,w:15,h:10},{id:'other',x:60,y:50,w:9,h:9}];
  let spread={elements:pieces},selected='a',previewCleared=false;
  const suppress={current:false};
  const drag={current:{started:true,mode:'move',box:{x:100,y:100},lastBox:{x:140,y:130},canvasW:1000,canvasH:600,members:pieces.slice(0,2)}};
  let settled=null;
  runEnd(drag,update=>{spread=update(spread);},suppress,value=>{selected=value;},()=>{previewCleared=true;},(_drag,dx,dy)=>{settled={dx,dy};});
  assert.deepEqual(spread.elements,[{...pieces[0],x:14,y:25},{...pieces[1],x:34,y:45},pieces[2]]);
  assert.equal(selected,null);
  assert.equal(suppress.current,true);
  assert.equal(drag.current,null);
  assert.equal(previewCleared,true);
  assert.deepEqual(settled,{dx:4,dy:5});
});

test('an interrupted move commits its last visible position instead of jumping back',async()=>{
  const page=await readFile(pagePath,'utf8');
  const source=page.slice(page.indexOf('function endPointerDrag'),page.indexOf('function insertLibraryAssets'));
  const runCancel=new Function('drag','changeSpread','suppressSelectionClick','setSelected','clearPointerMovePreview','settlePointerMovePreview',`${source}\ncancelPointerDrag();`);
  const pieces=[{id:'asset',kind:'asset',x:12,y:18,w:20,h:14},{id:'other',kind:'asset',x:70,y:60,w:10,h:10}];
  let spread={elements:pieces},selected='asset',previewCleared=false;
  const suppress={current:false};
  const drag={current:{started:true,mode:'move',box:{x:120,y:108},lastBox:{x:365,y:276},canvasW:1000,canvasH:600,members:[pieces[0]]}};
  runCancel(drag,update=>{spread=update(spread);},suppress,value=>{selected=value;},()=>{previewCleared=true;},()=>{});
  assert.deepEqual(spread.elements,[{...pieces[0],x:36.5,y:46},pieces[1]]);
  assert.equal(selected,null);
  assert.equal(suppress.current,true);
  assert.equal(drag.current,null);
  assert.equal(previewCleared,true);
});

test('clicks and adjustment gestures without a move preview keep their selection',async()=>{
  const page=await readFile(pagePath,'utf8');
  const commit=page.slice(page.indexOf('function endPointerDrag'),page.indexOf('function cancelPointerDrag'));
  const runEnd=new Function('drag','changeSpread','suppressSelectionClick','setSelected','clearPointerMovePreview','settlePointerMovePreview',`${commit}\nendPointerDrag();`);
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
  assert.match(cancel,/endPointerDrag\(\)/);
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

test('resize only accepts its active pressed pointer and ends safely after release',async()=>{
  const page=await readFile(pagePath,'utf8');
  const source=page.slice(page.indexOf('function pointerMove'),page.indexOf('function cancelPointerDrag'));
  const runMove=new Function('runtime','event',`
    const {drag,remember,resizeBox,isCornerResizeHandle,maskDraftRef,proportional,
      patchPiece,clearPointerMovePreview}=runtime;
    ${stripTypeScriptTypes(source)}
    pointerMove(event);
  `);
  const cases=[
    {name:'released mouse',pointerId:7,buttons:0,ends:true},
    {name:'released mouse after resizing',pointerId:7,buttons:0,ends:true,started:true},
    {name:'only a secondary button remains',pointerId:7,buttons:2,ends:true},
    {name:'another pressed pointer',pointerId:8,buttons:1,ends:false},
    {name:'another released pointer',pointerId:8,buttons:0,ends:false},
    {name:'active resize pointer',pointerId:7,buttons:1,updates:true},
  ];
  for(const scenario of cases){
    const gesture={id:'a',pointerId:7,x:20,y:20,started:!!scenario.started,mode:'resize-e',
      box:{x:100,y:80,w:200,h:100,rotation:0},canvasW:1000,canvasH:600,members:[{id:'a'}]};
    const drag={current:gesture},patches=[],resizeCalls=[];
    let remembered=0,cleared=0;
    const runtime={drag,remember:()=>remembered++,maskDraftRef:{current:null},proportional:false,
      isCornerResizeHandle:()=>false,clearPointerMovePreview:()=>cleared++,
      resizeBox:(...args)=>{resizeCalls.push(args);return {...gesture.box,w:240};},
      patchPiece:(...args)=>patches.push(args)};
    runMove(runtime,{...scenario,clientX:60,clientY:20,shiftKey:false});
    if(scenario.updates){
      assert.equal(resizeCalls.length,1,scenario.name);
      assert.deepEqual(resizeCalls[0],[gesture.box,'e',40,0,false]);
      assert.deepEqual(patches,[['a',{x:10,y:80/600*100,w:24,h:100/600*100,stretch:true},false]]);
      assert.equal(remembered,1);
      assert.equal(drag.current,gesture);
    }else{
      assert.deepEqual(resizeCalls,[],scenario.name);
      assert.deepEqual(patches,[],scenario.name);
      assert.equal(remembered,0,scenario.name);
      assert.equal(gesture.started,!!scenario.started,scenario.name);
      assert.equal(drag.current,scenario.ends?null:gesture,scenario.name);
    }
    assert.equal(cleared,scenario.ends?1:0,scenario.name);
  }
});

test('piece and adjustment handles release only their own pointer capture',async()=>{
  const page=await readFile(pagePath,'utf8');
  const surfaces=[
    page.slice(page.indexOf('data-piece-id={p.id}'),page.indexOf("{p.kind === 'text' ? (",page.indexOf('data-piece-id={p.id}'))),
    page.slice(page.indexOf('data-selection-box\n'),page.indexOf('{multiSelection&&<>',page.indexOf('data-selection-box\n'))),
  ];
  for(const source of surfaces){
    for(const eventName of ['PointerUp','PointerCancel','LostPointerCapture']){
      const expression=source.match(new RegExp(`on${eventName}=\\{(e=>\\{[^\\n]+\\})\\}`))?.[1];
      assert.ok(expression,`${eventName} is bound on each drag surface`);
      const run=new Function('drag','endPointerDrag','cancelPointerDrag',`return (${expression});`);
      const drag={current:{pointerId:7}};
      let ended=0,cancelled=0;
      const handler=run(drag,()=>ended++,()=>cancelled++);
      handler({pointerId:8});
      assert.equal(ended+cancelled,0,`${eventName} ignores another pointer`);
      handler({pointerId:7});
      assert.equal(ended,eventName==='PointerUp'?1:0,eventName);
      assert.equal(cancelled,eventName==='PointerUp'?0:1,eventName);
      drag.current=null;
      handler({pointerId:7});
      assert.equal(ended+cancelled,1,`${eventName} is safe after completion`);
    }
  }
});

test('mouse resizing uses visible handles while coarse pointers retain larger touch targets',async()=>{
  const css=await readFile(cssPath,'utf8');
  const coarse=/@media\s*\(\s*pointer\s*:\s*coarse\s*\)\s*\{\s*\.selection-box \.resize-handle::after\s*\{[^}]*inset:\s*-6px;[^}]*\}\s*\}/g;
  assert.equal([...css.matchAll(coarse)].length,1);
  assert.doesNotMatch(css.replace(coarse,''),/\.selection-box \.resize-handle::after/);
  assert.match(css,/\.selection-box\{[^}]*pointer-events:none;/);
  assert.match(css,/\.selection-box button\{[^}]*pointer-events:auto;/);
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
