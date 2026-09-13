import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ui = await readFile('components/material-studio.tsx', 'utf8');
const styles = await readFile('app/globals.css', 'utf8');
const server = await readFile('local/server.mjs', 'utf8');
const segment = await readFile('local/segment.swift', 'utf8');

test('processed material keeps fallback-recognition and delete actions', () => {
  assert.match(ui, />换一种策略</);
  assert.match(ui, /function recognizeWithNextMode\(\)/);
  assert.match(ui, /setMode\(next\.id\);void rerun\(undefined,next\.id\)/);
  assert.match(ui, />删除记录</);
  assert.doesNotMatch(ui, /continue: true/);
  assert.match(ui, /正在切换到「\$\{nextModeLabel\}」识别/);
  assert.match(server, /\/api\/materials\/delete/);
});

test('imported materials are deducted only from the non-destructive source preview', () => {
  assert.match(ui, /function DeductedMaterialPreview/);
  assert.match(ui, /if\(!item\.imported\)return null/);
  assert.match(ui, /item\.sourceBounds\|\|\(!item\.manual\|\|item\.pointSelected\?item\.bounds:undefined\)/);
  assert.match(ui, /globalCompositeOperation='source-in'/);
  assert.match(ui, /<DeductedMaterialPreview items=\{job\.items\} dimensions=\{dimensions\}\/>/);
  assert.match(ui, /sourceBounds:rect/);
  assert.match(server, /sourceBounds: located\.bounds/);
  assert.match(server, /const sourceBounds=mapMaterialSourceBounds\(item\.bounds,rect\)/);
});

test('whole-image recognition keeps the original preview ready', () => {
  assert.match(ui, /function choose\(j:Job,preservePreview=j\.source===previewSource\.current\)/);
  assert.match(ui, /previewSource\.current=j\.source/);
  assert.match(ui, /previewSource\.current='';setActive/);
  assert.match(ui, /if\(!preservePreview\)\{setZoom\(100\);setImageReady\(false\);setDimensions\(\{w:1,h:1\}\)\}/);
  assert.match(ui, /else choose\(next,next\.source===job\?\.source\)/);
  assert.match(ui, /onClick=\{\(\)=>choose\(j\)\}/);
});

test('delete action is the left footer action without a visible status line', () => {
  assert.equal((ui.match(/>删除记录</g)||[]).length, 1);
  assert.match(ui, /<footer className="studio-footer"><button className="outline danger studio-delete"/);
  assert.match(ui, /<Trash2\/>删除记录<\/button><span className="studio-accessible-status" role="status">/);
  assert.doesNotMatch(ui, /className="studio-status"/);
  assert.match(styles, /\.studio-accessible-description,\.studio-accessible-status\{/);
  assert.match(styles, /\.studio-footer\{[^}]*justify-content:space-between/);
});

test('paper removal uses border-connected background instead of global deletion', () => {
  assert.match(segment, /queue=\[Int\]\(\)/);
  assert.match(segment, /connected to the outside border/);
  assert.doesNotMatch(segment, /let alpha=max\(0,min\(1,\(distance-tolerance\)\/18\)\)/);
});

test('recognition settings stay visible and one action uses the selected mode', () => {
  assert.match(ui, /'点选素材'/);
  assert.match(ui, /request<\{job:Job;itemId:string;confidence:number\}>\('\/point'/);
  assert.match(ui, /点击想要的素材/);
  assert.match(ui, /原图交给已连接的 AI 定位/);
  assert.match(ui, /<div className="studio-advanced" role="group" aria-label="识别设置">/);
  assert.doesNotMatch(ui, /<details className="studio-advanced"/);
  assert.doesNotMatch(ui, />更多设置</);
  assert.doesNotMatch(ui, />识别素材</);
  assert.doesNotMatch(ui, /ScanSearch/);
  assert.equal((ui.match(/>换一种策略</g)||[]).length, 1);
  assert.match(ui, /onClick=\{recognizeWithNextMode\}>换一种策略/);
  assert.doesNotMatch(ui, />自动识别<|>按设置识别</);
  assert.doesNotMatch(ui, /onClick=\{\(\)=>void rerun\(undefined,undefined,true\)\}>换一种策略/);
  assert.match(ui, /availableRecognitionModes\.map\(option=><option/);
  assert.match(ui, /框选补漏/);
  assert.match(server, /\/api\/materials\/point/);
  assert.match(segment, /mode == "point"/);
  assert.match(segment, /VNGenerateForegroundInstanceMaskRequest/);
});

test('Windows hides Mac-only recognition choices without changing the native mode list', () => {
  assert.match(ui, /windowsRecognitionModes=recognitionModes\.filter/);
  assert.match(ui, /imageBackend==='portable'\?windowsRecognitionModes:recognitionModes/);
  assert.match(ui, /fetch\('\/api\/capabilities'\)/);
  assert.match(ui, /透明边缘由 Windows 本地生成/);
});

test('studio exposes a magnetic freehand lasso without replacing the rectangle fallback', () => {
  assert.match(ui, /'吸附套索'/);
  assert.match(ui, /'框选补漏'/);
  assert.match(ui, /snapLassoToEdges\(points,context\.getImageData/);
  assert.match(ui, /松手自动吸附/);
  assert.match(ui, /context\.closePath\(\);context\.clip\(\);context\.drawImage/);
  assert.match(ui, /sourceBounds:\[number,number,number,number\]/);
  assert.match(ui, /原图和已有结果没有修改/);
  assert.match(styles, /\.lasso-outline\.snapped polygon/);
});
