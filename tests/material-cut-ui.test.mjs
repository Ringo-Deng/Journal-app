import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [editor, cutter, studio, importer, controls, page, css] = await Promise.all([
  readFile(new URL('../components/material-cut-editor.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/page-material-cutter.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/material-studio.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/material-importer.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/element-controls.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../app/page.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/material-cut-editor.css', import.meta.url), 'utf8'),
]);

test('the custom cutter exposes the approved scissors workflow and keeps every piece reversible', () => {
  for (const label of [
    '直线剪',
    '自由剪',
    '移动裁片',
    '平直',
    '手撕',
    '波浪',
    '锯齿',
    '手撕白纸露出',
    '撤销',
    '重做',
    '恢复原图',
    '移除选中',
  ])
    assert.match(editor, new RegExp(label));
  assert.match(editor, /切缝已保留，还连着/);
  assert.match(editor, /全部留在原位/);
  assert.match(editor, /闭合一圈可以取出中间裁片/);
  assert.match(editor, /const ordered = \[\.\.\.piecesRef\.current\]\.sort/);
});

test('draft cutting stays client-side, uploads incrementally, then applies to the page once', () => {
  assert.doesNotMatch(editor, /fetch\(/);
  assert.doesNotMatch(editor, /\/api\//);
  assert.match(editor, /await onBeforeSave\?\.\(placements as PageMaterialCutPlacement\[\]\)/);
  assert.match(editor, /await onSavePiece\(output/);
  assert.match(editor, /placement:/);
  assert.match(editor, /centerX:/);
  assert.match(editor, /saveSessionRef/);
  assert.match(editor, /for \(let index = savedOutputCountRef\.current; index < ordered\.length; index\+\+\)/);
  assert.doesNotMatch(editor, /Promise\.all\(/);
  assert.match(cutter, /fetch\('\/api\/material-cuts\/upload'/);
  assert.match(cutter, /saveId: progress\.saveId/);
  assert.match(cutter, /savedByIndex\.current\[progress\.index\] = stored/);
  assert.match(cutter, /progress\.index === progress\.total - 1/);
  assert.match(cutter, /await onApply\(target, outputs as PageMaterialCutOutput\[\]\)/);
  assert.match(cutter, /window\.confirm\(/);
  assert.match(cutter, /addEventListener\('beforeunload'/);
  assert.match(cutter, /showCloseButton=\{!saving && !guard\.busy\}/);
});

test('free cutting lives in the selected-material toolbar instead of Material Studio', () => {
  assert.match(controls, /className="quiet compact-material-cut"/);
  assert.match(controls, /<span>自由裁切<\/span>/);
  assert.match(controls, /p\.kind === 'asset' && p\.material !== 'tape'/);
  assert.doesNotMatch(controls, /aria-label="复制素材"|aria-label="剪切素材"/);
  assert.match(page, /onMaterialCut=\{startPageMaterialCut\}/);
  assert.match(page, /sourceSrc=resolveMaterial\(piece\.src,piece\.assetId\)/);
  assert.match(page, /querySelector<HTMLImageElement>\(':scope > img'\)/);
  assert.match(page, /sourceBox:pageMaterialCutSourceBox|sourceBox,/);
  assert.match(page, /<PageMaterialCutter/);
  assert.match(page, /applyPageMaterialCut\(booksRef\.current,target,outputs,uid\)/);
  assert.doesNotMatch(studio, /MaterialCutEditor|openCustomCut|saveCustomCutPiece/);
  assert.doesNotMatch(studio, /<Scissors\/>自由裁切/);
  assert.match(studio, /如需自由裁切，请点“导入新素材”选择“整图入库”，放入手帐后从选中工具栏打开/);
});

test('imports point to the real toolbar workflow when automatic separation is unavailable', () => {
  assert.match(importer, /如需自由裁切，请点“导入新素材”并选择“整图入库”，放入手帐后从选中工具栏打开/);
  assert.match(importer, /可继续点选或框选补漏/);
  assert.doesNotMatch(importer, /可直接自由裁切|自由裁切工作台/);
});

test('custom cutting styles are scoped to the dedicated host and remain pointer safe', () => {
  assert.match(css, /\.page-material-cut-dialog/);
  assert.match(css, /\.material-cut-host \.material-cut-editor/);
  assert.doesNotMatch(css, /\.material-studio \.material-cut-editor/);
  assert.match(css, /touch-action: none/);
  assert.match(css, /\[data-mode="move"\] canvas|\[data-mode='move'\] canvas/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /@media \(max-height: 640px\)/);
  assert.match(editor, /tabIndex=\{0\}/);
  assert.match(editor, /setPointerCapture\(event\.pointerId\)/);
  assert.match(editor, /materialCutVisibleMask\(alpha, width, height\)/);
  assert.match(editor, /materialCutExportGeometry\(/);
});
