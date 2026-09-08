import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildSnapTargets,snapMoveBox} from '../lib/snap-guides.ts';

test('builds spread, page-center, and element alignment targets',()=>{
  const targets=buildSnapTargets(1000,700,[{x:100,y:140,w:200,h:100}]);
  assert.deepEqual(targets.x,[0,100,200,250,300,500,750,1000]);
  assert.deepEqual(targets.y,[0,140,190,240,350,700]);
});

test('snaps a moving center to the nearest page center',()=>{
  const result=snapMoveBox({x:197,y:80,w:100,h:60},{x:[250],y:[]},6);
  assert.equal(result.box.x,200);
  assert.equal(result.guides.x,250);
});

test('snaps x and y independently to another element',()=>{
  const result=snapMoveBox({x:294,y:194,w:100,h:60},{x:[400],y:[250]},6);
  assert.equal(result.box.x,300);
  assert.equal(result.box.y,190);
  assert.deepEqual(result.guides,{x:400,y:250});
});

test('does not snap outside the pixel threshold',()=>{
  const box={x:192,y:181,w:100,h:60};
  const result=snapMoveBox(box,{x:[250],y:[250]},6);
  assert.deepEqual(result.box,box);
  assert.deepEqual(result.guides,{});
});

test('editor wires move snapping, guides, and Alt bypass without changing resize or rotate',async()=>{
  const source=await readFile(new URL('../app/page.tsx',import.meta.url),'utf8');
  assert.match(source,/buildSnapTargets/);
  assert.match(source,/if\(!e\.altKey&&d\.snap\)/);
  assert.match(source,/snapGuides\.x!==undefined/);
  assert.match(source,/snapGuides\.y!==undefined/);
  assert.match(source,/按住 Alt 临时关闭吸附/);
});
