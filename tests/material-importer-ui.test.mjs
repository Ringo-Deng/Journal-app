import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [page,importer,studio,library]=await Promise.all([
  readFile(new URL('../app/page.tsx',import.meta.url),'utf8'),
  readFile(new URL('../components/material-importer.tsx',import.meta.url),'utf8'),
  readFile(new URL('../components/material-studio.tsx',import.meta.url),'utf8'),
  readFile(new URL('../components/material-library.tsx',import.meta.url),'utf8'),
]);

test('the main left rail separates Material Studio from importing new material',()=>{
  const rail=page.slice(page.indexOf('<aside className="rail"'),page.indexOf('</aside>'));
  assert.match(rail,/className=\{modal==='studio'\?'active':''\} aria-label="素材工作台"/);
  assert.match(rail,/setMaterialStudioNotice\(''\);setMaterialStudioTargetSource\(''\);setModal\('studio'\)/);
  assert.match(rail,/<Sticker\/><span>素材<br\/>工作台<\/span>/);
  assert.match(rail,/className=\{modal==='material-import'\?'active':''\} aria-label="导入新素材"/);
  assert.match(rail,/setMaterialStudioTargetSource\(''\);setModal\('material-import'\)/);
  assert.match(rail,/<ImagePlus\/><span>导入<br\/>新素材<\/span>/);
  assert.doesNotMatch(rail,/aria-label="素材库"/);
  assert.match(page,/aria-label="打开素材库"/);
  assert.match(page,/<MaterialImporter/);
  assert.match(page,/open=\{modal === 'material-import'\}/);
});

test('local and Pinterest acquisition live in the importer instead of Material Studio',()=>{
  assert.match(importer,/type="file"[^>]+accept="image\/png,image\/jpeg,image\/webp"/);
  assert.match(importer,/request<Job>\('\/source',\{src:uploaded\.src,name:item\.name\}\)/);
  assert.match(importer,/opened\+\+;targetSource=source\.source/);
  assert.match(importer,/request<Job>\('\/segment',\{src:uploaded\.src,name:item\.name,mode:'auto',tolerance:28\}\)/);
  assert.match(importer,/fallbacks\.push\(`\$\{item\.name\}：自动识别未完成，原图已保留，可框选补漏；如需自由裁切，请点“导入新素材”并选择“整图入库”，放入手帐后从选中工具栏打开/);
  assert.match(importer,/\('\/pinterest\/resolve'/);
  assert.match(importer,/\('\/pinterest\/import'/);
  assert.match(importer,/url\.hostname==='pin\.it'/);
  assert.match(importer,/直接粘贴 Pinterest 网页或 pin\.it 分享链接/);
  const pinterestFlow=importer.slice(importer.indexOf('async function importPinterest'),importer.indexOf('return <Dialog'));
  assert.ok(pinterestFlow.indexOf("request<Job>('/source'")>0);
  assert.ok(pinterestFlow.indexOf("request<Job>('/segment'")>pinterestFlow.indexOf("request<Job>('/source'"));
  assert.match(importer,/onReady\(summary,targetSource\)/);
  assert.match(pinterestFlow,/onReady\(summary,source\.source\)/);
  assert.doesNotMatch(studio,/type="file"/);
  assert.doesNotMatch(studio,/pinterest\/resolve/);
  assert.doesNotMatch(studio,/>导入图片</);
  assert.match(studio,/if\(notice\)setMessage\(notice\)/);
  assert.match(studio,/<button className="outline" disabled=\{busy\} onClick=\{onImport\}><ImagePlus\/>导入新素材<\/button>/);
  assert.match(studio,/<button className="primary" disabled=\{busy\} onClick=\{onImport\}>导入新素材<\/button>/);
  assert.match(page,/onImport=\{\(\) => \{setMaterialStudioTargetSource\(''\);setModal\('material-import'\)\}\}/);
});

test('material acquisition stays out of the library header while re-edit still opens the studio',()=>{
  assert.doesNotMatch(page,/onImport=\{\(\)=>setModal\('material-import'\)\}/);
  assert.doesNotMatch(library,/导入与拆分/);
  assert.doesNotMatch(library,/onImport/);
  assert.match(page,/onOpenStudio=\{\(targetSource\)=>\{setMaterialStudioNotice\(''\);setMaterialStudioTargetSource\(targetSource\);setModal\('studio'\)\}\}/);
  assert.match(page,/targetSource=\{materialStudioTargetSource\}/);
  assert.match(library,/const source=await request<\{source:string\}>\('\/source',\{src,name:a\.name,replaceAssetId:isUserAsset\(a\)\?a\.id:undefined\}\);onOpenStudio\(source\.source\)/);
});
