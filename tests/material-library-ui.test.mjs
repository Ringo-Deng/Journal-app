import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../components/material-library.tsx',import.meta.url),'utf8');
const css=await readFile(new URL('../app/material-library-refresh.css',import.meta.url),'utf8');

test('material library keeps AI organize in the top bar and removes the right action sidebar',()=>{
  assert.match(source,/className="primary ai-organize-top"/);
  assert.match(source,/AI 一键整理/);
  assert.doesNotMatch(source,/className="library-actions"/);
  assert.doesNotMatch(source,/批量整理/);
});

test('library header replaces import with insert and stays compact at medium widths',()=>{
  const heading=source.match(/<header className="library-heading">[\s\S]*?<\/header>/)?.[0];
  assert.ok(heading);
  assert.doesNotMatch(heading,/导入与拆分/);
  assert.match(heading,/className="library-insert"/);
  assert.match(heading,/插入手帐/);
  const mediumHeading=css.match(/@media \(max-width: 1180px\) \{\s*\.library-heading \{[\s\S]*?\n  \}/)?.[0];
  assert.ok(mediumHeading);
  assert.match(mediumHeading,/grid-template-areas: 'back title search ai insert';/);
  assert.doesNotMatch(mediumHeading,/insert insert insert/);
});

test('material cards keep classification in the tag editor and support drag-to-category',()=>{
  assert.doesNotMatch(source,/className="library-card-group"/);
  assert.doesNotMatch(source,/aria-label={`设置\$\{a\.name\}的分类`}/);
  assert.match(source,/aria-label="素材主分类"/);
  assert.match(source,/draggable=\{!!catalog&&!busy\}/);
  assert.match(source,/text\/material-id/);
  assert.match(source,/onDrop=/);
  assert.match(source,/setAssetGroup\(id,g\)/);
});

test('single-line material titles do not reserve a second line',()=>{
  const titleStyles=css.match(/\.library-card strong \{[\s\S]*?\n\}/)?.[0];
  assert.ok(titleStyles);
  assert.doesNotMatch(titleStyles,/min-height:/);
  assert.match(titleStyles,/line-height: 16px;/);
});

test('every material can reopen from its current image instead of requiring its original source',()=>{
  assert.match(source,/async function reopenAsset\(a:Asset\)/);
  assert.match(source,/fetch\(src,\{cache:'no-store'\}\)/);
  assert.match(source,/fetch\('\/api\/upload'/);
  assert.match(source,/request<\{source:string\}>\('\/source',\{src,name:a\.name,replaceAssetId:isUserAsset\(a\)\?a\.id:undefined\}\)/);
  assert.match(source,/onOpenStudio\(source\.source\)/);
  assert.match(source,/title="以当前素材为起点继续抠图或识别"/);
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

test('each material card shows all four actions in a stable two-by-two grid',()=>{
  const actions=source.match(/<div className="library-card-actions">[\s\S]*?<\/div><\/div>\}\)\}/)?.[0];
  assert.ok(actions);
  assert.equal([...actions.matchAll(/<button\b/g)].length,4);
  assert.match(actions,/>编辑标签<\/button>/);
  assert.match(actions,/classifyingId===a\.id\?'识别中…':'AI分类'/);
  assert.match(actions,/>再次编辑<\/button>/);
  assert.match(actions,/onClick=\{\(\)=>void removeAsset\(a\)\}/);
  assert.match(actions,/>删除<\/button>/);
  assert.doesNotMatch(source,/DropdownMenu/);
  assert.match(css,/\.library-card-actions \{[\s\S]*?display: grid;[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(css,/\.library-card-actions \.library-edit,[\s\S]*?width: 100%;[\s\S]*?min-width: 0;[\s\S]*?margin: 0;/);
  assert.match(source,/journal-hidden-materials-v1/);
  assert.match(source,/window\.localStorage\.setItem\(hiddenKey/);
});

test('material deletion runs directly without a browser confirmation dialog',()=>{
  const removeAsset=source.match(/async function removeAsset\(a:Asset\)\{[\s\S]*?\n \}/)?.[0];
  assert.ok(removeAsset);
  assert.doesNotMatch(removeAsset,/window\.confirm\(/);
  assert.match(removeAsset,/request<\{assets:Asset\[\]\}>\('\/remove',\{id:a\.id\}\)/);
});
