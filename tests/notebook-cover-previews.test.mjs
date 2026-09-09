import test from 'node:test';
import assert from 'node:assert/strict';
import {access, readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {regularCoverPreviews, regularCoverPreviewForColor} from '../lib/notebook-cover-previews.ts';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));

test('regular notebook preview mapping reuses the three existing linen cover ids', () => {
  assert.deepEqual(
    regularCoverPreviews.map(({coverId}) => coverId),
    ['linen-oat', 'linen-forest', 'linen-blue'],
  );
  assert.equal(regularCoverPreviewForColor('#F4CE75')?.coverId, 'linen-oat');
  assert.equal(regularCoverPreviewForColor(' #e8b9ba ')?.coverId, 'linen-forest');
  assert.equal(regularCoverPreviewForColor('#91a9b5')?.coverId, 'linen-blue');
  assert.equal(regularCoverPreviewForColor('#000000'), undefined);
});

test('approved regular preview assets exist and stay unbranded by filename', async () => {
  for (const preview of regularCoverPreviews) {
    assert.match(preview.src, /^\/notebook-covers\/regular-(yellow|pink|blue)-notes\.svg$/);
    await access(repoRoot + 'public' + preview.src);
  }
});

test('library full-book previews support both formats while physical cover renderers keep face artwork', async () => {
  const css = await readFile(new URL('../app/notebook-cover-previews.css', import.meta.url), 'utf8');
  assert.ok(css.includes('.library-cover:has(.stationery-cover-preview)'));
  assert.ok(css.includes('.library-cover .stationery-cover-preview'));
  assert.ok(css.includes('.rigid-front .stationery-cover-preview'));
  assert.ok(css.includes('.deck-cover-front .stationery-cover-preview'));
  assert.ok(css.includes('regular-yellow-notes.svg'));
  assert.ok(css.includes('regular-pink-notes.svg'));
  assert.ok(css.includes('regular-blue-notes.svg'));
});
