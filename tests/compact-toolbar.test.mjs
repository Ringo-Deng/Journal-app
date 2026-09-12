import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const controlsPath=new URL('../components/element-controls.tsx',import.meta.url);
const collagePath=new URL('../components/collage-tools.tsx',import.meta.url);
const popoverPath=new URL('../components/toolbar-popover.tsx',import.meta.url);
const pagePath=new URL('../app/page.tsx',import.meta.url);
const cssPath=new URL('../app/globals.css',import.meta.url);

test('single element toolbar groups secondary controls into popovers', async()=>{
  const [controls,collage]=await Promise.all([readFile(controlsPath,'utf8'),readFile(collagePath,'utf8')]);
  assert.match(controls,/ToolbarPopover label="尺寸"/);
  assert.match(controls,/ToolbarPopover label="位置"/);
  assert.match(controls,/ToolbarPopover label="图层"/);
  assert.match(controls,/className="quiet compact-material-cut"/);
  assert.match(controls,/<span>自由裁切<\/span>/);
  assert.doesNotMatch(controls,/compact-copy|compact-cut/);
  assert.match(controls,/label="透明度"/);
  assert.match(controls,/水平居中/);
  assert.match(controls,/垂直居中/);
  assert.match(collage,/ToolbarPopover label="文字排版"/);
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
  assert.match(source,/closeOnAction && \(event\.target as Element\)\.closest\('button'\)/);
});

test('compact toolbar overrides horizontal scrolling without replacing global stylesheet', async()=>{
  const source=await readFile(popoverPath,'utf8');
  assert.match(source,/\.fixed-element-tools\{overflow:visible!important;overflow-x:visible!important/);
  assert.match(source,/shiguang-v0121-toolbar-styles/);
  assert.doesNotMatch(source,/overflow-x:auto/);
});

test('secondary inserts share an add menu while the obsolete more panel stays removed', async()=>{
  const [controls,popover,page,css]=await Promise.all([
    readFile(controlsPath,'utf8'),
    readFile(popoverPath,'utf8'),
    readFile(pagePath,'utf8'),
    readFile(cssPath,'utf8'),
  ]);
  assert.doesNotMatch(controls,/onMore|compact-more-button|>更多</);
  assert.doesNotMatch(popover,/compact-more-button/);
  assert.doesNotMatch(page,/setPanel\('edit'\)|panel\s*===\s*'edit'|调整这一小片|MAKE IT YOURS/);
  assert.match(page,/useState<'write' \| 'elements' \| null>/);
  assert.match(page,/ToolbarPopover label="添加"[\s\S]*panelClassName="creation-add-menu"/);
  assert.match(page,/aria-label="插入硫酸纸"/);
  assert.match(page,/aria-label="粘贴素材"/);
  assert.match(css,/\.creation-tools>button\.quiet,\.creation-tools>\.toolbar-popover>\.toolbar-popover-trigger\{gap:3px;padding:6px;font-size:11px;\}/);
});
