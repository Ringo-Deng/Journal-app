import test from 'node:test';
import assert from 'node:assert/strict';
import {stationeryCoverSvg,stationeryCoverUrl} from '../lib/stationery-cover.ts';
import {readingJpgInput} from '../lib/reading-jpg.ts';
test('cover title is escaped as text and invalid palette cannot inject SVG',()=>{
 const svg=stationeryCoverSvg('<script>&"', '"/><script>');
 assert.ok(svg.includes('&lt;script&gt;&amp;&quot;'));
 assert.ok(!svg.includes('<script>'));
 assert.ok(svg.includes('#f4ce75'));
 assert.equal(decodeURIComponent(stationeryCoverUrl('拾光集','#f4ce75').split(',')[1]),stationeryCoverSvg('拾光集','#f4ce75'));
});
test('cover cache changes without invalidating saved inner pages or editing the book',()=>{
 const book={id:'a',title:'旅行',cover:'linen-oat',spreads:[]};
 const original=structuredClone(book);
 assert.equal(JSON.parse(readingJpgInput(book,[],null)).version,4);
 assert.equal(JSON.parse(readingJpgInput(book,[],0)).version,2);
 assert.deepEqual(book,original);
});
