import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('embedded controls share the title toolbar and the table fills remaining height', async () => {
  const view = await read('components/book3d/Book3DView.tsx');
  const deck = await read('components/reading-deck.tsx');
  const css = await read('components/book3d/book3d.css');
  assert.match(view, /createPortal\(controls, toolbar\)/);
  assert.match(deck, /className="reading-toolbar" ref=\{setToolbar\}/);
  assert.match(css, /\.reading-jpg-deck \.book3d-stage\s*\{[^}]*flex: 1;[^}]*height: auto;/);
});
test('turn preparation cannot display the initial white loading overlay after ready', async () => {
  const source = await read('components/book3d/Book3DView.tsx');
  assert.match(source, /!ready && preparing &&/);
  assert.doesNotMatch(source, /setReady\(false\)/);
});
test('page decoding reuses preloaded JPG blobs rather than rereading persistence per turn', async () => {
  const source = await read('components/book3d/reading-textures.tsx');
  const decode = source.slice(source.indexOf('async function decode'), source.indexOf('async function prepare'));
  assert.match(decode, /jpgs\.get\(index\)/);
  assert.doesNotMatch(decode, /getReadingJpg/);
  assert.match(source, /preload \?\?=/);
  assert.match(source, /length: plan.count/);
  assert.match(source, /jpgs\.clear\(\)/);
});
