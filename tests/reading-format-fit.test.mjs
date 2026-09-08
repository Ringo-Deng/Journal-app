import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('reading format fit rules load after cover corrections', async () => {
  const layout = await read('app/layout.tsx');
  const backAt = layout.indexOf("import './reading-back-cover-fixes.css'");
  const fitAt = layout.indexOf("import './reading-format-fit.css'");
  assert.ok(backAt >= 0);
  assert.ok(fitAt > backAt);
});

test('narrow formats shrink while the standard ratio remains unscaled', async () => {
  const styles = await read('app/reading-format-fit.css');
  const journal = await read('lib/journal.ts');
  assert.match(styles, /--reading-format-fit: clamp\(\.82, calc\(var\(--spread-ratio, 1\.43\) - \.2\), 1\)/);
  assert.match(styles, /scale: var\(--reading-format-fit\)/);
  assert.match(journal, /id: 'standard'.*ratio: 1\.43/s);
  assert.match(journal, /id: 'tn-regular'.*ratio: 1\.05/s);
});
