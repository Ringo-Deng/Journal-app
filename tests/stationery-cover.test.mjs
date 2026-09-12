import test from 'node:test';
import assert from 'node:assert/strict';
import {stationeryCoverSvg,stationeryCoverUrl,stationeryPaletteForColor,stationerySpineColor} from '../lib/stationery-cover.ts';
import {readingJpgInput} from '../lib/reading-jpg.ts';

test('cover title is escaped as text and invalid palette cannot inject SVG',()=>{
 const svg=stationeryCoverSvg('<script>&"', '#cca866');
 assert.ok(svg.includes('&lt;script&gt;&amp;&quot;'));
 assert.ok(!svg.includes('<script>'));
 assert.ok(!stationeryCoverSvg('拾光', '"/><script>').includes('<script>'));
 assert.equal(decodeURIComponent(stationeryCoverUrl('拾光集','#f4ce75').split(',')[1]),stationeryCoverSvg('拾光集','#f4ce75'));
});

test('regular stationery face is clean NOTES artwork without old branding or baked book furniture',()=>{
 const svg=stationeryCoverSvg('拾光集','#91a9b5');
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
 assert.equal(JSON.parse(readingJpgInput(book,[],null)).version,9);
 assert.equal(JSON.parse(readingJpgInput(book,[],0)).version,9);
 assert.deepEqual(book,original);
});
