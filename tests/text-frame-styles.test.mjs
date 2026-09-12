import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {layoutIssues} from '../lib/layout-safety.mjs';
import {readingJpgInput} from '../lib/reading-jpg.ts';
import {canAddSpreadElements} from '../lib/journal.ts';

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

test('standalone vellum is an independent low-layer drawing and counts as backing paper',async()=>{
  const [page,controls,drawing]=await Promise.all([
    read('app/page.tsx'),read('components/element-controls.tsx'),read('components/journal-drawing.tsx'),
  ]);
  const insert=page.slice(page.indexOf('function addVellumSheet'),page.indexOf('async function cutout'));
  assert.match(insert,/kind: 'doodle'/);
  assert.match(insert,/frame: 'vellum-sheet'/);
  assert.match(insert,/fill: '#f6f0e3bb'/);
  assert.match(insert,/stroke: '#bfb09244'/);
  assert.match(insert,/layerName:'硫酸纸',stackOrder:1/);
  assert.match(insert,/if \(!canAddSpreadElements\(spread\)\)/);
  assert.match(page,/aria-label="插入硫酸纸"/);
  assert.match(controls,/vellumSheet[\s\S]*'硫酸纸'/);
  assert.match(drawing,/p\.frame==='vellum-sheet'\?"non-scaling-stroke"/);

  const text={id:'text',kind:'text',text:'写在纸上',x:10,y:10,w:30,h:20,rotation:0};
  const vellum={id:'vellum',kind:'doodle',frame:'vellum-sheet',x:8,y:8,w:34,h:24,rotation:0};
  assert.deepEqual(layoutIssues([vellum,text]),[]);
  assert.ok(layoutIssues([{...vellum,id:'decor',frame:'plain'},text]).some(issue=>issue.type==='overlap'));

  assert.equal(canAddSpreadElements({elements:Array.from({length:299})}),true);
  assert.equal(canAddSpreadElements({elements:Array.from({length:300})}),false);
});

test('paper renderer invalidates cached reading images after removing text effects',()=>{
  const book={id:'b',title:'硫酸纸',month:'2026-09',cover:'linen-oat',spreads:[{id:'s',days:[],elements:[]}]};
  assert.equal(JSON.parse(readingJpgInput(book,[],0)).version,7);
});
