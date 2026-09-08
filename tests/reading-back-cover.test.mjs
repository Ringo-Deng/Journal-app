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

test('detached far-right back-board helper is not rendered', async () => {
  const styles = await read('app/reading-back-cover-fixes.css');
  assert.match(styles, /\.stf__block::before/);
  assert.match(styles, /content: none !important;/);
  assert.match(styles, /display: none !important;/);
});

test('final back lining is one flat cover-colored surface', async () => {
  const styles = await read('app/reading-back-cover-fixes.css');
  assert.match(styles, /reading-flip-lining\.reading-flip-back-lining/);
  assert.match(styles, /background-color: var\(--cover-base\) !important;/);
  assert.match(styles, /background-image: none !important;/);
  assert.match(styles, /box-shadow: none !important;/);
  assert.match(styles, /reading-flip-back-lining \.cover-binding/);
  assert.match(styles, /reading-flip-back-lining \.cover-inside-edge/);
  assert.match(styles, /display: none !important;/);
});

test('hard back cover and back lining use the exact same flat surface', async () => {
  const styles = await read('app/reading-back-cover-fixes.css');
  assert.match(styles, /reading-flip-cover-back \.reading-flip-cover-face/);
  assert.match(styles, /background-color: var\(--cover-base\) !important;/);
  assert.match(styles, /background-image: none !important;/);
  assert.match(styles, /background-blend-mode: normal !important;/);
  assert.match(styles, /border-color: transparent !important;/);
  assert.match(styles, /reading-flip-cover-back \.reading-flip-cover-inside \.cover-binding/);
  assert.match(styles, /reading-flip-cover-back \.reading-flip-cover-inside \.cover-inside-edge/);
});

test('visible bottom pagination controls are removed while keyboard turning remains', async () => {
  const source = await read('components/reading-deck.tsx');
  assert.doesNotMatch(source, /<footer className="deck-controls">/);
  assert.doesNotMatch(source, /ChevronLeft|ChevronRight/);
  assert.match(source, /ArrowLeft/);
  assert.match(source, /ArrowRight/);
  assert.match(source, /pageFlip\.current\?\.prev\(\)/);
  assert.match(source, /pageFlip\.current\?\.next\(\)/);
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
