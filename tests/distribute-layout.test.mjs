import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {distributeRects} from '../lib/distribute-layout.ts';

test('distributes different widths with equal horizontal gaps',()=>{
  const deltas=distributeRects([
    {id:'a',x:0,y:0,w:10,h:10},
    {id:'b',x:25,y:0,w:20,h:10},
    {id:'c',x:70,y:0,w:10,h:10},
  ],'x');
  assert.deepEqual(deltas,{a:0,b:5,c:0});
});

test('distributes different heights with equal vertical gaps',()=>{
  const deltas=distributeRects([
    {id:'a',x:0,y:0,w:10,h:10},
    {id:'b',x:0,y:30,w:10,h:20},
    {id:'c',x:0,y:80,w:10,h:10},
  ],'y');
  assert.deepEqual(deltas,{a:0,b:5,c:0});
});

test('keeps fewer than three units unchanged',()=>{
  assert.deepEqual(distributeRects([
    {id:'a',x:0,y:0,w:10,h:10},
    {id:'b',x:40,y:0,w:10,h:10},
  ],'x'),{a:0,b:0});
});

test('editor exposes equal spacing only for three or more selected units',async()=>{
  const source=await readFile(new URL('../app/page.tsx',import.meta.url),'utf8');
  assert.match(source,/function distributeSelection\(axis:'x'\|'y'\)/);
  assert.match(source,/activeUnitCount>=3/);
  assert.match(source,/>横向等距</);
  assert.match(source,/>纵向等距</);
  assert.match(source,/distributeRects\(units\.map/);
});
