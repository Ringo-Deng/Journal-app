import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const studioPath=new URL('../components/collage-studio.tsx',import.meta.url);

test('travel collage is replaced by a cross-notebook group clipboard',async()=>{
  const source=await readFile(studioPath,'utf8');
  assert.match(source,/DialogTitle>组合剪贴板/);
  assert.match(source,/shiguang\.groupClipboard/);
  assert.match(source,/fetch\('\/api\/state'\)/);
  assert.match(source,/复制组合/);
  assert.match(source,/组合剪贴板/);
  assert.match(source,/粘贴到当前跨页/);
  assert.match(source,/stopImmediatePropagation\(\)/);
  assert.doesNotMatch(source,/奶油纸 · 旅行手记/);
  assert.doesNotMatch(source,/纸张颜色<input/);
  assert.doesNotMatch(source,/检查遮挡与越界/);
});

test('clipboard copy detaches copied pieces from source journal entries',async()=>{
  const source=await readFile(studioPath,'utf8');
  assert.match(source,/dayId:undefined/);
  assert.match(source,/originIds:undefined/);
  assert.match(source,/sourceDayIds:undefined/);
  assert.match(source,/paragraphIndex:undefined/);
  assert.match(source,/forParagraph:undefined/);
});
