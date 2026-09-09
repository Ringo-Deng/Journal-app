import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [page,importer,studio,library]=await Promise.all([
  readFile(new URL('../app/page.tsx',import.meta.url),'utf8'),
  readFile(new URL('../components/material-importer.tsx',import.meta.url),'utf8'),
  readFile(new URL('../components/material-studio.tsx',import.meta.url),'utf8'),
  readFile(new URL('../components/material-library.tsx',import.meta.url),'utf8'),
]);

test('material import is a dedicated action in the main left rail',()=>{
  const rail=page.slice(page.indexOf('<aside className="rail"'),page.indexOf('</aside>'));
  assert.match(rail,/aria-label="导入素材"/);
  assert.match(rail,/setModal\('material-import'\)/);
  assert.match(page,/<MaterialImporter/);
  assert.match(page,/open=\{modal === 'material-import'\}/);
});

test('local and Pinterest acquisition live in the importer instead of Material Studio',()=>{
  assert.match(importer,/type="file"[^>]+accept="image\/png,image\/jpeg,image\/webp"/);
  assert.match(importer,/request<Job>\('\/segment',\{src:uploaded\.src,name:item\.name,mode:'auto',tolerance:28\}\)/);
  assert.match(importer,/\('\/pinterest\/resolve'/);
  assert.match(importer,/\('\/pinterest\/import'/);
  assert.match(importer,/onReady\(summary\)/);
  assert.doesNotMatch(studio,/type="file"/);
  assert.doesNotMatch(studio,/pinterest\/resolve/);
  assert.doesNotMatch(studio,/>导入图片</);
  assert.match(studio,/if\(notice\)setMessage\(notice\)/);
});

test('material import stays in the dedicated left rail and is absent from the library header',()=>{
  assert.doesNotMatch(page,/onImport=\{\(\)=>setModal\('material-import'\)\}/);
  assert.doesNotMatch(library,/导入与拆分/);
  assert.doesNotMatch(library,/onImport/);
  assert.match(page,/onOpenStudio=\{\(\)=>\{setMaterialStudioNotice\(''\);setModal\('studio'\)\}\}/);
  assert.match(library,/await request\('\/source',\{src,name:a\.name,replaceAssetId:isUserAsset\(a\)\?a\.id:undefined\}\);onOpenStudio\(\)/);
});
