import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('back-cover fixes load after the general reading cover rules', async () => {
  const layout = await read('app/layout.tsx');
  const generalAt = layout.indexOf("import './reading-cover-fixes.css'");
  const backAt = layout.indexOf("import './reading-back-cover-fixes.css'");
  assert.ok(generalAt >= 0);
  assert.ok(backAt > generalAt);
});

test('back cover mirrors the front-cover hinge and free edge', async () => {
  const styles = await read('app/reading-back-cover-fixes.css');
  assert.match(styles, /reading-flip-back-lining \.cover-binding/);
  assert.match(styles, /reading-flip-cover-back \.reading-flip-cover-inside \.cover-binding/);
  assert.match(styles, /left: 0 !important;/);
  assert.match(styles, /right: auto !important;/);
  assert.match(styles, /reading-flip-back-lining \.cover-inside-edge/);
  assert.match(styles, /left: auto !important;/);
  assert.match(styles, /right: 0 !important;/);
});

test('back cover keeps one base color through fallback, lining and edge', async () => {
  const styles = await read('app/reading-back-cover-fixes.css');
  assert.match(styles, /--reading-cover-inside: var\(--cover-base\)/);
  assert.match(styles, /\.stf__block::before/);
  assert.match(styles, /background-color: var\(--cover-base\) !important;/);
  assert.match(styles, /background-image: none !important;/);
  assert.match(styles, /opacity: 1 !important;/);
});

test('the final physical order still keeps verso, back lining and hard back cover', async () => {
  const source = await read('components/reading-pageflip.tsx');
  const versoAt = source.indexOf('data-physical-index={finalVersoIndex}');
  const liningAt = source.indexOf('reading-flip-back-lining');
  const backAt = source.indexOf('<CoverShell book={book} assets={assets} side="back" />');
  assert.ok(versoAt >= 0);
  assert.ok(liningAt > versoAt);
  assert.ok(backAt > liningAt);
});
