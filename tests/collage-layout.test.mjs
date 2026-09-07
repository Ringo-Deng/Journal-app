import test from 'node:test';
import assert from 'node:assert/strict';
import {finishCollage,textFootprint} from '../local/collage-layout.mjs';
const assets=[...Array.from({length:7},(_,i)=>({id:`flower-${i}`,src:`/f${i}.png`,name:'小花',width:100,height:100})),...['rust','sage'].map(c=>({id:`collage-arrow-${c}`,src:`/${c}.svg`,width:140,height:100}))];
const body=(text,i=0)=>({kind:'text',sourceId:`text-${i}`,role:'body',text,x:i?56:5,y:20,w:34,fontSize:18,rotation:0});
const overlaps=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
test('short spread preserves facts and references, adds real arrows and edge clusters without covering writing',()=>{
 const input=[body('今天和爸爸妈妈去了莫尔顿吃牛排。战斧牛排非常好吃。'),body('给妈妈买了一个金镯子。',1)];
 const before=structuredClone(input);const out=finishCollage(input,{elements:[]},assets);
 assert.deepEqual(input,before);
 assert.deepEqual(out.filter(p=>p.kind==='text'&&p.role!=='decor').map(p=>[p.sourceId,p.text]),input.map(p=>[p.sourceId,p.text]));
 assert.ok(out.some(p=>p.frame==='collage'));assert.ok(out.some(p=>p.assetId==='collage-arrow-rust'));
 assert.ok(out.filter(p=>p.kind==='asset').length>=4);
 for(const a of out.filter(p=>p.kind==='asset')){
  assert.ok(a.y+a.h<=93);assert.ok(a.x+a.w<=48||a.x>=52);
  for(const t of out.filter(p=>p.kind==='text'))assert.equal(overlaps(a,textFootprint(t)),false);
 }
});
test('long text and photos keep content and geometry; decorations yield to occupied space',()=>{
 const t=body('长篇文字。'.repeat(160));t.y=6;t.w=42;t.fontSize=16;
 const photo={kind:'photo',sourceId:'photo',src:'/photo.png',x:53,y:5,w:40,h:84};
 const out=finishCollage([t,photo],{elements:[]},assets);
 assert.deepEqual(out.find(p=>p.kind==='text'),t);assert.deepEqual(out.find(p=>p.kind==='photo'),photo);
 assert.ok(out.filter(p=>p.kind==='asset').length<4);
});
test('locked items and explicit minimal instructions are not restyled',()=>{
 const t={...body('保留这里'),frame:'note'};
 assert.deepEqual(finishCollage([t],{instruction:'极简，不要贴纸'},assets),[t]);
 const out=finishCollage([t],{elements:[{...t,id:t.sourceId,locked:true}]},assets);
 assert.deepEqual(out.find(p=>p.sourceId===t.sourceId),t);
});
test('several paragraphs stay distinct and keep their paragraph associations',()=>{
 const ps=Array.from({length:4},(_,i)=>({...body('一段独立的记录。'.repeat(3),i),paragraphIndex:i}));
 const out=finishCollage(ps,{elements:[]},assets).filter(p=>p.kind==='text'&&p.role!=='decor');
 assert.equal(out.length,4);assert.deepEqual(out.map(p=>p.paragraphIndex),[0,1,2,3]);
 for(let i=0;i<out.length;i++)for(let j=i+1;j<out.length;j++)assert.equal(overlaps(textFootprint(out[i]),textFootprint(out[j])),false);
});
test('large hero stickers remain associated with their paragraphs even when their top anchors are far apart',async()=>{
 const {checkParagraphDesign}=await import('../local/editorial.mjs');
 const {readFile}=await import('node:fs/promises');
 const library=JSON.parse(await readFile(new URL('../public/materials/manifest.json',import.meta.url)));
 const ps=[body('今天和爸妈吃了战斧牛排。'),body('给妈妈买了一个金镯子。',1)];
 const result=finishCollage(ps,{elements:[]},library);
 assert.ok(result.some(p=>p.assetId==='collage-steak'));
 assert.ok(result.some(p=>p.assetId==='collage-bracelet'));
 checkParagraphDesign(result,{elements:[]},{stickers:true},library);
});
