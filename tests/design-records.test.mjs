import test from 'node:test';
import assert from 'node:assert/strict';
import {designRecords} from '../local/design-records.mjs';
import {validatePlan} from '../local/design-plan.mjs';
const day={title:'原来的标题',raw:'原文',text:'纸面最新正文',photos:['/uploads/photo.png']};
test('instruction-only blank spreads ignore invented AI records',()=>{
 assert.deepEqual(designRecords({days:[]},{days:[{title:'假记录',text:'假内容'}]}),[]);
 assert.deepEqual(designRecords({days:[]},{}),[]);
});
test('missing or paragraph-shaped record metadata cannot change original records',()=>{
 for(const output of [{},{days:[]},{days:[{text:'一段'},{text:'二段'},{text:'三段'}]}]){
  const result=designRecords({days:[day]},output);
  assert.equal(result.length,1);assert.equal(result[0].text,day.text);assert.equal(result[0].title,day.title);
 }
 const long='原文'.repeat(1500);
 assert.equal(designRecords({days:[{raw:long}]},{})[0].text,long);
});
test('normalizing record metadata does not relax body or photo completeness checks',()=>{
 const input={days:[day],elements:[]};
 const output={elements:[{kind:'text',dayIndex:0,role:'body'}]};output.days=designRecords(input,output);
 assert.throws(()=>validatePlan(output.elements,input,[]),/照片/);
 assert.throws(()=>validatePlan([{kind:'photo',dayIndex:0,photoIndex:0}],input,[]),/正文/);
 const valid=validatePlan([...output.elements,{kind:'photo',dayIndex:0,photoIndex:0}],input,[]);
 assert.equal(valid[0].text,day.text);assert.equal(valid[1].src,day.photos[0]);
});
