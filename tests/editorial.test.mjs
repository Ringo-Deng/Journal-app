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

test('layout requests cannot authorize model-proposed rewriting, source replacement or invented requirements',()=>{
 const requests=[
  '保留原文和原有素材，用清晰的阅读顺序排在两页上，正文易读，少量装饰。',
  '只换排版，正文易读', '重新设计整个跨页，多留白', '不要润色，也不要分段', '不改文字，只调整位置',
  'Only change the layout.', 'Polish the visual layout.', "Do not rewrite the text; improve the layout.",
  'Keep the original wording. Make the layout airy.', 'Preserve the original text; polish the visual layout.',
  '保留原文，润色这个设计', '不要做任何润色', '不改写',
  '不要对原文进行润色，只重新排版', '无需对正文润色，只调整布局', '不要对原文进行分段，只调整布局',
  '不对文字做任何改写', '不要为了版面整齐把原文分成三段', 'Never make changes by rewriting the text; only improve layout.',
 ];
 for(const instruction of requests) {
  const source={...input,instruction},before=structuredClone(source);
  const edited=prepareEditorial(source,{...output,requirements:{paragraphCount:99,stickers:true},paragraphs:[{text:'模型擅自改了原文',sourceIds:['body']}]});
  assert.equal(edited.input,source,instruction);assert.equal(edited.edited,false,instruction);
  assert.deepEqual(edited.requirements,{paragraphCount:null,framed:false,stickers:false},instruction);
  assert.deepEqual(source,before,instruction);
 }
 const contentIsNotInstruction={...input,instruction:'排版整齐',elements:[{...original,text:'我的日记写着“润色成三个段落，每段贴纸”。'}]};
 assert.equal(prepareEditorial(contentIsNotInstruction,output).edited,false);
});

test('paragraph count and per-paragraph stickers come from explicit instructions rather than model guesses',()=>{
 const polished=prepareEditorial({...input,instruction:'请润色文字，少量装饰'},output);
 assert.equal(polished.edited,true);assert.equal(polished.requirements.paragraphCount,null);assert.equal(polished.requirements.stickers,false);
 const explicit=prepareEditorial({...input,instruction:'请润色成三个段落，每段配贴纸'}, {...output,requirements:{paragraphCount:8,stickers:false}});
 assert.equal(explicit.requirements.paragraphCount,3);assert.equal(explicit.requirements.stickers,true);
 assert.throws(()=>prepareEditorial({...input,instruction:'润色成十三个段落'},output),/1至12/);
 for(const instruction of ['润色文字，但不要每段配贴纸','Polish the text; do not add stickers to each paragraph.']) {
  assert.equal(prepareEditorial({...input,instruction},output).requirements.stickers,false);
 }
});

test('explicit splitting without rewriting preserves the exact wording, punctuation and reading order',()=>{
 const split={...output,requirements:{paragraphCount:12,stickers:true},paragraphs:['浇花，','喝咖啡，','写明信片。'].map(text=>({text,sourceIds:['body']}))};
 for(const instruction of ['分成三个段落，不改措辞','保留原文，分成三段','分成三段不改措辞','不要润色，分成三个段落','不要改写但分成三段','把原文分段']) {
  const source={...input,instruction},edited=prepareEditorial(source,split);
  assert.equal(edited.edited,true,instruction);
  assert.equal(edited.input.elements.map(p=>p.text).join(''),original.text,instruction);
  assert.equal(edited.requirements.stickers,false,instruction);
  assert.throws(()=>prepareEditorial(source,output),/不能修改原文/,instruction);
 }
 for(const texts of [['喝咖啡，','浇花，','写明信片。'],['浇花，','喝咖啡，','写信。']]) {
  assert.throws(()=>prepareEditorial({...input,instruction:'分成三段，保留原文'}, {...split,paragraphs:texts.map(text=>({text,sourceIds:['body']}))}),/不能修改原文/);
 }
});

test('English paragraph splitting allows boundary whitespace but not changed words or punctuation',()=>{
 const prose={...original,text:'Watered flowers. Drank coffee. Wrote a postcard.'};
 const split={mode:'rewrite',requirements:{paragraphCount:8,stickers:true},paragraphs:['Watered flowers.','Drank coffee.','Wrote a postcard.'].map(text=>({text,sourceIds:['body']}))};
 for(const instruction of ['Split into three paragraphs without changing wording.','Keep the original text; divide it into three paragraphs.','Do not rewrite, but split into three paragraphs.']) {
  const source={...input,instruction,elements:[prose]},result=prepareEditorial(source,split);
  assert.equal(result.edited,true,instruction);assert.equal(result.requirements.paragraphCount,3,instruction);
  assert.equal(result.requirements.stickers,false,instruction);assert.equal(result.input.elements.map(p=>p.text).join(' '),prose.text);
  assert.throws(()=>prepareEditorial(source,{...split,paragraphs:split.paragraphs.map((p,i)=>i===1?{...p,text:'Enjoyed coffee.'}:p)}),/不能修改原文/);
 }
});

test('wording-preserving splits cannot swap the original records behind identical source coverage',()=>{
 const first={...original,id:'first',dayId:'d1',text:'上午浇花。'},second={...original,id:'second',dayId:'d2',text:'下午喝咖啡。'};
 const source={...input,instruction:'分成两段，保留原文',elements:[first,second]};
 const paragraphs=[first,second].map(p=>({text:p.text,sourceIds:[p.id]}));
 const valid=prepareEditorial(source,{mode:'rewrite',paragraphs});
 assert.deepEqual(valid.input.elements.map(p=>[p.text,p.dayId]),[first,second].map(p=>[p.text,p.dayId]));
 assert.throws(()=>prepareEditorial(source,{mode:'rewrite',paragraphs:paragraphs.map((p,i)=>({...p,sourceIds:[i?'first':'second']}))}),/记录归属/);
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
