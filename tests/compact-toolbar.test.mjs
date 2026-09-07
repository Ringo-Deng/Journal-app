import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const controlsPath=new URL('../components/element-controls.tsx',import.meta.url);
const collagePath=new URL('../components/collage-tools.tsx',import.meta.url);
const popoverPath=new URL('../components/toolbar-popover.tsx',import.meta.url);

test('single element toolbar groups secondary controls into popovers', async()=>{
  const [controls,collage]=await Promise.all([readFile(controlsPath,'utf8'),readFile(collagePath,'utf8')]);
  assert.match(controls,/ToolbarPopover label="尺寸"/);
  assert.match(controls,/ToolbarPopover label="图层"/);
  assert.match(collage,/ToolbarPopover label="文字样式"/);
  assert.match(collage,/ToolbarPopover label="照片细节"/);
  assert.match(collage,/ToolbarPopover label="质感"/);
  assert.match(collage,/compact-font-control/);
  assert.match(collage,/compact-photo-frame/);
});

test('toolbar popover closes on outside click and escape', async()=>{
  const source=await readFile(popoverPath,'utf8');
  assert.match(source,/document\.addEventListener\('pointerdown', closeOutside\)/);
  assert.match(source,/event\.key === 'Escape'/);
  assert.match(source,/aria-expanded=\{open\}/);
});

test('compact toolbar overrides horizontal scrolling without replacing global stylesheet', async()=>{
  const source=await readFile(popoverPath,'utf8');
  assert.match(source,/\.fixed-element-tools\{overflow:visible!important;overflow-x:visible!important/);
  assert.match(source,/shiguang-v0121-toolbar-styles/);
  assert.doesNotMatch(source,/overflow-x:auto/);
});
