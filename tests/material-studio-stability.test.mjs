import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const studio=await readFile(new URL('../components/material-studio.tsx',import.meta.url),'utf8');
const css=await readFile(new URL('../app/material-studio-stability.css',import.meta.url),'utf8');
const layout=await readFile(new URL('../app/layout.tsx',import.meta.url),'utf8');

test('opening the studio selects one newest source and does not run the legacy reopen path',()=>{
  assert.match(studio,/if\(list\[0\]\)choose\(list\[0\]\)/);
  assert.doesNotMatch(studio,/request<\{item\?:\{src:string;name:string\}\|null\}>\('\/reopen'\)/);
  assert.doesNotMatch(studio,/request\('\/reopen'/);
});

test('viewport measurement is frame-coalesced and idempotent',()=>{
  assert.match(studio,/requestAnimationFrame\(measure\)/);
  assert.match(studio,/old\.w===next\.w&&old\.h===next\.h\?old:next/);
  assert.match(studio,/setImageReady\(true\)/);
});

test('studio stability styles reserve scrollbar geometry and disable source-image animation',()=>{
  assert.match(css,/scrollbar-gutter: stable both-edges/);
  assert.match(css,/contain: layout paint/);
  assert.match(css,/transition: none !important/);
  assert.match(layout,/import '\.\/material-studio-stability\.css'/);
});
