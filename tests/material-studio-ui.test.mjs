import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ui = await readFile('components/material-studio.tsx', 'utf8');
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
  assert.match(ui, /onClick=\{\(\)=>void rerun\(\)\}><ScanSearch\/>识别素材/);
  assert.doesNotMatch(ui, />自动识别<|>按设置识别</);
  assert.doesNotMatch(ui, /onClick=\{\(\)=>void rerun\(undefined,undefined,true\)\}>换一种策略/);
  assert.match(ui, /recognitionModes\.map\(option=><option/);
  assert.match(ui, /'框选补漏'/);
  assert.match(server, /\/api\/materials\/point/);
  assert.match(segment, /mode == "point"/);
  assert.match(segment, /VNGenerateForegroundInstanceMaskRequest/);
});
