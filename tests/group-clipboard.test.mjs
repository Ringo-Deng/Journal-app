import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const studioPath=new URL('../components/collage-studio.tsx',import.meta.url);
const controlsPath=new URL('../components/element-controls.tsx',import.meta.url);

test('group clipboard is headless and uses native copy paste shortcuts',async()=>{
  const source=await readFile(studioPath,'utf8');
  assert.match(source,/return null;/);
  assert.match(source,/shiguang\.groupClipboard/);
  assert.match(source,/sessionClipboard/);
  assert.match(source,/Session clipboard still supports same-tab paste/);
  assert.match(source,/shortcut==='c'/);
  assert.match(source,/shortcut==='x'/);
  assert.match(source,/shortcut==='v'/);
  assert.match(source,/window\.addEventListener\('keydown'/);
  assert.match(source,/onInsert\(payload\.template\)/);
  assert.match(source,/copySelection\(\)\.then\(source=>\{if\(source\)onCut\(source\);\}\)/);
  assert.match(source,/sourceSpreadId:sourceSpread\.id/);
  assert.match(source,/pieceIds:pieces\.map/);
  assert.match(source,/\.piece\.selected\[data-piece-id\]/);
  assert.match(source,/AUTOSAVE_SETTLE_MS=650/);
  assert.doesNotMatch(source,/DialogTitle/);
  assert.doesNotMatch(source,/粘贴到当前跨页/);
});

test('clipboard buttons leave the single toolbar while all shortcut and grouped flows remain',async()=>{
  const [studio,controls,page]=await Promise.all([
    readFile(studioPath,'utf8'),
    readFile(controlsPath,'utf8'),
    readFile(new URL('../app/page.tsx',import.meta.url),'utf8'),
  ]);
  assert.doesNotMatch(controls,/aria-label="复制素材"|aria-label="剪切素材"/);
  assert.doesNotMatch(controls,/compact-copy|compact-cut/);
  assert.match(page,/e\.key\.toLowerCase\(\)==='d'/);
  assert.match(page,/>剪切所选</);
  assert.match(page,/>复制组合</);
  assert.match(page,/cutRequest=\{clipboardCutRequest\}/);
  assert.match(page,/pasteRequest=\{clipboardPasteRequest\}/);
  assert.match(page,/suspended=\{!!modal\}/);
  assert.match(page,/<ClipboardPaste\/><span>粘贴<\/span>/);
  assert.match(studio,/lastCutRequest/);
  assert.match(studio,/lastPasteRequest/);
  assert.match(studio,/if\(suspended\|\|event\.repeat/);
});

test('obsolete collage controls are removed from the visible editor',async()=>{
  const source=await readFile(studioPath,'utf8');
  assert.match(source,/label==='旅行拼贴'\|\|label==='组合剪贴板'/);
  assert.match(source,/label==='保存组合'/);
  assert.match(source,/button\.hidden=true/);
  assert.match(source,/button\.textContent='复制副本'/);
});

test('cross notebook copy detaches source journal linkage',async()=>{
  const source=await readFile(studioPath,'utf8');
  assert.match(source,/dayId:undefined/);
  assert.match(source,/originIds:undefined/);
  assert.match(source,/sourceDayIds:undefined/);
  assert.match(source,/paragraphIndex:undefined/);
  assert.match(source,/forParagraph:undefined/);
  assert.match(source,/ratio:bookFormat\(sourceBook\)\.ratio/);
});
