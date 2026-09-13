import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [page,studio,library,layout,styles]=await Promise.all([
 readFile(new URL('../app/page.tsx',import.meta.url),'utf8'),
 readFile(new URL('../components/material-studio.tsx',import.meta.url),'utf8'),
 readFile(new URL('../components/photo-library.tsx',import.meta.url),'utf8'),
 readFile(new URL('../app/layout.tsx',import.meta.url),'utf8'),
 readFile(new URL('../app/photo-library.css',import.meta.url),'utf8'),
]);

test('the outer rail exposes a standalone photo library without merging photos into sticker assets',()=>{
 assert.match(page,/aria-label="照片库"/);assert.match(page,/modal==='photo-library'/);assert.match(page,/<PhotoLibrary onInsert=\{insertPhotoLibrary\}/);
 assert.doesNotMatch(studio,/素材工作台分类|<PhotoLibrary|section==='photos'/);
 assert.doesNotMatch(library,/\bAsset\b/);assert.match(layout,/import '\.\/photo-library\.css'/);assert.match(styles,/\.photo-library\{/);
});

test('photo category supports lazy file and folder import, time groups and explicit canvas insertion',()=>{
 assert.match(library,/导入照片/);assert.match(library,/导入文件夹/);assert.match(library,/webkitdirectory/);assert.match(library,/image\/heic/);assert.match(library,/api\/photos\?offset=/);
 assert.match(library,/photo-month/);assert.match(library,/添加到当前跨页/);assert.doesNotMatch(library,/draggable=\{true\}/);assert.match(library,/单击照片即可选择/);
 assert.match(page,/function insertPhotoLibrary\(sources:string\[\]\)/);assert.match(page,/kind:'photo',src,photoOriginal:src/);assert.match(page,/setMultiIds\(pieces\.length>1/);
});

test('photo category preserves backup, preview, processing and deletion protection controls',()=>{
 assert.match(library,/\/api\/photos\/backup/);assert.match(library,/\/api\/photos\/restore/);assert.match(library,/送到素材处理/);assert.match(library,/电脑上的原文件不会受影响/);assert.match(library,/protectedSources/);
 assert.match(page,/photoProtectedSources=/);assert.match(page,/onProcess=\{processPhotoLibraryItem\}/);assert.match(page,/api<\{source:string\}>\('\/materials\/source'/);assert.match(page,/setMaterialStudioTargetSource\(job\.source\)/);
});

test('existing photo upload paths save through the photo library before changing the journal',()=>{
 assert.match(page,/fetch\('\/api\/photos\/import\?'/);assert.doesNotMatch(page.slice(page.indexOf('async function upload'),page.indexOf('async function generate')),/api<\{ src: string \}>\(\s*'\/upload'/);
});
