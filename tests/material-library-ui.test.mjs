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
  assert.match(source,/aria-label={`再次编辑\$\{a\.name\}`}/);
  assert.match(source,/onClick=\{\(\)=>void reopenAsset\(a\)\}/);
  assert.doesNotMatch(source,/request\('\/reopen'/);
});
