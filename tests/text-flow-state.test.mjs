import test from 'node:test';
import assert from 'node:assert/strict';
import {startTestServer} from './test-server.mjs';

const {base}=await startTestServer(test);

const validate=async(contour={})=>{
  const element={
    id:'writing',kind:'text',text:'自由轮廓文字',x:5,y:8,w:30,h:38,rotation:0,locked:false,
    textFlow:'contour',textContourLeft:[0,10,20,10,0],textContourRight:[0,5,10,5,0],...contour,
  };
  const response=await fetch(`${base}/api/validate`,{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({revision:0,books:[{id:'book',month:'2026-09',title:'旅行',cover:'linen-oat',spreads:[{id:'spread',theme:'rose',days:[],elements:[element]}]}]}),
  });
  return response.status;
};

test('journal validation accepts a bounded freeform text contour',async()=>{
  assert.equal(await validate(),200);
});

test('journal validation rejects incomplete, intersecting or non-text contours',async()=>{
  assert.equal(await validate({textContourLeft:[0,10]}),400);
  assert.equal(await validate({textContourLeft:[45,10,20,10,0],textContourRight:[40,5,10,5,0]}),400);
  assert.equal(await validate({kind:'photo'}),400);
  assert.equal(await validate({h:undefined}),400);
});
