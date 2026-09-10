import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const view = await readFile(new URL('../components/book3d/Book3DView.tsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8');

test('3D cover lining reaches the board edge without a folded rectangular rim', () => {
  assert.match(view, /const width = BOOK\.width \+ \(lining \? 0\.12 : 0\.1\)/);
  assert.match(view, /const height = BOOK\.height \+ \(lining \? 0\.16 : 0\.14\)/);
  assert.doesNotMatch(view, /function CoverTurnIns/);
});

test('editor flyleaf removes only the cover rim and retains the center binding', () => {
  assert.match(
    css,
    /\.compact-shell\.is-editing \.book-scene \.open-book\.flyleaf-spread\{outline:0;box-shadow:0 20px 35px -13px #332a2940;\}/,
  );
  assert.match(css, /\.compact-shell\.is-editing \.flyleaf-spread \.cover-inside-edge\{display:none;\}/);
  assert.match(css, /\.cover-binding\{[^}]*right:0;[^}]*width:16px/);
});
