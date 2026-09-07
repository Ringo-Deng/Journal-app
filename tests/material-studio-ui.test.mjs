import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ui = await readFile('components/material-studio.tsx', 'utf8');
const server = await readFile('local/server.mjs', 'utf8');
const segment = await readFile('local/segment.swift', 'utf8');

test('processed material keeps continue-recognition and delete actions', () => {
  assert.match(ui, />继续识别</);
  assert.match(ui, />删除记录</);
  assert.match(ui, /continue: true/);
  assert.match(server, /\/api\/materials\/delete/);
});

test('paper removal uses border-connected background instead of global deletion', () => {
  assert.match(segment, /queue=\[Int\]\(\)/);
  assert.match(segment, /connected to the outside border/);
  assert.doesNotMatch(segment, /let alpha=max\(0,min\(1,\(distance-tolerance\)\/18\)\)/);
});
