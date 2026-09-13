import test from 'node:test';
import assert from 'node:assert/strict';
import {materialDragIds,materialGroupPatches} from '../lib/material-group-drag.ts';

const assets=[
 {id:'paper',group:'纸张'},
 {id:'rose',group:'装饰贴纸'},
 {id:'ticket'},
];

test('dragging a selected material carries the complete available selection in library order',()=>{
 const selected=new Set(['ticket','rose','missing']);
 assert.deepEqual(materialDragIds('rose',selected,assets),['rose','ticket']);
});

test('dragging an unselected material keeps the existing selection out of the move',()=>{
 assert.deepEqual(materialDragIds('paper',new Set(['rose','ticket']),assets),['paper']);
});

test('group patches update the dragged batch once and skip assets already in the target group',()=>{
 assert.deepEqual(materialGroupPatches(assets,['rose','paper','rose'],'装饰贴纸'),[{id:'paper',group:'装饰贴纸'}]);
 assert.deepEqual(assets,[{id:'paper',group:'纸张'},{id:'rose',group:'装饰贴纸'},{id:'ticket'}]);
});
