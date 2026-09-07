import test from 'node:test';
import assert from 'node:assert/strict';
import {restorePosition} from '../lib/workspace-view.ts';

test('restores page, zoom, selection and canvas scroll without reopening the cover',()=>{
 const saved={page:2,opened:true,zoom:130,selected:'note-1',scrollTop:140,scrollLeft:50};
 assert.deepEqual(restorePosition(saved,5,true),saved);
});
test('old or corrupted preferences fall back to a valid page and clamp removed pages',()=>{
 assert.deepEqual(restorePosition(null,3,true),{page:0,opened:true,zoom:100,selected:null,scrollTop:0,scrollLeft:0});
 const restored=restorePosition({page:9,zoom:900,selected:{},scrollTop:-40,scrollLeft:NaN},2,true);
 assert.equal(restored.page,1);assert.equal(restored.zoom,100);assert.equal(restored.selected,null);assert.equal(restored.scrollTop,0);assert.equal(restored.scrollLeft,0);
 assert.equal(restorePosition({page:-1,opened:false},3,true).opened,false);
 assert.equal(restorePosition({page:-1},3,false).page,0);
});
