import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
const leaf = await readFile(new URL('../components/reading-leaf.tsx', import.meta.url), 'utf8');

test('editor page turns paint the complete segmented leaf frame without rerendering the workbench', () => {
  assert.match(page, /const frame=leafFrame\(progress,direction>0,10\)/);
  assert.match(page, /turnRef\.current\.progress=frame\.progress/);
  assert.match(page, /querySelectorAll<HTMLElement>\('\[data-leaf-index\]'\)/);
  assert.match(page, /--front-visible/);
  assert.match(page, /--back-visible/);
  assert.match(leaf, /data-leaf-index=\{i\}/);
});

test('the completed snapshot stays mounted until the live target page has painted', () => {
  assert.match(page, /function finishTurn\(/);
  assert.match(page, /setPage\(t\.target\);[\s\S]*requestAnimationFrame/);
  assert.match(page, /:scope > \.notebook-page-layer img, :scope > \.piece img/);
  assert.match(page, /Promise\.all\(ready\)/);
  assert.match(page, /requestAnimationFrame\(\(\)=>clearTurn\(t\)\)/);
  assert.doesNotMatch(page, /if\(complete\)setPage\(t\.target\);setFlipping\(''\)/);
});
