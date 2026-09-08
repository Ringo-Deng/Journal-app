import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('processed local materials are recovered from unfinished import jobs in safe batches', async () => {
  const source = await read('components/material-recovery.tsx');
  assert.match(source, /fetch\('\/api\/materials\/jobs'/);
  assert.match(source, /!item\.imported/);
  assert.match(source, /index \+= 100/);
  assert.match(source, /fetch\('\/api\/materials\/import'/);
  assert.match(source, /category: '我的素材'/);
  assert.match(source, /window\.location\.reload\(\)/);
});

test('material library refresh is loaded after the existing global styles', async () => {
  const layout = await read('app/layout.tsx');
  const globalsAt = layout.indexOf("import './globals.css'");
  const refreshAt = layout.indexOf("import './material-library-refresh.css'");
  assert.ok(globalsAt >= 0);
  assert.ok(refreshAt > globalsAt);
  assert.match(layout, /<MaterialRecovery \/>/);
});

test('material cards keep a readable image-first grid instead of narrow columns', async () => {
  const styles = await read('app/material-library-refresh.css');
  assert.match(styles, /grid-template-columns: repeat\(auto-fill, minmax\(168px, 1fr\)\)/);
  assert.match(styles, /aspect-ratio: 4 \/ 3/);
  assert.match(styles, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(max-width: 640px\)/);
});
