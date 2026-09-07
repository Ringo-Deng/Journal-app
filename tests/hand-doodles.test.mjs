import test from 'node:test';
import assert from 'node:assert/strict';
import {handDoodles,makeHandDoodle} from '../local/hand-doodles.mjs';
import {validatePlan} from '../local/design-plan.mjs';
const input={days:[],elements:[],doodleMode:'handdrawn'};
test('hand doodles use controlled curves, sensible proportions and no filled card',()=>{
 for(const motif of Object.keys(handDoodles)){
  const [p]=validatePlan([{kind:'doodle',motif,w:44,h:50,x:40,y:88,path:'bad model geometry',drawing:[{path:'broken'}],background:'#ff0000'}],input,[]);
  assert.equal(p.path,handDoodles[motif].path);assert.equal(p.drawing,undefined);assert.equal(p.background,undefined);
  assert.ok(p.w<=handDoodles[motif].max);assert.ok(p.y+p.h<=94);assert.ok(p.x+p.w<=48);
  assert.equal(p.h,p.w*1.43*handDoodles[motif].ratio);
 }
});
test('unsupported motifs and excessive doodles are rejected rather than shown as bad drawings',()=>{
 assert.throws(()=>makeHandDoodle({motif:'random-steak'}),/素材库/);
 assert.throws(()=>validatePlan(Array.from({length:7},()=>({kind:'doodle',motif:'heart'})),input,[]),/最多6/);
});
test('small doodles preserve paragraph associations and do not bypass original writing checks',()=>{
 const text={id:'body',kind:'text',role:'body',text:'喝了一杯咖啡。',locked:false};
 const request={...input,elements:[text]};
 const result=validatePlan([{kind:'text',sourceId:'body'},{kind:'doodle',motif:'coffee',frame:'sticker',forParagraph:'body'}],request,[]);
 assert.equal(result[1].forParagraph,'body');assert.equal(result[0].text,text.text);
 assert.throws(()=>validatePlan([result[1]],request,[]),/motif|手绘|遗漏/);
});
