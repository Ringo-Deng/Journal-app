import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../components/material-library.tsx',import.meta.url),'utf8');

test('material library keeps AI organize in the top bar and removes the right action sidebar',()=>{
  assert.match(source,/className="primary ai-organize-top"/);
  assert.match(source,/AI 一键整理/);
  assert.doesNotMatch(source,/className="library-actions"/);
  assert.doesNotMatch(source,/批量整理/);
});

test('each material can be categorized directly and dragged to a main category',()=>{
  assert.match(source,/className="library-card-group"/);
  assert.match(source,/aria-label={`设置\$\{a\.name\}的分类`}/);
  assert.match(source,/draggable=\{!!catalog&&!busy\}/);
  assert.match(source,/text\/material-id/);
  assert.match(source,/onDrop=/);
  assert.match(source,/setAssetGroup\(id,g\)/);
});

test('every material can reopen from its current image instead of requiring its original source',()=>{
  assert.match(source,/async function reopenAsset\(a:Asset\)/);
  assert.match(source,/fetch\(src,\{cache:'no-store'\}\)/);
  assert.match(source,/fetch\('\/api\/upload'/);
  assert.match(source,/request\('\/source',\{src,name:a\.name\}\)/);
  assert.match(source,/title="以当前素材为起点继续抠图、裁切或识别"/);
  assert.match(source,/aria-label={`再次编辑\$\{a\.name\}`}/);
  assert.match(source,/onClick=\{\(\)=>void reopenAsset\(a\)\}/);
  assert.doesNotMatch(source,/request\('\/reopen'/);
});

test('single-material AI classification is available for every material and is not confused with image editing',()=>{
  assert.match(source,/aria-label={`AI分类\$\{a\.name\}`}/);
  assert.match(source,/重新判断这个素材的分类与标签/);
  assert.match(source,/onClick=\{\(\)=>void classify\(\[a\.id\],a\.id\)\}/);
  assert.doesNotMatch(source,/再次识别\$\{a\.name\}/);
});

test('each material card groups all four actions in its more menu',()=>{
  assert.match(source,/<DropdownMenuTrigger[^>]+aria-label=\{`更多操作：\$\{a\.name\}`\}/);
  const menu=source.match(/<DropdownMenuContent className="library-more-menu"[\s\S]*?<\/DropdownMenuContent>/)?.[0];
  assert.ok(menu);
  assert.equal([...menu.matchAll(/<DropdownMenuItem\b/g)].length,4);
  assert.match(menu,/>编辑标签<\/DropdownMenuItem>/);
  assert.match(menu,/classifyingId===a\.id\?'识别中…':'AI分类'/);
  assert.match(menu,/>再次编辑<\/DropdownMenuItem>/);
  assert.match(menu,/variant="destructive"[^>]+onClick=\{\(\)=>void removeAsset\(a\)\}/);
  assert.match(menu,/>删除<\/DropdownMenuItem>/);
  assert.match(source,/window\.confirm\(/);
  assert.match(source,/journal-hidden-materials-v1/);
  assert.match(source,/window\.localStorage\.setItem\(hiddenKey/);
});
