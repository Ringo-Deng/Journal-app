import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
const layout = await readFile(new URL('../app/layout.tsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../app/editor-rounded-transition.css', import.meta.url), 'utf8');

test('editor canvas stays mounted beneath the cover during both transition directions', () => {
  assert.match(page, /\(!opened \|\| opening \|\| closing\)/);
  assert.match(page, /\(opened \|\| opening \|\| closing\)/);
  assert.match(page, /cover-transition-overlay/);
  assert.match(css, /> \.cover-transition-overlay\s*\{/);
  assert.match(css, /\.cover-transition-overlay \.rigid-underlay\s*\{[^}]*visibility: hidden/s);
});

test('editor covers and paper share rounded exposed corners without rounding the binding edge', () => {
  assert.match(layout, /import '\.\/editor-rounded-transition\.css';/);
  assert.match(css, /--editor-cover-radius:/);
  assert.match(css, /--editor-paper-radius:/);
  assert.match(css, /\.rigid-front\s*\{[^}]*border-radius: 0 var\(--editor-cover-radius\) var\(--editor-cover-radius\) 0/s);
  assert.match(css, /\.rigid-back\s*\{[^}]*border-radius: var\(--editor-cover-radius\) 0 0 var\(--editor-cover-radius\)/s);
  assert.match(css, /\.notebook-page-layer\.left-paper[^}]*border-radius: var\(--editor-paper-radius\) 0 0 var\(--editor-paper-radius\)/s);
  assert.match(css, /\.notebook-page-layer\.right-paper[^}]*border-radius: 0 var\(--editor-paper-radius\) var\(--editor-paper-radius\) 0/s);
  assert.match(css, /\.turn-snapshot\s*\{[^}]*border-radius: var\(--editor-paper-radius\)/s);
  assert.match(css, /\.page-corner::after\s*\{[^}]*border-radius: 0 0 var\(--editor-paper-radius\) 0/s);
});
