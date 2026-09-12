import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {isPaperTextFrame,textFrameInk} from '../lib/journal.ts';
import {readingJpgInput} from '../lib/reading-jpg.ts';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const frames=['plain','note','collage','outline','torn','underline','ticket','postcard','vellum','label'];
const paperFrames=['note','collage','torn','ticket','postcard','vellum','label'];

test('the text style picker keeps the compatible frame ids and every visible treatment has CSS',async()=>{
  const [controls,css]=await Promise.all([read('components/collage-tools.tsx'),read('app/globals.css')]);
  const picker=controls.slice(controls.indexOf('文本框样式'),controls.indexOf('</select>',controls.indexOf('文本框样式')));
  assert.deepEqual([...picker.matchAll(/\['([^']+)','[^']+'\]/g)].map(match=>match[1]),frames);
  for(const frame of frames.filter(frame=>frame!=='plain')){
    assert.match(css,new RegExp(`\\.piece\\.piece-text\\.${frame}\\s*\\{`));
  }
  assert.match(css,/\.piece\.piece-text:is\([^)]*\.ticket[^)]*\) > \.inline-writing[\s\S]*background:transparent;/);
  assert.doesNotMatch(css,/\.piece-text\.ticket\s*\{[^}]*border-block:/);
  assert.doesNotMatch(css,/\.piece-text\.postcard\s*\{[^}]*outline:/);
  assert.doesNotMatch(css,/\.piece-text\.torn\s*\{[^}]*border-block:/);
});

test('paper frames use readable ink without overriding an explicit text color',()=>{
  for(const frame of frames)assert.equal(isPaperTextFrame(frame),paperFrames.includes(frame));
  const piece=(extra={})=>({kind:'text',frame:'plain',...extra});
  assert.equal(textFrameInk(piece({frame:'note'}),'#f5f5ed'),'#433d34');
  assert.equal(textFrameInk(piece({frame:'ticket',color:'#b36742'}),'#f5f5ed'),'#b36742');
  assert.equal(textFrameInk(piece({background:'#202824'}),'#343b34'),'#f7f1e5');
  assert.equal(textFrameInk(piece({background:'#fff6df'}),'#f5f5ed'),'#433d34');
  assert.equal(textFrameInk(piece({background:'#202824cc'}),'#343b34'),'#f7f1e5');
  assert.equal(textFrameInk(piece({background:'#fff6dfcc'}),'#f5f5ed'),'#433d34');
  assert.equal(textFrameInk(piece({background:'#909090'}),'#343b34'),'#000000');
  assert.equal(textFrameInk(piece({background:'#808080'}),'#343b34'),'#000000');
  assert.equal(textFrameInk(piece({background:'linear-gradient(#222,#333)'}),'#f5f5ed'),'#f5f5ed');
  assert.equal(textFrameInk(piece({frame:'outline'}),'#f5f5ed'),'#f5f5ed');
});

test('editor and shared preview use the same frame ink logic and shape-aware shadows',async()=>{
  const [page,preview,appearance,css]=await Promise.all([
    read('app/page.tsx'),read('components/page-turn.tsx'),read('components/piece-appearance.tsx'),read('app/globals.css'),
  ]);
  assert.match(page,/color:textFrameInk\(p,/);
  assert.match(preview,/color:textFrameInk\(p,/);
  assert.match(appearance,/p\.kind!=='text'\|\|!!p\.frame&&p\.frame!=='plain'/);
  assert.match(css,/\.piece\.has-shadow:not\(\.piece-text\)[^{]*\{box-shadow:var\(--piece-shadow\);\}/);
  assert.match(css,/\.piece\.piece-text:is\(\.torn,\.ticket,\.label\)\.has-shadow\{filter:drop-shadow\(var\(--piece-shadow\)\);\}/);
  assert.match(css,/\.piece\.piece-text\.underline\.has-shadow::after\{box-shadow:var\(--piece-shadow\);\}/);
  assert.match(css,/\.page-turn-layer \.piece\.piece-text\.collage\{box-shadow:-\.45cqw \.42cqw 0 #d6ddbf!important;\}/);
});

test('paper renderer version invalidates cached reading images after the CSS redraw',()=>{
  const book={id:'b',title:'框型',month:'2026-09',cover:'linen-oat',spreads:[{id:'s',days:[],elements:[]}]};
  assert.equal(JSON.parse(readingJpgInput(book,[],0)).version,6);
});
