import test from 'node:test';
import assert from 'node:assert/strict';
import {mapMaterialSourceBounds,normalizeMaterialSourceBounds} from '../lib/material-source-bounds.mjs';

test('material source bounds accept only normalized rectangles',()=>{
  assert.deepEqual(normalizeMaterialSourceBounds([.1,.2,.3,.4]),[.1,.2,.3,.4]);
  assert.equal(normalizeMaterialSourceBounds([0,0,0,1]),null);
  assert.equal(normalizeMaterialSourceBounds([.8,0,.3,1]),null);
  assert.equal(normalizeMaterialSourceBounds(['bad',0,.2,.2]),null);
});

test('crop-local bounds map back to the original source',()=>{
  assert.deepEqual(mapMaterialSourceBounds([0,0,1,1],[.2,.1,.4,.6]),[.2,.1,.4,.6]);
  const mapped=mapMaterialSourceBounds([.1,.2,.5,.5],[.2,.1,.4,.6]);
  assert.ok(mapped.every((value,index)=>Math.abs(value-[.24,.22,.2,.3][index])<1e-10));
  assert.equal(mapMaterialSourceBounds([0,0,1,1],[.9,0,.2,1]),null);
});
