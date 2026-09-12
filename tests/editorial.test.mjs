import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareEditorial,checkParagraphDesign} from '../local/editorial.mjs';
import {validatePlan} from '../local/design-plan.mjs';
import {regenerateSpread} from '../lib/journal.ts';
const original={id:'body',dayId:'d',kind:'text',role:'body',text:'浇花，喝咖啡，写明信片。',x:5,y:10,w:38,rotation:0,locked:false};
const input={instruction:'把日志润色成三个段落，每段加框并配贴纸',days:[{id:'d',raw:original.text,text:original.text,title:'日常',photos:[]}],elements:[original]};
const output={mode:'rewrite',requirements:{paragraphCount:3,framed:true,stickers:true},paragraphs:['给花浇了水。','喝了一杯咖啡。','写了一张明信片。'].map(text=>({text,sourceIds:['body']}))};
const asset={id:'a',src:'/materials/a.png'};
function fixture(){
 const edited=prepareEditorial(input,output);
 const planned=edited.input.elements.flatMap((p,i)=>[{kind:'text',sourceId:p.id,x:i===1?54:5,y:i===2?58:12,w:32,fontSize:18,frame:'outline'},{kind:'asset',assetId:'a',forParagraph:p.id,x:i===1?88:39,y:i===2?58:12,w:7}]);
 return {edited,pieces:validatePlan(planned,edited.input,[asset])};
}
test('one original body becomes three independent polished paragraphs without losing raw source',()=>{
 const {edited,pieces}=fixture();
 assert.equal(edited.requirements.framed,false);
 assert.ok(pieces.filter(p=>p.kind==='text').every(p=>p.frame==='plain'));
 checkParagraphDesign(pieces,edited.input,edited.requirements,[asset]);
 const spread={id:'s',theme:'rose',days:input.days,elements:input.elements};
 const result=regenerateSpread(spread,{theme:'rose',days:input.days,elements:pieces,contentEdited:true},[asset]);
 assert.equal(result.elements.filter(p=>p.kind==='text').length,3);
 assert.equal(new Set(result.elements.map(p=>p.id)).size,6);
 assert.equal(result.days[0].text,output.paragraphs.map(p=>p.text).join('\n\n'));
 assert.equal(result.days[0].raw,original.text);
 assert.equal(spread.elements[0].text,original.text);
});
test('preserve mode leaves text alone, rewrite validates number and locked source',()=>{
 assert.equal(prepareEditorial(input,{mode:'preserve'}).input,input);
 assert.throws(()=>prepareEditorial(input,{...output,paragraphs:output.paragraphs.slice(0,2)}),/数量/);
 assert.throws(()=>prepareEditorial({...input,elements:[{...original,locked:true}]},output),/锁定/);
});
test('rejects missing stickers and overlapping text boxes without requiring text frames',()=>{
 const {edited,pieces}=fixture();
 checkParagraphDesign(pieces.map(p=>({...p,frame:'plain'})),edited.input,edited.requirements,[asset]);
 assert.throws(()=>checkParagraphDesign(pieces.filter(p=>p.kind==='text'),edited.input,edited.requirements),/贴纸/);
 assert.throws(()=>checkParagraphDesign(pieces.map(p=>({...p,x:5,y:12})),edited.input,edited.requirements,[asset]),/重叠/);
});
test('style and colour coordinated stickers need not match paragraph keywords',()=>{
 const {edited,pieces}=fixture();
 edited.input.elements[0].stickerKeywords=['coffee','咖啡'];
 checkParagraphDesign(pieces,edited.input,edited.requirements,[{id:'a',name:'玫瑰',tags:['flowers']}]);
 assert.throws(()=>checkParagraphDesign(pieces,edited.input,edited.requirements,[]),/贴纸/);
 const drawn=pieces.map(p=>p.forParagraph===edited.input.elements[0].id?{...p,kind:'doodle',frame:'sticker',path:'M 10 20 L 90 20 L 80 90 L 20 90 Z'}:p);
 checkParagraphDesign(drawn,edited.input,edited.requirements,[{id:'a',name:'玫瑰',tags:['flowers']}]);
});
test('empty placeholder and headings do not count as missing journal prose',()=>{
 const extra=[{id:'placeholder',kind:'text',text:'写在这里…',locked:false},{id:'empty',kind:'text',text:'  ',locked:false},{id:'heading',kind:'text',role:'title',text:'标题',locked:false}];
 const result=prepareEditorial({...input,elements:[original,...extra]},output);
 assert.equal(result.input.elements.filter(p=>Number.isInteger(p.paragraphIndex)).length,3);
 for(const p of extra) assert.deepEqual(result.input.elements.find(s=>s.id===p.id),p);
});
test('real free text is still protected and retry identifies the missing source',()=>{
 const other={id:'real-note',kind:'text',text:'还给妈妈买了礼物。',locked:false};
 assert.throws(()=>prepareEditorial({...input,elements:[original,other]},output),e=>e.retryHint.includes('real-note'));
});
test('layout may omit an empty hint without deleting it or blocking the three paragraphs',()=>{
 const {edited}=fixture();const hint={id:'hint',kind:'text',text:'写在这里…',x:5,y:12,w:30,rotation:0,locked:false};
 edited.input.elements.push(hint);
 const pieces=validatePlan(edited.input.elements.filter(p=>p.id!==hint.id).map((p,i)=>({kind:'text',sourceId:p.id,x:i===1?54:5,y:i===2?58:12,w:32,fontSize:18,frame:'outline'})),edited.input,[]);
 assert.equal(pieces.find(p=>p.sourceId==='hint').text,hint.text);
 checkParagraphDesign(pieces,edited.input,{paragraphCount:3,framed:false,stickers:false});
});
