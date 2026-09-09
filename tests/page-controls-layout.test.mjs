import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const layoutPath=new URL('../app/layout.tsx',import.meta.url);
const cssPath=new URL('../app/workbench-page-controls.css',import.meta.url);

test('workbench page controls are promoted into the first toolbar row',async()=>{
  const layout=await readFile(layoutPath,'utf8');
  const css=await readFile(cssPath,'utf8');
  assert.match(layout,/import '\.\/workbench-page-controls\.css';/);
  assert.match(css,/page-navigation:not\(\.cover-navigation\)/);
  assert.match(css,/position: fixed !important/);
  assert.match(css,/button\[aria-label='上一跨页'\] \{ order: 1; \}/);
  assert.match(css,/button\[aria-label='下一跨页'\] \{ order: 3; \}/);
  assert.match(css,/> \.canvas-zoom \{/);
  assert.match(css,/order: 4/);
});

test('open journal reuses the released footer height',async()=>{
  const css=await readFile(cssPath,'utf8');
  assert.match(css,/work-area:has\(\.book-scene:not\(\.cover-stage\)\)/);
  assert.match(css,/100dvh - 150px/);
  assert.match(css,/padding-bottom: 6px/);
});
