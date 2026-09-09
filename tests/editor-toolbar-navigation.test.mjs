import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('page navigation and zoom live only in the first-row editor toolbar',async()=>{
  const source=await read('app/page.tsx');
  const toolbar=source.slice(source.indexOf('<header className="compact-bar editor-header">'),source.indexOf('</header>}'));
  assert.match(toolbar,/className="editor-page-navigation"/);
  assert.match(toolbar,/aria-label="上一跨页"/);
  assert.match(toolbar,/className="editor-page-counter"/);
  assert.match(toolbar,/aria-label="下一跨页"/);
  assert.match(toolbar,/aria-label="纸面大小"/);
  assert.doesNotMatch(source,/className="page-navigation">\s*<label className="page-zoom canvas-zoom"/);
  assert.equal([...source.matchAll(/aria-label="上一跨页"/g)].length,1);
  assert.equal([...source.matchAll(/aria-label="下一跨页"/g)].length,1);
});

test('the first-row toolbar stays on one horizontally scrollable line',async()=>{
  const css=await read('app/globals.css');
  assert.match(css,/\.creation-tools\{[^}]*flex-wrap:nowrap;[^}]*overflow-x:auto;/);
  assert.match(css,/\.creation-tools \.quiet\{[^}]*flex:none;[^}]*white-space:nowrap;/);
  assert.match(css,/\.editor-page-navigation\{[^}]*display:flex;[^}]*flex:none;[^}]*margin-left:auto;/);
});
