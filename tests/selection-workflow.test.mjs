import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const pagePath=new URL('../app/page.tsx',import.meta.url);
const cssPath=new URL('../app/globals.css',import.meta.url);

test('selection toolbar keeps a fixed slot whether or not a piece is selected', async()=>{
  const [page,css]=await Promise.all([readFile(pagePath,'utf8'),readFile(cssPath,'utf8')]);
  assert.match(page,/opened&&spread&&<div className=\{`fixed-element-tools \$\{piece\?'has-selection':'is-empty'\}`\}/);
  assert.match(css,/\.fixed-element-tools\{[\s\S]*?height:46px;[\s\S]*?min-height:46px;[\s\S]*?max-height:46px;/);
  assert.match(css,/\.fixed-element-tools \.cluster-tools\{[\s\S]*?flex-wrap:nowrap;/);
});

test('multi-selection overlay captures the whole bounding box for dragging and hides transform handles', async()=>{
  const [page,css]=await Promise.all([readFile(pagePath,'utf8'),readFile(cssPath,'utf8')]);
  assert.match(page,/className=\{`selection-box \$\{multiSelection\?'multi-move-box':''\}`\}/);
  assert.match(page,/onPointerDown=\{multiSelection\?e=>pointerDown\(e,piece\.id,'move'\):undefined\}/);
  assert.match(page,/\{!multiSelection&&resizeHandles\.map/);
  assert.match(page,/\{!multiSelection&&<button className="rotate-handle"/);
  assert.match(css,/\.selection-box\.multi-move-box\{[\s\S]*?pointer-events:auto;[\s\S]*?cursor:move;/);
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
