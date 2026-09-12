import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {layoutIssues} from '../lib/layout-safety.mjs';
import {readingJpgInput} from '../lib/reading-jpg.ts';
import {canAddSpreadElements} from '../lib/journal.ts';
import {DEFAULT_VELLUM_COLOR,DEFAULT_VELLUM_OPACITY,pieceDisplayOpacity,vellumColor,vellumDisplayOpacity} from '../lib/vellum-sheet.ts';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const oldFrames=['note','collage','outline','torn','underline','ticket','postcard','vellum','label'];

test('text tools keep typography but remove every text box effect',async()=>{
  const [controls,css]=await Promise.all([read('components/collage-tools.tsx'),read('app/globals.css')]);
  const textTools=controls.slice(controls.indexOf("if(p.kind==='text')"),controls.indexOf("if(p.kind==='photo'"));
  assert.match(textTools,/ToolbarPopover label="文字排版"/);
  assert.match(textTools,/label="行距"/);
  assert.match(textTools,/label="字距"/);
  assert.doesNotMatch(textTools,/文本框样式|半透明纸|label="阴影"/);
  for(const frame of oldFrames)assert.doesNotMatch(css,new RegExp(`\\.piece\\.piece-text\\.${frame}(?:\\s|\\{|:|\\.)`));
});

test('editor and shared preview ignore legacy text frame, background and shadow fields',async()=>{
  const [page,preview,appearance]=await Promise.all([
    read('app/page.tsx'),read('components/page-turn.tsx'),read('components/piece-appearance.tsx'),
  ]);
  assert.match(appearance,/return p\.kind==='text'\?'':p\.frame\|\|''/);
  assert.match(page,/\$\{pieceFrameClass\(p\)\}/);
  assert.match(preview,/\$\{pieceFrameClass\(p\)\}/);
  assert.match(page,/color:p\.color\|\|\(!isFlyleaf/);
  assert.match(preview,/color:p\.color\|\|\(!flyleaf/);
  assert.doesNotMatch(page,/background:p\.kind==='text'/);
  assert.doesNotMatch(preview,/background:p\.kind==='text'/);
  assert.match(appearance,/p\.shadow!==undefined&&p\.kind!=='text'/);
});

test('standalone vellum is neutral, independently styled and counts as backing paper',async()=>{
  const [page,controls,details,drawing]=await Promise.all([
    read('app/page.tsx'),read('components/element-controls.tsx'),read('components/collage-tools.tsx'),read('components/journal-drawing.tsx'),
  ]);
  const insert=page.slice(page.indexOf('function addVellumSheet'),page.indexOf('async function cutout'));
  const creationToolbar=page.slice(page.indexOf('<fieldset className="book-tools creation-tools"'),page.indexOf('</fieldset>',page.indexOf('<fieldset className="book-tools creation-tools"')));
  assert.match(insert,/kind: 'doodle'/);
  assert.match(insert,/frame: 'vellum-sheet'/);
  assert.match(insert,/color: DEFAULT_VELLUM_COLOR/);
  assert.match(insert,/opacity: DEFAULT_VELLUM_OPACITY/);
  assert.match(insert,/fill: DEFAULT_VELLUM_COLOR/);
  assert.match(insert,/stroke: VELLUM_BORDER_COLOR/);
  assert.match(insert,/layerName:'硫酸纸',stackOrder:1/);
  assert.match(insert,/if \(!canAddSpreadElements\(spread\)\)/);
  assert.match(creationToolbar,/ToolbarPopover label="添加"/);
  assert.match(creationToolbar,/creation-add-menu/);
  assert.match(creationToolbar,/aria-label="插入硫酸纸"/);
  assert.doesNotMatch(creationToolbar,/<button className="quiet" aria-label="插入硫酸纸"/);
  assert.match(controls,/vellumSheet[\s\S]*'硫酸纸'/);
  assert.match(controls,/compact-vellum-position/);
  assert.match(controls,/!vellumSheet && \([\s\S]*label="透明度"/);
  assert.match(details,/ToolbarPopover label="纸张外观"/);
  assert.match(details,/aria-label="硫酸纸颜色"/);
  assert.match(details,/label="透明度"/);
  assert.match(drawing,/fill=\{vellumSheet\?vellumColor\(p\)/);

  const text={id:'text',kind:'text',text:'写在纸上',x:10,y:10,w:30,h:20,rotation:0};
  const vellum={id:'vellum',kind:'doodle',frame:'vellum-sheet',x:8,y:8,w:34,h:24,rotation:0};
  assert.deepEqual(layoutIssues([vellum,text]),[]);
  assert.ok(layoutIssues([{...vellum,id:'decor',frame:'plain'},text]).some(issue=>issue.type==='overlap'));

  assert.equal(canAddSpreadElements({elements:Array.from({length:299})}),true);
  assert.equal(canAddSpreadElements({elements:Array.from({length:300})}),false);
});

test('legacy warm vellum becomes neutral while preserving its effective transparency',()=>{
  assert.equal(DEFAULT_VELLUM_COLOR,'#edf1f0');
  assert.equal(DEFAULT_VELLUM_OPACITY,.62);
  const legacy={id:'old',kind:'doodle',frame:'vellum-sheet',x:0,y:0,w:20,rotation:0,locked:false,drawing:[{path:'M0 0',fill:'#f6f0e3bb'}]};
  assert.equal(vellumColor(legacy),DEFAULT_VELLUM_COLOR);
  assert.ok(Math.abs(vellumDisplayOpacity(legacy)-187/255)<1e-9);
  assert.ok(Math.abs(pieceDisplayOpacity({...legacy,opacity:.5})-(187/255)*.5)<1e-9);

  const custom={...legacy,color:'#dce8ef',opacity:.4};
  assert.equal(vellumColor(custom),'#dce8ef');
  assert.equal(vellumDisplayOpacity(custom),.4);
  assert.equal(pieceDisplayOpacity(custom),.4);
  assert.equal(vellumDisplayOpacity({...custom,opacity:undefined}),DEFAULT_VELLUM_OPACITY);

  const embeddedAlpha={...legacy,drawing:[{path:'M0 0',fill:'#11223380'}],opacity:.5};
  assert.equal(vellumColor(embeddedAlpha),'#112233');
  assert.ok(Math.abs(vellumDisplayOpacity(embeddedAlpha)-(128/255)*.5)<1e-9);
  assert.equal(vellumDisplayOpacity({...custom,opacity:0}),0);
  assert.equal(vellumDisplayOpacity({...custom,opacity:1}),1);
  assert.equal(vellumDisplayOpacity({...custom,opacity:-1}),0);
  assert.equal(vellumDisplayOpacity({...custom,opacity:2}),1);
});

test('paper renderer invalidates cached reading images after vellum rendering changes',()=>{
  const book={id:'b',title:'硫酸纸',month:'2026-09',cover:'linen-oat',spreads:[{id:'s',days:[],elements:[]}]};
  assert.equal(JSON.parse(readingJpgInput(book,[],0)).version,8);
});
