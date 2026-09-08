import test from 'node:test';
import assert from 'node:assert/strict';
import {hasThinBridge,acceptDenseRefinement} from '../lib/material-segmentation-refine.mjs';

function alpha(width,height,paint){
 const data=new Uint8Array(width*height);paint((x,y,value=255)=>{if(x>=0&&x<width&&y>=0&&y<height)data[y*width+x]=value});return data;
}
function rect(set,x0,y0,x1,y1){for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)set(x,y)}

test('detects two substantial subjects joined by a thin bridge',()=>{
 const width=100,height=70;
 const mask=alpha(width,height,set=>{rect(set,8,15,43,57);rect(set,57,13,92,55);rect(set,43,34,57,36)});
 assert.equal(hasThinBridge(mask,width,height),true);
});

test('keeps one solid subject intact',()=>{
 const width=100,height=70;
 const mask=alpha(width,height,set=>rect(set,12,10,88,60));
 assert.equal(hasThinBridge(mask,width,height),false);
});

test('ignores tiny detached details and narrow decorative appendages',()=>{
 const width=100,height=70;
 const mask=alpha(width,height,set=>{rect(set,20,12,80,58);rect(set,80,31,94,34);rect(set,4,4,7,7)});
 assert.equal(hasThinBridge(mask,width,height),false);
});

test('accepts conservative dense refinement and rejects fragmentation',()=>{
 const before=[{width:100,height:80}];
 assert.equal(acceptDenseRefinement(before,[{width:42,height:54},{width:40,height:52}]),true);
 assert.equal(acceptDenseRefinement(before,[{width:100,height:80}]),false);
 assert.equal(acceptDenseRefinement(before,Array.from({length:7},()=>({width:24,height:24}))),false);
 assert.equal(acceptDenseRefinement(before,[{width:50,height:50},{width:8,height:30}]),false);
});
