import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const studio=await readFile(new URL('../components/material-studio.tsx',import.meta.url),'utf8');
const css=await readFile(new URL('../app/material-studio-stability.css',import.meta.url),'utf8');
const layout=await readFile(new URL('../app/layout.tsx',import.meta.url),'utf8');

test('opening the studio selects the exact requested source and does not run the legacy reopen path',()=>{
  assert.match(studio,/const target=targetSource\?list\.find\(job=>job\.source===targetSource\):list\[0\]/);
  assert.match(studio,/if\(target\)\{choose\(target\)/);
  assert.match(studio,/if\(targetSource\)\{setJobs\(\[\]\);clearJobView\(\)\}/);
  assert.doesNotMatch(studio,/request<\{item\?:\{src:string;name:string\}\|null\}>\('\/reopen'\)/);
  assert.doesNotMatch(studio,/request\('\/reopen'/);
});

test('viewport measurement is frame-coalesced and idempotent',()=>{
  assert.match(studio,/requestAnimationFrame\(measure\)/);
  assert.match(studio,/old\.w===next\.w&&old\.h===next\.h\?old:next/);
  assert.match(studio,/setImageReady\(true\)/);
});

test('crop selection starts on the whole preview and clamps outside drags to the image',()=>{
  assert.match(studio,/function beginPreviewPointer/);
  assert.match(studio,/className=\{`studio-image-viewport \$\{cropping\?'cropping':''\} \$\{picking\?'picking':''\} \$\{lassoing\?'lassoing':''\}`\}/);
  assert.match(studio,/onPointerDown=\{beginPreviewPointer\} onPointerMove=\{movePreviewPointer\}/);
  assert.match(studio,/Math\.max\(0,Math\.min\(1,\(e\.clientX-r\.left\)\/r\.width\)\)/);
  assert.doesNotMatch(studio,/aria-label="原图框选区域[^\n]+onPointerDown=/);
});

test('studio stability styles reserve scrollbar geometry and disable source-image animation',()=>{
  assert.match(css,/scrollbar-gutter: stable both-edges/);
  assert.match(css,/contain: layout paint/);
  assert.match(css,/transition: none !important/);
  assert.match(layout,/import '\.\/material-studio-stability\.css'/);
});
