import test from 'node:test';
import assert from 'node:assert/strict';
import {reorderStack,stackSequence} from '../lib/stack-order.ts';

test('canvas stack changes without reordering the sidebar data array',()=>{
  const items=[{id:'a'},{id:'b'},{id:'c'},{id:'d'}];
  const top=reorderStack(items,['b'],'top');
  assert.deepEqual(top.map(item=>item.id),['a','b','c','d']);
  assert.equal(top.find(item=>item.id==='b')?.stackOrder,19);
  assert.equal(stackSequence(top).at(-1)?.id,'b');

  const bottom=reorderStack(top,['c'],'bottom');
  assert.deepEqual(bottom.map(item=>item.id),['a','b','c','d']);
  assert.equal(bottom.find(item=>item.id==='c')?.stackOrder,1);
  assert.equal(stackSequence(bottom)[0]?.id,'c');
});

test('a grouped selection moves as one canvas stack block',()=>{
  const items=[{id:'a'},{id:'g1'},{id:'x'},{id:'g2'}];
  const top=reorderStack(items,['g1','g2'],'top');
  assert.deepEqual(top.map(item=>item.id),['a','g1','x','g2']);
  assert.equal(top.find(item=>item.id==='g1')?.stackOrder,19);
  assert.equal(top.find(item=>item.id==='g2')?.stackOrder,19);
  assert.deepEqual(stackSequence(top).slice(-2).map(item=>item.id),['g1','g2']);
});
