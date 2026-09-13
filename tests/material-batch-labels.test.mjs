import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeMaterialLabels} from '../lib/material-batch-labels.ts';

const changes=(content=[],style=[],color=[])=>({content:new Set(content),style:new Set(style),color:new Set(color)});

test('batch label changes preserve each material difference while adding and removing selected labels',()=>{
 const first={content:['人物'],style:['复古'],color:[]};
 const second={content:['植物'],style:['复古','水彩'],color:['绿']};
 const additions=changes(['动物'],[],['红']);
 const removals=changes([],['复古'],[]);
 assert.deepEqual(mergeMaterialLabels(first,additions,removals),{content:['人物','动物'],style:[],color:['红']});
 assert.deepEqual(mergeMaterialLabels(second,additions,removals),{content:['植物','动物'],style:['水彩'],color:['绿','红']});
 assert.deepEqual(first,{content:['人物'],style:['复古'],color:[]});
 assert.deepEqual(second,{content:['植物'],style:['复古','水彩'],color:['绿']});
});

test('batch additions stay unique and an explicit addition wins an overlapping removal',()=>{
 const labels={content:['人物','人物'],style:[],color:[]};
 const same=changes(['人物'],[],[]);
 assert.deepEqual(mergeMaterialLabels(labels,same,same),{content:['人物'],style:[],color:[]});
});
