import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [page,importer,studio,library]=await Promise.all([
  readFile(new URL('../app/page.tsx',import.meta.url),'utf8'),
  readFile(new URL('../components/material-importer.tsx',import.meta.url),'utf8'),
  readFile(new URL('../components/material-studio.tsx',import.meta.url),'utf8'),
  readFile(new URL('../components/material-library.tsx',import.meta.url),'utf8'),
]);

test('the main left rail opens Material Studio without requiring a new image',()=>{
  const rail=page.slice(page.indexOf('<aside className="rail"'),page.indexOf('</aside>'));
  assert.match(rail,/aria-label="素材工作台"/);
  assert.match(rail,/setMaterialStudioNotice\(''\);setModal\('studio'\)/);
  assert.doesNotMatch(rail,/onClick=\{\(\)=>setModal\('material-import'\)\}/);
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
  assert.match(studio,/<button className="outline" disabled=\{busy\} onClick=\{onImport\}><ImagePlus\/>导入新素材<\/button>/);
  assert.match(studio,/<button className="primary" disabled=\{busy\} onClick=\{onImport\}>导入新素材<\/button>/);
  assert.match(page,/onImport=\{\(\) => setModal\('material-import'\)\}/);
});

test('material acquisition stays out of the library header while re-edit still opens the studio',()=>{
  assert.doesNotMatch(page,/onImport=\{\(\)=>setModal\('material-import'\)\}/);
  assert.doesNotMatch(library,/导入与拆分/);
  assert.doesNotMatch(library,/onImport/);
  assert.match(page,/onOpenStudio=\{\(\)=>\{setMaterialStudioNotice\(''\);setModal\('studio'\)\}\}/);
  assert.match(library,/await request\('\/source',\{src,name:a\.name,replaceAssetId:isUserAsset\(a\)\?a\.id:undefined\}\);onOpenStudio\(\)/);
});
