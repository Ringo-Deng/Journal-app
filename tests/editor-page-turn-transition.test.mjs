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

test('the turn keeps an immutable source snapshot while the live page is unchanged', () => {
  assert.match(page, /source: spread/);
  assert.match(page, /sourceIndex: page/);
  assert.match(page, /from=\{activeTurn\.source\}/);
  assert.match(page, /fromIndex=\{activeTurn\.sourceIndex\}/);
  assert.doesNotMatch(page, /from=\{spread\}/);
});

test('the target snapshot decodes before the live page and overlay swap atomically', () => {
  assert.match(page, /function finishTurn\(/);
  assert.match(page, /\.page-turn-layer \.turn-reveal img/);
  assert.match(page, /addEventListener\('load',done[\s\S]*if\(img\.complete\)done\(\)/);
  assert.match(page, /Promise\.all\(ready\)/);
  assert.match(page, /Promise\.race\([\s\S]*requestAnimationFrame\(\(\)=>\{[\s\S]*setPage\(t\.target\);[\s\S]*clearTurn\(t\)/);
  assert.doesNotMatch(page, /function finishTurn[\s\S]*?setPage\(t\.target\);[\s\S]*?Promise\.race/);
  assert.doesNotMatch(page, /if\(complete\)setPage\(t\.target\);setFlipping\(''\)/);
});
