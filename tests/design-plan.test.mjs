import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePlan} from '../local/design-plan.mjs';
import {regenerateSpread, newBook, addBlankSpread} from '../lib/journal.ts';
const text={id:'text1',kind:'text',text:'今天下雨，在家喝咖啡。',x:5,y:10,w:35,rotation:0,locked:false};
const input={days:[],elements:[text]};
const design=[{kind:'text',sourceId:'text1',text:'不应覆盖',x:56,y:22,w:35,frame:'outline',color:'#123456'}, {kind:'doodle',x:8,y:40,w:18,h:20,path:'M 10 20 Q 50 5 90 20 L 80 80 L 20 80 Z'}];
test('full spread design moves original writing while normalizing text to plain',()=>{
 const elements=validatePlan(design,input,[]);
 assert.equal(elements[0].text,text.text);
 const result=regenerateSpread({id:'s',theme:'rose',days:[],elements:[text]}, {theme:'archive',days:[],elements}, []);
 assert.equal(result.elements[0].x,56);
 assert.equal(result.elements[0].frame,'plain');
 assert.equal(result.elements[0].text,text.text);
 assert.equal(result.elements[1].kind,'doodle');
 assert.equal(result.elements[1].h,20);
});
test('rejects omitted content, fake assets and executable markup',()=>{
 assert.throws(()=>validatePlan(design.slice(1),input,[]),/遗漏/);
 assert.throws(()=>validatePlan([...design,{kind:'asset',assetId:'fake'}],input,[]),/不存在/);
 assert.throws(()=>validatePlan([design[0],{kind:'doodle',path:'<svg onload=alert(1)>'}],input,[]),/路径/);
 assert.throws(()=>validatePlan(undefined,input,[]),/完整/);
});
test('known library IDs can be repaired from sourceId without accepting invented materials or replacing page sources',()=>{
 const asset={id:'library-paper',src:'/materials/paper.png'};
 const result=validatePlan([design[0],{kind:'asset',sourceId:asset.id,x:60,y:30,w:15}],input,[asset]);
 assert.equal(result[1].assetId,asset.id);assert.equal(result[1].src,asset.src);assert.equal(result[1].sourceId,undefined);
 assert.throws(()=>validatePlan([design[0],{kind:'asset',sourceId:'invented'}],input,[asset]),/不存在/);
 const original={id:asset.id,kind:'photo',src:'/uploads/photo.png',x:60,y:20,w:15};
 assert.throws(()=>validatePlan([{kind:'asset',sourceId:asset.id}],{days:[],elements:[original]},[asset]),/原始元素类型/);
});
test('user can add arbitrary blank spreads independent of dates',()=>{
 let b=newBook('2026-09');
 for(let i=0;i<35;i++) b=addBlankSpread(b);
 assert.equal(b.spreads.length,36);
 assert.equal(new Set(b.spreads.map(s=>s.id)).size,36);
 assert.ok(b.spreads.every(s=>!s.days.length&&!s.elements.length));
});
test('creative plans keep paper height, typography and coloured illustration layers',()=>{
 const result=validatePlan([{kind:'text',sourceId:'text1',x:5,y:10,w:30,h:22,fontFamily:'serif',frame:'ticket'},{kind:'doodle',x:55,y:30,w:24,h:34,drawing:[{path:'M10 20 L90 20 L80 80 Z',fill:'#be8361',stroke:'#754b34',width:1.2}]}],input,[]);
 assert.equal(result[0].frame,'plain');assert.equal(result[0].h,22);assert.equal(result[0].fontFamily,'serif');
 assert.equal(result[1].drawing[0].fill,'#be8361');
 assert.throws(()=>validatePlan([{...result[1],drawing:[{path:'<script>bad</script>'}]}],{days:[],elements:[]},[]),/图层/);
});
test('new records can use an AI title when the local record has not got one yet',()=>{
 const result=validatePlan([{kind:'text',dayIndex:0,role:'title',text:'一餐，一份礼物'},{kind:'text',dayIndex:0,role:'body'}],{days:[{raw:'和爸妈吃牛排。'}],elements:[]},[]);
 assert.equal(result[0].text,'一餐，一份礼物');assert.equal(result[1].text,'和爸妈吃牛排。');
});
test('complete redesign preserves locked backing layer order and separate copies of the same asset',()=>{
 const paper={id:'paper',kind:'asset',assetId:'same',src:'/materials/paper.png',x:6,y:14,w:30,h:35,locked:true};
 const copy={...paper,id:'copy',x:62,locked:false};
 const spread={id:'s',theme:'archive',days:[],elements:[paper,text,copy],removed:['same']};
 const result=regenerateSpread(spread,{theme:'archive',days:[],elements:[{...paper,sourceId:'paper',x:90},{...text,sourceId:text.id},{...copy,sourceId:'copy',x:65}]},[]);
 assert.deepEqual(result.elements.map(p=>p.id),['paper','text1','copy']);
 assert.deepEqual(result.elements[0],paper);
 assert.equal(result.elements[2].x,65);
 const legacyPartial=regenerateSpread(spread,{theme:'archive',days:[],elements:[{...text,sourceId:text.id}]},[]);
 assert.deepEqual(legacyPartial.elements.at(-1),paper);
 assert.deepEqual(spread.elements,[paper,text,copy]);
});
