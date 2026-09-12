import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [editor, studio, importer, css] = await Promise.all([
  readFile(new URL("../components/material-cut-editor.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/material-studio.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/material-importer.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/material-cut-editor.css", import.meta.url), "utf8"),
]);

test("the custom cutter exposes the approved scissors workflow and keeps every piece reversible", () => {
  for (const label of [
    "直线剪",
    "自由剪",
    "移动裁片",
    "平直",
    "手撕",
    "波浪",
    "锯齿",
    "手撕白纸露出",
    "撤销",
    "重做",
    "恢复原图",
    "移除选中",
  ])
    assert.match(editor, new RegExp(label));
  assert.match(editor, /切缝已保留，还连着/);
  assert.match(editor, /全部留在原位/);
  assert.match(editor, /闭合一圈可以取出中间裁片/);
  assert.match(editor, /const ordered = \[\.\.\.piecesRef\.current\]\.sort/);
});

test("draft cutting stays in the browser and persists only through the final studio callback", () => {
  assert.doesNotMatch(editor, /fetch\(/);
  assert.doesNotMatch(editor, /\/api\//);
  assert.match(editor, /await onSavePiece\(output/);
  assert.match(editor, /saveSessionRef/);
  assert.match(editor, /savedOutputCountRef/);
  assert.match(editor, /for \(let index = savedOutputCountRef\.current; index < ordered\.length; index\+\+\)/);
  assert.doesNotMatch(editor, /Promise\.all\(/);
  assert.match(studio, /async function saveCustomCutPiece/);
  assert.doesNotMatch(studio.slice(studio.indexOf("async function saveCustomCutPiece"), studio.indexOf("async function rerun")), /fetch\(/);
  assert.match(studio, /request<Job>\(['"]\/add-data-item['"]/);
  assert.match(studio, /saveId:step\.saveId/);
  assert.match(studio, /setSelected\(\[\.\.\.session\.freshIds\]\)/);
  assert.match(studio, /onCancel=\{leaveCustomCut\}/);
  assert.match(studio, /window\.confirm\(/);
  assert.match(studio, /addEventListener\(['"]beforeunload['"]/);
  assert.match(studio, /removeEventListener\(['"]beforeunload['"]/);
  assert.match(studio, /showCloseButton=\{!busy&&!cutGuard\.busy\}/);
});

test("the studio keeps custom cutting primary, point selection advanced, and replacement wording explicit", () => {
  const customAt = studio.indexOf("<Scissors/>自由裁切"),
    detailsAt = studio.indexOf('<details className="studio-advanced">'),
    pointAt = studio.indexOf("'点选素材'", detailsAt);
  assert.ok(customAt > 0 && detailsAt > customAt && pointAt > detailsAt);
  assert.match(studio, /更新原素材/);
  assert.match(studio, /replacementItemId/);
  assert.match(studio, /此裁片将更新原素材/);
  assert.match(studio, /保存并更新原素材/);
  assert.match(studio, /更新原素材并新增/);
  assert.match(studio, /只选中这次的新结果/);
  assert.match(studio, /targetSource\?list\.find\(job=>job\.source===targetSource\):list\[0\]/);
  assert.match(studio, /素材处理记录已不存在/);
});

test("local imports always create a source job so manual custom cutting remains available", () => {
  const sourceAt = importer.indexOf("request<Job>('/source'"),
    segmentAt = importer.indexOf("request<Job>('/segment'");
  assert.ok(sourceAt > 0 && segmentAt > sourceAt);
  assert.match(importer, /if\(!source\.manualOnly\)/);
  assert.match(importer, /自动识别未完成，原图已保留，可直接自由裁切/);
  assert.match(importer, /可以直接使用自由裁切/);
});

test("custom cutting styles stay scoped to Material Studio and support pointer-safe canvas use", () => {
  assert.match(css, /\.material-studio \.material-cut-editor/);
  assert.match(css, /touch-action: none/);
  assert.match(css, /\[data-mode="move"\] canvas|\[data-mode='move'\] canvas/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /@media \(max-height: 640px\)/);
  assert.match(editor, /tabIndex=\{0\}/);
  assert.match(editor, /setPointerCapture\(event\.pointerId\)/);
  assert.match(editor, /materialCutVisibleMask\(alpha, width, height\)/);
  assert.match(editor, /materialCutExportGeometry\(/);
  assert.match(editor, /baseMask: target\.baseMask/);
  assert.match(editor, /baseMask: separated \? item\.mask : target\.baseMask/);
});
