import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {moveTextContourNode,normalizedTextContour,textContourShapes,TEXT_CONTOUR_PRESETS} from '../lib/text-contour.ts';
import {readingJpgInput} from '../lib/reading-jpg.ts';
import {regenerateSpread} from '../lib/journal.ts';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const piece=(extra={})=>({id:'text',kind:'text',text:'一整段文字',x:10,y:10,w:40,h:50,rotation:0,locked:false,textFlow:'contour',...extra});

test('freeform contour keeps five bounded nodes on both sides',()=>{
  assert.deepEqual(normalizedTextContour(piece()).left,[0,0,0,0,0]);
  assert.deepEqual(normalizedTextContour(piece({textContourLeft:[-2,10,99,20,5],textContourRight:[0,0,20,90,5]})),{
    left:[0,10,45,20,5],right:[0,0,20,45,5],
  });
  const moved=moveTextContourNode(piece({textContourLeft:[0,0,0,0,0],textContourRight:[0,0,40,0,0]}),'left',2,60);
  assert.deepEqual(moved.textContourLeft,[0,0,40,0,0]);
  assert.deepEqual(moveTextContourNode(piece(),'right',9,10),{});
});

test('contour polygons follow every node and support general presets',()=>{
  const shapes=textContourShapes(piece({textContourLeft:[0,10,20,30,40],textContourRight:[40,30,20,10,0]}));
  assert.match(shapes.left,/polygon\(0% 0%,0% 0%,0% 8%,20% 29%,40% 50%,60% 71%,80% 92%,80% 100%,0% 100%\)/);
  assert.match(shapes.right,/polygon\(100% 0%,20% 0%,20% 8%,40% 29%,60% 50%,80% 71%,100% 92%,100% 100%,100% 100%\)/);
  assert.deepEqual(TEXT_CONTOUR_PRESETS.leftUpper.textContourRight,[0,0,0,0,0]);
  assert.deepEqual(TEXT_CONTOUR_PRESETS.hourglass.textContourLeft,TEXT_CONTOUR_PRESETS.hourglass.textContourRight);
});

test('text tools expose a reversible direct-manipulation contour editor',async()=>{
  const [journal,controls,appearance,page,css]=await Promise.all([
    read('lib/journal.ts'),read('components/collage-tools.tsx'),read('components/piece-appearance.tsx'),read('app/page.tsx'),read('app/globals.css'),
  ]);
  assert.match(journal,/textFlow\?: 'contour'/);
  assert.match(journal,/textContourLeft\?: number\[\]/);
  assert.match(controls,/aria-label="文字轮廓"/);
  assert.match(controls,/<option value="rect">普通矩形<\/option>/);
  assert.match(controls,/<option value="contour">自由轮廓<\/option>/);
  for(const label of ['左上绕开','右上绕开','两侧收腰','恢复直边'])assert.match(controls,new RegExp(`>${label}<`));
  assert.match(controls,/textFlow:undefined,textContourLeft:undefined,textContourRight:undefined/);
  assert.match(appearance,/--text-contour-left/);
  assert.match(appearance,/text-flow-\$\{p\.textFlow\}/);
  assert.match(page,/className="inline-writing inline-shaped-writing"/);
  assert.match(page,/contentEditable="plaintext-only"/);
  assert.match(page,/text-contour-\$\{side\}-\$\{index\}/);
  assert.match(page,/!cluster&&selectedTextContour/);
  assert.match(page,/moveTextContourNode\(source,side,index/);
  assert.match(css,/\.piece\.text-flow-contour \.text-contour-float/);
  assert.match(css,/shape-outside:var\(--text-contour-left\)/);
  assert.match(css,/shape-outside:var\(--text-contour-right\)/);
  assert.match(css,/\.selection-box \.text-contour-handle/);
});

test('contour settings survive page rendering and reject unsafe saved values',async()=>{
  const [preview,server]=await Promise.all([read('components/page-turn.tsx'),read('local/server.mjs')]);
  assert.match(preview,/pieceAppearance\(p\)/);
  assert.match(preview,/pieceClasses\(p\)/);
  assert.match(server,/el\.textFlow !== 'contour'/);
  assert.match(server,/values\.length === 5/);
  assert.match(server,/value >= 0 && value <= 45/);
  assert.match(server,/value \+ el\.textContourRight\[index\] > 80/);
  const book={id:'flow',title:'轮廓文字',month:'2026-09',cover:'linen-oat',spreads:[{id:'s',days:[],elements:[]}]};
  assert.equal(JSON.parse(readingJpgInput(book,[],0)).version,10);
  const shaped=structuredClone(book);
  shaped.spreads[0].elements.push(piece({textContourLeft:[40,30,20,10,0],textContourRight:[0,0,0,0,0]}));
  assert.notEqual(readingJpgInput(shaped,[],0),readingJpgInput(book,[],0));
});

test('AI layout changes preserve a manually shaped text contour',()=>{
  const source=piece({textContourLeft:[40,30,20,10,0],textContourRight:[0,0,10,20,30]});
  const spread={id:'spread',theme:'rose',days:[],elements:[source]};
  const result=regenerateSpread(spread,{theme:'archive',days:[],elements:[{kind:'text',sourceId:source.id,text:source.text,x:20,y:15,w:42,rotation:0}]},[]);
  assert.deepEqual(result.elements[0].textContourLeft,source.textContourLeft);
  assert.deepEqual(result.elements[0].textContourRight,source.textContourRight);
  assert.equal(result.elements[0].textFlow,'contour');
});
