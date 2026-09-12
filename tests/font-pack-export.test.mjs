import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { journalFonts, journalFontFamily } from '../lib/collage.ts';
import { readingJpgInput } from '../lib/reading-jpg.ts';

// Resolve the browser module's extensionless import for the native Node test runner.
const source = (await readFile(new URL('../lib/export-fonts.ts', import.meta.url), 'utf8'))
  .replace("'./collage'", JSON.stringify(new URL('../lib/collage.ts', import.meta.url).href));
const { exportFontCSS } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`);
const added = ['wenkai', 'chill-round', 'zcool-kuaile', 'zcool-huangyou', 'zcool-xiaowei', 'noto-serif-sc', 'patrick-hand', 'dancing-script'];
const piece = fontFamily => ({ id: fontFamily, kind: 'text', text: '拾光手帐，记录美好生活。Hello 2026', fontFamily });

function mockFontIO(t, fail = false) {
  const fetched = [];
  t.mock.method(globalThis, 'fetch', async url => {
    fetched.push(url);
    if (fail) return new Response('', { status: 404 });
    const bytes = await readFile(new URL(`../public${url}`, import.meta.url));
    return new Response(bytes, { headers: { 'Content-Type': 'font/woff2' } });
  });
  const original = Object.getOwnPropertyDescriptor(globalThis, 'FileReader');
  Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: class {
    async readAsDataURL(blob) {
      this.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`;
      this.onload();
    }
  } });
  t.after(() => original ? Object.defineProperty(globalThis, 'FileReader', original) : delete globalThis.FileReader);
  return fetched;
}

test('each added font embeds its real local font and Chinese fallback for PNG and reading images', async t => {
  const fetched = mockFontIO(t);
  const screenCSS = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8');
  for (const id of added) {
    fetched.length = 0;
    const font = journalFonts.find(f => f.id === id);
    assert.ok(font, id);
    const family = journalFontFamily(id).split('"')[1];
    assert.equal(family, font.family.split('"')[1]);
    const css = await exportFontCSS([piece(id), piece(id), { kind: 'photo', fontFamily: 'brush' }]);
    assert.equal(fetched.length, 2, `${id} loads only itself and the fallback, once each`);
    assert.ok(fetched.includes('/fonts/pen.woff2'));
    assert.ok(css.includes(`font-family:'${family}'`), id);
    assert.ok(screenCSS.includes(`font-family:'${family}'`), id);
    assert.match(css, /font-family:'Journal Pen'/);
    const encoded = [...css.matchAll(/base64,([^']+)/g)].map(m => Buffer.from(m[1], 'base64'));
    assert.equal(encoded.length, 2);
    for (const fontBytes of encoded) assert.equal(fontBytes.subarray(0, 4).toString(), 'wOF2');
    for (const url of fetched) assert.ok(screenCSS.includes(`url('${url}')`), url);
    if (id === 'dancing-script') assert.match(css, /font-weight:400 700/);
  }
});

test('an unavailable font rejects export so it cannot silently save a substituted image', async t => {
  mockFontIO(t, true);
  await assert.rejects(exportFontCSS([piece('wenkai')]), /字体未加载完成/);
});

test('choosing a new font invalidates the reading image without modifying existing pages', () => {
  const book = { id: 'font-book', title: '手帐', spreads: [{ id: 'page', elements: [piece('pen')] }] };
  const before = structuredClone(book);
  for (const id of added) {
    const next = { ...book, spreads: [{ ...book.spreads[0], elements: [piece(id)] }] };
    assert.notEqual(readingJpgInput(next, [], 0), readingJpgInput(book, [], 0));
  }
  assert.deepEqual(book, before);
  assert.equal(new Set(journalFonts.map(font => font.id)).size, journalFonts.length);
});
