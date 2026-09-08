import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readingJpgInput } from '../lib/reading-jpg.ts';
const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('canvas fallback is inert markup because R3F mounts it even with working WebGL', async () => {
  const source = await read('components/book3d/Book3DView.tsx');
  assert.match(source, /fallback=\{<p>[^<]+<\/p>\}/);
  assert.doesNotMatch(source, /<Unavailable|function Unavailable/);
  assert.match(source, /addEventListener\("webglcontextlost", lost\)/);
});
test('JPG capture places the off-screen offset on an uncaptured wrapper and clears logical insets', async () => {
  const source = await read('components/book3d/render-reading-jpg.tsx');
  const hostStyle = source.slice(source.indexOf('Object.assign(host.style'), source.indexOf('offscreen.appendChild(host)'));
  assert.doesNotMatch(hostStyle, /-20000|position: "fixed"/);
  assert.match(source, /toCanvas\(host,/);
  assert.match(source, /insetInlineStart: "0"/);
  assert.match(source, /insetBlockStart: "0"/);
  assert.match(source, /offscreen\.remove\(\)/);
});
test('old white JPG cache signatures are invalidated without changing the journal', () => {
  const book = { id: 'a', title: 'Test', cover: 'kraft', spreads: [] };
  const snapshot = structuredClone(book);
  const current = JSON.parse(readingJpgInput(book, [], null));
  const legacy = { ...current, version: 1 };
  assert.notEqual(JSON.stringify(current), JSON.stringify(legacy));
  assert.deepEqual(book, snapshot);
});
