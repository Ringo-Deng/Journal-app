import test from 'node:test';
import assert from 'node:assert/strict';
import {stationeryCoverSvg,stationeryCoverUrl,stationeryPaletteForColor,stationerySpineColor} from '../lib/stationery-cover.ts';
import {readingJpgInput} from '../lib/reading-jpg.ts';

test('cover colour input cannot inject SVG and the notebook name is absent',()=>{
 const svg=stationeryCoverSvg('"/><script>');
 assert.ok(!svg.includes('<script>'));
 assert.ok(!svg.includes('拾光集'));
 assert.equal(decodeURIComponent(stationeryCoverUrl('#f4ce75').split(',')[1]),stationeryCoverSvg('#f4ce75'));
});

test('regular stationery face is clean NOTES artwork without old branding or baked book furniture',()=>{
 const svg=stationeryCoverSvg('#91a9b5');
 assert.ok(svg.includes('>NOTES</text>'));
 assert.ok(!svg.includes('shiguang'));
 assert.ok(!svg.includes('ellipse'));
 assert.ok(!svg.includes('linearGradient id="snap"'));
});

test('all regular stationery colours have a matching physical spine palette',()=>{
 assert.equal(stationerySpineColor('#f4ce75'),'#684631');
 assert.equal(stationerySpineColor('#E8B9BA'),'#6c596b');
 assert.equal(stationerySpineColor(' #91a9b5 '),'#20394f');
 assert.equal(stationerySpineColor('#000000'),undefined);
 assert.equal(stationeryPaletteForColor('#e8b9ba')?.base,'#e8b9ba');
});

test('cover cache changes without invalidating saved inner pages or editing the book',()=>{
 const book={id:'a',title:'旅行',cover:'linen-oat',spreads:[]};
 const original=structuredClone(book);
 assert.equal(JSON.parse(readingJpgInput(book,[],null)).version,10);
 assert.equal(JSON.parse(readingJpgInput(book,[],0)).version,9);
 assert.equal(readingJpgInput(book,[],null),readingJpgInput({...book,title:'改名后'},[],null));
 assert.deepEqual(book,original);
});
