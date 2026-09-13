import test from 'node:test';
import assert from 'node:assert/strict';
import {lassoBounds,normalizeLassoPoints,snapLassoToEdges} from '../lib/material-lasso.ts';

function rectangleRaster(width=100,height=100){
 const data=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const offset=(y*width+x)*4,inside=x>=30&&x<=70&&y>=25&&y<=75,value=inside?35:245;
  data[offset]=value;data[offset+1]=value;data[offset+2]=value;data[offset+3]=255;
 }
 return{data,width,height};
}

test('lasso points are bounded, deduplicated and reject tiny or flat paths',()=>{
 const points=normalizeLassoPoints([[-1,.2],[0,.2],[.5,.2],[1.4,.7],[.2,1],[.2,.4],[0,.2]]);
 assert.deepEqual(points[0],[0,.2]);
 assert.deepEqual(points.at(-1),[.2,.4]);
 assert.ok(lassoBounds([[.1,.1],[.5,.08],[.9,.1],[.92,.5],[.9,.9],[.5,.92],[.1,.9],[.08,.5]]));
 assert.equal(lassoBounds([[.1,.1],[.2,.1],[.3,.1],[.4,.1],[.5,.1],[.6,.1]]),null);
 assert.equal(lassoBounds([[.1,.1],[.101,.1],[.101,.101],[.1,.101],[.1,.1005],[.1005,.1]]),null);
});

test('magnetic lasso moves a nearby freehand loop onto strong image edges',()=>{
 const drawn=[[.25,.2],[.5,.2],[.75,.2],[.75,.5],[.75,.8],[.5,.8],[.25,.8],[.25,.5]];
 const result=snapLassoToEdges(drawn,rectangleRaster(),12),bounds=lassoBounds(result.points);
 assert.ok(result.moved>=6);
 assert.ok(bounds);
 assert.ok(bounds[0]>.27&&bounds[0]<.32);
 assert.ok(bounds[1]>.22&&bounds[1]<.28);
 assert.ok(bounds[2]>.38&&bounds[2]<.46);
 assert.ok(bounds[3]>.46&&bounds[3]<.56);
});

test('magnetic lasso keeps the hand-drawn path when no credible edge is nearby',()=>{
 const raster=rectangleRaster();raster.data.fill(128);for(let index=3;index<raster.data.length;index+=4)raster.data[index]=255;
 const drawn=[[.2,.2],[.5,.18],[.8,.2],[.82,.5],[.8,.8],[.5,.82],[.2,.8],[.18,.5]],result=snapLassoToEdges(drawn,raster,12);
 assert.equal(result.moved,0);
 assert.deepEqual(result.points,drawn);
});
