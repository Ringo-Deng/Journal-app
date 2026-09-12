import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import sharp from 'sharp';
import {paperGroupContent,validatePaperSelection,placePaperGroup,paperGroupSlots} from '../local/paper-group-layout.mjs';
import {generatePaperGroup} from '../local/paper-group.mjs';
import {paperShapes} from '../local/paper-art.mjs';
import {referenceLayoutGuide} from '../local/reference-layout-guide.mjs';
import {prepareDesignContext,finishDesignContext} from '../local/design-context.mjs';
import {bounds,intersects,layoutIssues} from '../lib/layout-safety.mjs';
import {appendDay,regenerateSpread,defaultBook} from '../lib/journal.ts';

const source=[
 {id:'title',kind:'text',role:'title',text:'海边的一天',x:5,y:10,w:30},
 {id:'body',kind:'text',role:'body',text:'沿着沙滩走了一圈，在岸边等日落。',x:5,y:20,w:30,colorRuns:[{start:0,end:2,color:'#123456'}]},
];
const input={days:[],elements:source,ratio:1.43,headerSpace:12};
const ids=['asset-001','asset-085','asset-057','asset-075','asset-026','asset-002'];
const candidates=[
 ...ids.map((id,i)=>({id,name:id,src:`/materials/${id}-cut.png`,width:100,height:160,category:i===3?'邮票':'植物'})),
 {id:'asset-035',name:'植物学古籍',src:'/materials/asset-035-cut.png',width:955,height:1249,category:'纸张'},
 {id:'asset-081',name:'透明旧日手稿',src:'/materials/asset-081-cut.png',width:960,height:730,category:'纸张'},
];
const selection={
 palette:{backPaper:'#D8E0D0',frontPaper:'#FFF8E8',ink:'#302B24',tape:'#C8D5B9'},
 writing:{shape:'torn',pattern:'plain',width:20,align:'center'},
 papers:[],stickers:[{slot:'hero',assetId:ids[0],width:6},{slot:'accent',assetId:ids[1],width:5}],tapes:[],
};
const generatedBack={shape:'rect',pattern:'grid',color:'#B8CED8',position:'top',width:20,height:18,rotation:-3};
const paperSources=['/uploads/back-a.png','/uploads/back-b.png','/uploads/writing.png'];
const sheets=elements=>elements.filter(p=>p.frame==='collage-paper');
const make=(chosen=selection,extra={},assets=candidates)=>placePaperGroup(paperGroupContent({...input,...extra}),chosen,assets,paperSources,{...input,...extra});
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-9,`${actual} != ${expected}`);

test('short sentences do not strand the final character on its own line',()=>{
 const elements=[{id:'sea',kind:'text',text:'今天去海边玩耍了',x:10,y:20,w:28}];
 const result=make({...selection,writing:{...selection.writing,width:12},stickers:[]},{elements});
 const writing=result.find(p=>p.kind==='text');
 assert.equal(writing.text,elements[0].text);
 assert.ok(writing.w>12&&writing.w<18);
 assert.ok(writing.h<4,'the complete sentence fits one readable line');
 assertWritingInside(result,1.43);
});

function assertWritingInside(elements,ratio) {
 const front=sheets(elements).find(p=>p.stackOrder===3);
 assert.ok(front);
 for(const text of elements.filter(p=>p.kind==='text')) {
  const box=bounds(text,ratio);
  assert.ok(box.x>=front.x&&box.x+box.w<=front.x+front.w);
  assert.ok(box.y>=front.y&&box.y+box.h<=front.y+front.h);
  assert.ok(front.stackOrder<text.stackOrder);
 }
}

test('one, two and three sheets use selected materials and keep source identity without changing input',()=>{
 for(const papers of [[],[generatedBack],[{assetId:'asset-035',position:'left',width:18,rotation:-3},{...generatedBack,position:'bottom'}]]) {
  const chosen={...selection,papers},before=structuredClone(input),out=make(chosen);
  assert.deepEqual(input,before);
  assert.equal(sheets(out).length,papers.length+1);
  assert.equal(new Set(out.map(p=>p.groupId)).size,1);
  assert.deepEqual(out.filter(p=>p.kind==='text').map(p=>[p.sourceId,p.text]),source.map(p=>[p.id,p.text]));
  assert.deepEqual(layoutIssues(out,input.ratio,input.headerSpace),[]);
  assertWritingInside(out,input.ratio);
  assert.ok(out.every(p=>bounds(p).y>=input.headerSpace+2-1e-9));
 }
});

test('writing height follows actual text and selected width instead of a fixed large note',()=>{
 const body=text=>[{id:'body',kind:'text',role:'body',text,x:5,y:20,w:30}];
 const short=make(selection,{elements:body('看海。')}),long=make(selection,{elements:body('沿着沙滩走了一圈，在岸边等太阳慢慢落下。')});
 const front=out=>sheets(out).find(p=>p.stackOrder===3);
 assert.ok(front(short).h<front(long).h);
 assert.ok(front(short).h<12,'one short line should not create a half-page writing rectangle');
 const narrow=make({...selection,writing:{...selection.writing,width:16}},{elements:body('沿着沙滩走了一圈，在岸边等日落。')});
 const wide=make({...selection,writing:{...selection.writing,width:28,align:'left'}},{elements:body('沿着沙滩走了一圈，在岸边等日落。')});
 assert.ok(front(narrow).w<front(wide).w);
 assert.ok(front(narrow).h>=front(wide).h);
 assert.equal(wide.find(p=>p.kind==='text').textAlign,'left');
 for(const out of [short,long,narrow,wide])assert.deepEqual(layoutIssues(out),[]);
});

test('short phrases use small notes and allow no decoration or a single secondary accent',()=>{
 const body={id:'brief',kind:'text',role:'body',text:'看海。',x:62,y:45,w:20};
 for(const stickers of [[],[{slot:'accent',assetId:ids[1],width:3}]]) {
  const chosen=validatePaperSelection({...selection,writing:{...selection.writing,width:6},stickers},candidates);
  const out=make(chosen,{elements:[body],entrySide:'right'}),front=sheets(out).at(-1),text=out.find(p=>p.kind==='text');
  assert.ok(front.w<=10&&front.h<12,'a three-character phrase should fit a narrow paper strip');
  assert.equal(text.text,body.text);assert.equal(text.fontSize,16);assert.equal(text.sourceId,body.id);
  assert.equal(out.filter(p=>p.assetId).length,stickers.length);
  assert.deepEqual(layoutIssues(out),[]);assertWritingInside(out,1.43);
 }
 const overwide=make({...selection,writing:{...selection.writing,width:28},stickers:[]},{elements:[body]});
 assert.ok(sheets(overwide).at(-1).w<12,'model width is a maximum, not a reason to oversize a short note');
});

test('placement prefers the current writing position and centers a fresh note away from page edges',()=>{
 const chosen={...selection,papers:[],stickers:[]};
 const body={id:'brief',kind:'text',role:'body',text:'看海。',x:62,y:65,w:10,fontSize:16,lineHeight:1.65};
 const out=make(chosen,{elements:[body],entrySide:undefined}),text=out.find(p=>p.kind==='text');
 near(text.x+text.w/2,body.x+body.w/2);near(text.y+text.h/2,body.y+bounds(body,1.43).h/2);
 assert.ok(out.every(p=>p.x>=52),'existing right-page writing stays on that side by default');
 const fresh=make(chosen,{elements:[],days:[{raw:'看海。',photos:[]}],entrySide:'left'}),front=sheets(fresh).at(-1);
 near(front.x+front.w/2,25);assert.ok(front.y>25&&front.y<55,'a fresh short note has intentional surrounding whitespace');
 const bottom=make(chosen,{elements:[body],instruction:'放在左页底部',entrySide:'right'});
 assert.ok(bottom.every(p=>bounds(p).x+bounds(p).w<=48));near(Math.max(...bottom.map(p=>bounds(p).y+bounds(p).h)),96);
});

test('all shapes and page ratios keep writing safe without reducing fonts or changing source text',()=>{
 const writing=[{id:'body',kind:'text',role:'body',text:'今天去海边玩耍了。',x:5,y:20,w:30}];
 for(const shape of Object.keys(paperShapes))for(const ratio of [.8,1,1.43,1.8])for(const aspect of [.2,1,4]) {
  const assets=candidates.map(a=>({...a,width:100*aspect,height:100}));
  const chosen={...selection,writing:{...selection.writing,shape,width:18},stickers:Object.keys(paperGroupSlots).map((slot,i)=>({slot,assetId:ids[i],width:6}))};
  const out=make(chosen,{ratio,elements:writing,entrySide:'right'},assets),context=`${shape}/${ratio}/${aspect}`;
  assert.deepEqual(layoutIssues(out,ratio,12),[],context);
  assert.ok(out.every(p=>bounds(p,ratio).x>=52&&bounds(p,ratio).x+bounds(p,ratio).w<=98),context);
  assertWritingInside(out,ratio);
  const text=out.find(p=>p.kind==='text');
  assert.equal(text.text,writing[0].text);assert.equal(text.sourceId,writing[0].id);assert.equal(text.fontSize,16);
  if(shape==='oval') {
   const front=sheets(out).find(p=>p.stackOrder===3),box=bounds(text,ratio);
   for(const x of [box.x,box.x+box.w])for(const y of [box.y,box.y+box.h]) {
    assert.ok(((x-front.x-front.w/2)/(front.w/2))**2+((y-front.y-front.h/2)/(front.h/2))**2<.94,context);
   }
  }
 }
});

test('real sheets retain asset sources and aspect ratios, including tall images and transparent manuscripts',()=>{
 for(const ratio of [.8,1,1.43,1.8])for(const size of [[955,1249],[100,500],[500,100]]) {
  const assets=candidates.map(a=>a.id==='asset-081'?{...a,width:size[0],height:size[1]}:a);
  const chosen=validatePaperSelection({...selection,papers:[{assetId:'asset-081',position:'top',width:20,rotation:0}]},assets);
  const out=make(chosen,{ratio},assets),real=sheets(out).find(p=>p.assetId==='asset-081'),front=sheets(out).find(p=>p.stackOrder===3);
  assert.equal(real.src,'/materials/asset-081-cut.png');assert.equal(real.stretch,false);
  near(real.h/real.w,size[1]/size[0]*ratio);assert.ok(real.h<=48);assert.ok(real.w<=20);
  assert.ok(real.stackOrder<front.stackOrder);assert.equal(front.assetId,undefined);assert.equal(front.stretch,true);
  assert.deepEqual(layoutIssues(out,ratio,12),[]);assertWritingInside(out,ratio);
 }
});

test('requested side and occupied groups are respected, and a full spread fails without mutation',()=>{
 assert.ok(make(selection,{entrySide:'right'}).every(p=>p.x>=50));
 assert.ok(make(selection,{instruction:'请放在右页'}).every(p=>p.x>=50));
 const occupied=[{kind:'photo',x:0,y:0,w:50,h:100}];
 assert.ok(make(selection,{occupiedElements:occupied}).every(p=>p.x>=50));
 const full=[...occupied,{kind:'photo',x:50,y:0,w:50,h:100}],before=structuredClone(full);
 assert.throws(()=>make(selection,{occupiedElements:full}),{code:'group_space'});assert.deepEqual(full,before);
 const first=make(),next=make(selection,{occupiedElements:first});
 assert.ok(next.every(p=>first.every(q=>!intersects(bounds(p),bounds(q),1))));assert.notEqual(first[0].groupId,next[0].groupId);
 const locked={id:'locked',kind:'photo',x:0,y:0,w:50,h:100,locked:true,groupId:'old-group'};
 assert.ok(make(selection,{elements:[...source,locked]}).every(p=>p.x>=50));
});

test('horizontal search finds open space beside narrow blockers on both pages',()=>{
 const occupied=[{kind:'asset',x:3,y:0,w:2,h:100},{kind:'asset',x:53,y:0,w:2,h:100}];
 const before=structuredClone(occupied),out=make(selection,{occupiedElements:occupied});
 assert.deepEqual(occupied,before);
 assert.ok(out.every(p=>occupied.every(o=>!intersects(bounds(p),bounds(o),2))));
 assert.deepEqual(layoutIssues(out),[]);
 const right=make(selection,{occupiedElements:occupied,entrySide:'right'});
 assert.ok(right.every(p=>p.x>=57),'side preference is retained while searching across the page');
});

test('an exact narrow opening is usable without relying on a two-percent grid',()=>{
 const chosen={...selection,stickers:[]},extra={elements:[{id:'body',kind:'text',role:'body',text:'看海。',x:64,y:45,w:15}]};
 const plain=make(chosen,extra),front=sheets(plain).at(-1),left=67.3;
 const occupied=[{kind:'photo',x:0,y:0,w:50,h:100},{kind:'asset',x:50,y:0,w:left-52,h:100},{kind:'asset',x:left+front.w+2,y:0,w:100-left-front.w-2,h:100}];
 const out=make(chosen,{...extra,occupiedElements:occupied});
 near(sheets(out).at(-1).x,left);
 assert.ok(out.every(p=>occupied.every(o=>!intersects(bounds(p),bounds(o),2))));
});

test('local compaction removes only new embellishments when a full design does not fit',()=>{
 const elements=[{id:'brief',kind:'text',role:'body',text:'今天非常开心',x:62,y:44,w:20,colorRuns:[{start:0,end:2,color:'#123456'}]}];
 const occupied=[{kind:'photo',x:0,y:0,w:50,h:100},{kind:'photo',x:50,y:0,w:50,h:40},{kind:'photo',x:50,y:54,w:50,h:46}];
 const chosen={...selection,papers:[generatedBack,{...generatedBack,position:'bottom'}],tapes:[{position:'top',width:8}]},before=structuredClone({elements,occupied,chosen});
 const out=make(chosen,{elements,occupiedElements:occupied}),text=out.find(p=>p.kind==='text');
 assert.equal(out.length,2,'only the complete writing and its opaque sheet are needed in the tight opening');
 assert.equal(text.text,elements[0].text);assert.equal(text.sourceId,elements[0].id);assert.equal(text.fontSize,16);assert.deepEqual(text.colorRuns,elements[0].colorRuns);
 assert.deepEqual({elements,occupied,chosen},before);assertWritingInside(out,1.43);
 assert.ok(out.every(p=>occupied.every(o=>!intersects(bounds(p),bounds(o),2))));
});

test('compaction also checks the final retained-group layout before accepting new decoration',()=>{
 const original={id:'old',kind:'asset',assetId:'old',groupId:'old-group',x:2,y:3,w:96,h:69,locked:false};
 const writing={id:'brief',kind:'text',role:'body',text:'今天非常开心',x:10,y:25,w:20,fontSize:16,locked:false};
 const source={days:[],ratio:1.43,elements:[original,writing]},before=structuredClone(source);
 const ctx=prepareDesignContext(source),content=paperGroupContent(ctx.input);
 const chosen={...selection,stickers:[{slot:'hero',assetId:ids[0],width:8},{slot:'accent',assetId:ids[1],width:8}]};
 assert.throws(()=>finishDesignContext(placePaperGroup(content,chosen,candidates,paperSources,ctx.input),ctx),{code:'design_space'});
 let checks=0;
 const out=placePaperGroup(content,chosen,candidates,paperSources,ctx.input,undefined,pieces=>{checks++;return finishDesignContext(pieces,ctx);});
 const merged=finishDesignContext(out,ctx);
 assert.ok(checks>1&&checks<=4,'retained groups participate in bounded local compaction');
 const old=merged.elements.find(p=>p.sourceId===original.id),text=merged.elements.find(p=>p.sourceId===writing.id);
 assert.deepEqual({...old,sourceId:undefined},{...original,sourceId:undefined});
 assert.equal(text.text,writing.text);assert.equal(text.fontSize,16);assert.equal(out.filter(p=>p.kind==='text').length,1);
 assert.deepEqual(source,before);
 const failure=Object.assign(Error('source mismatch'),{code:'design_source'});let rejectedChecks=0;
 assert.throws(()=>placePaperGroup(content,chosen,candidates,paperSources,ctx.input,undefined,()=>{rejectedChecks++;throw failure;}),error=>error===failure);
 assert.equal(rejectedChecks,1,'content-validation errors must not be hidden by decoration fallback');
});

test('oversized optional layers are repaired locally while readable writing and real paper proportions survive',()=>{
 const chosen={...selection,writing:{...selection.writing,shape:'oval',width:28},papers:[{assetId:'asset-035',position:'left',width:36,rotation:-12},{...generatedBack,position:'right',width:36,height:48,rotation:12}],stickers:Object.keys(paperGroupSlots).map((slot,i)=>({slot,assetId:ids[i],width:10}))};
 const elements=[{id:'body',kind:'text',role:'body',text:'沿着海边散步，在岸边等太阳慢慢落下，今天心情很好。',x:5,y:20,w:30}];
 const out=make(chosen,{elements}),text=out.find(p=>p.kind==='text');
 assert.equal(text.fontSize,16);assert.equal(text.text,elements[0].text);assertWritingInside(out,1.43);
 assert.deepEqual(layoutIssues(out),[]);
 assert.ok(out.every(p=>bounds(p).x>=2&&bounds(p).x+bounds(p).w<=48));
 const real=sheets(out).find(p=>p.assetId);
 if(real)near(real.h/real.w,1249/955*1.43);
});

test('a narrow oval is widened instead of shrinking or dropping writing below a large header',()=>{
 for(const [ratio,characters] of [[.8,90],[1,60],[1.8,30]]) {
  const elements=[{id:'body',kind:'text',role:'body',text:'海'.repeat(characters),x:61,y:50,w:30}];
  const chosen={...selection,writing:{...selection.writing,shape:'oval',width:6},stickers:[]};
  const out=make(chosen,{ratio,headerSpace:23,elements}),text=out.find(p=>p.kind==='text');
  assert.ok(text.w>6);assert.equal(text.fontSize,16);assert.equal(text.text,elements[0].text);
  assert.deepEqual(layoutIssues(out,ratio,23),[]);assertWritingInside(out,ratio);
 }
});

test('unsupported content retains the existing route and existing groups remain protected',()=>{
 for(const extra of [{elements:[{...source[1],text:'很长的日记。'.repeat(200)}]},{elements:[...source,{kind:'photo'}]},{elements:source.map(p=>({...p,locked:true,groupId:'old'}))},{instruction:'不要贴纸，极简'},{requirements:{paragraphCount:2}},{ratio:.7},{ratio:2}])assert.equal(paperGroupContent({...input,...extra}),null);
 assert.ok(paperGroupContent({...input,requirements:{framed:true}}),'retired text-frame request no longer blocks independent paper groups');
 const fresh=paperGroupContent({days:[{title:'今日小记',raw:'散步看海。',photos:[]}],elements:[]});
 assert.deepEqual(fresh.map(p=>[p.dayIndex,p.text]),[[0,'今日小记'],[0,'散步看海。']]);
 assert.equal(paperGroupContent({days:[{raw:'看海',photos:['/uploads/a.png']}],elements:[]}),null);
 assert.deepEqual(paperGroupContent({...input,elements:[...source,{...source[1],id:'old',groupId:'kept'}]}).map(p=>p.sourceId),source.map(p=>p.id));
});

test('selection rejects old template replies, invalid references, unsafe values and low contrast',()=>{
 assert.deepEqual(validatePaperSelection(selection,candidates),selection);
 const invalid=[
  null,[],{palette:selection.palette,stickers:selection.stickers},
  {...selection,writing:undefined},{...selection,papers:undefined},
  ...['constructor','__proto__','missing'].flatMap(name=>[
   {...selection,writing:{...selection.writing,shape:name}},
   {...selection,writing:{...selection.writing,pattern:name}},
   {...selection,papers:[{...generatedBack,position:name}]},
   {...selection,stickers:[{slot:name,assetId:ids[0],width:6}]},
  ]),
  ...[NaN,Infinity,-Infinity,'20',null,5,29].map(width=>({...selection,writing:{...selection.writing,width}})),
  {...selection,writing:{...selection.writing,align:'justify'}},
  {...selection,palette:{...selection.palette,ink:selection.palette.frontPaper}},
  {...selection,palette:{...selection.palette,frontPaper:'red'}},
  {...selection,papers:[null]},
  {...selection,papers:[{...generatedBack,rotation:NaN}]},
  {...selection,papers:[{...generatedBack,height:Infinity}]},
  {...selection,papers:[generatedBack,generatedBack,generatedBack]},
  {...selection,papers:[{assetId:'unknown',position:'top',width:20}]},
  {...selection,papers:[{assetId:ids[0],position:'top',width:20}]},
  {...selection,papers:[{assetId:'asset-035',position:'top',width:20},{assetId:'asset-035',position:'bottom',width:20}]},
  {...selection,papers:[{assetId:'asset-035',position:'top',width:20}],stickers:[{slot:'hero',assetId:'asset-035',width:6}]},
  {...selection,stickers:[null]},
  {...selection,stickers:undefined},
  {...selection,stickers:[{slot:'hero',assetId:'unknown',width:6}]},
  {...selection,stickers:[{slot:'hero',assetId:ids[0],width:NaN}]},
  {...selection,stickers:[selection.stickers[0],selection.stickers[0]]},
  {...selection,tapes:[null]},{...selection,tapes:[{position:'left',width:6}]},
  {...selection,tapes:[{position:'top',width:Infinity}]},
 ];
 for(const reply of invalid)assert.throws(()=>validatePaperSelection(reply,candidates),JSON.stringify(reply));
 assert.throws(()=>validatePaperSelection(selection,candidates.map(a=>({...a,category:'邮票'}))),/邮票/);
 // Pale pattern marks must still satisfy contrast, even when the base paper does.
 assert.throws(()=>validatePaperSelection({...selection,writing:{...selection.writing,pattern:'dots'},palette:{...selection.palette,frontPaper:'#FFFFFF',ink:'#767676'}},candidates),/对比/);
});

test('only unused palette fields may be omitted; required and explicitly invalid colors still fail',()=>{
 const minimal={frontPaper:selection.palette.frontPaper,ink:selection.palette.ink};
 for(const papers of [[],[generatedBack],[{assetId:'asset-035',position:'left',width:18,rotation:0}]]) {
  const output={...selection,palette:minimal,papers,stickers:[],tapes:[]},before=structuredClone(output);
  const chosen=validatePaperSelection(output,candidates);
  assert.deepEqual(output,before);
  assert.equal(chosen.palette.frontPaper,minimal.frontPaper);assert.equal(chosen.palette.ink,minimal.ink);
  assert.match(chosen.palette.backPaper,/^#[a-f\d]{6}$/i);assert.match(chosen.palette.tape,/^#[a-f\d]{6}$/i);
  assert.deepEqual(chosen.papers,output.papers);
 }
 const taped={...selection,palette:{...minimal,tape:'#ABCDEF'},tapes:[{position:'top',width:6}]};
 assert.equal(validatePaperSelection(taped,candidates).palette.tape,'#ABCDEF');
 assert.throws(()=>validatePaperSelection({...taped,palette:minimal},candidates),/tape/);
 for(const field of ['frontPaper','ink']) {
  const missing={...minimal};delete missing[field];
  assert.throws(()=>validatePaperSelection({...selection,palette:missing},candidates),/颜色/);
 }
 for(const field of ['frontPaper','ink','backPaper','tape'])for(const value of [null,'','#abc','red','#12345678',{},123456]) {
  assert.throws(()=>validatePaperSelection({...selection,palette:{...minimal,[field]:value},tapes:[]},candidates),/颜色|色值/);
 }
 assert.throws(()=>validatePaperSelection({...selection,palette:{frontPaper:'#FFFFFF',ink:'#FFFFFF'}},candidates),/对比/);
});

test('append and redesign preserve new paper geometry, latest writing, color runs and locked manual items',()=>{
 const elements=make({...selection,papers:[{assetId:'asset-035',position:'top',width:20,rotation:-2}]}),result={elements,headerReserved:true,theme:'herbarium',layout:'collage',days:[{title:'今日小记',text:'散步',assetIds:[]}]};
 const book=defaultBook(),day={id:'day',date:book.month+'-09',raw:'散步',text:'散步',title:'今日小记',photos:[]};
 const appended=appendDay(book,day,result,[],0,0,12);
 const geometry=pieces=>pieces.map(p=>[p.x,p.y,p.w,p.h,p.fontSize,p.groupId,p.stackOrder,p.src,p.assetId]);
 assert.deepEqual(geometry(appended.spreads[0].elements),geometry(elements));
 const locked={id:'manual',kind:'photo',src:'/uploads/photo.png',x:60,y:10,w:20,locked:true,groupId:'manual-group'};
 const spread={id:'spread',theme:'herbarium',days:[],elements:[...source,locked]},before=structuredClone(spread);
 const applied=regenerateSpread(spread,{...result,days:[]},[]);
 assert.deepEqual(spread,before);assert.deepEqual(applied.elements.find(p=>p.id==='manual'),locked);
 assert.deepEqual(applied.elements.find(p=>p.id==='body').colorRuns,source[1].colorRuns);
 assert.equal(applied.elements.find(p=>p.id==='body').text,source[1].text);
 assert.deepEqual(geometry(applied.elements.filter(p=>p.id!=='manual')),geometry(elements));
});

const root=new URL('../',import.meta.url).pathname;
async function readLibrary(){return JSON.parse(await readFile(join(root,'public/materials/manifest.json')));}
function modelSelection(payload,extra={}) {
 const asset=payload.candidates.find(a=>!a.paper&&!/邮票|stamp/i.test(a.category+' '+a.name));
 assert.ok(asset);
 return {...selection,stickers:[{slot:'hero',assetIndex:asset.index,width:5}],...extra};
}

test('visual shortlist reserves actual papers and resolves numbered real paper and decoration choices',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'paper-group-unit-'));
 try {
  const library=await readLibrary(),diagnostic={};let calls=0;
  const result=await generatePaperGroup(input,library,{root,data:dir,vision:true,diagnostic,requestAI:async messages=>{
   calls++;assert.equal(messages[1].content[1].type,'image_url');assert.ok(messages[0].content.includes(referenceLayoutGuide));
   const payload=JSON.parse(messages[1].content[0].text),paper=payload.candidates.find(a=>a.paper&&a.id==='asset-081');
   assert.ok(paper,'transparent manuscript is available as a real back sheet');
   const paperCount=payload.candidates.filter(a=>a.paper).length;
   assert.ok(payload.candidates.length<=24);assert.ok(paperCount>0&&paperCount<=8);
   assert.ok(payload.candidates.slice(0,paperCount).every(a=>a.paper),'paper candidates retain their reserved shortlist positions');
   if(calls===1)return {palette:selection.palette,stickers:selection.stickers};
   assert.match(messages.at(-1).content,/writing.*papers/);
   return modelSelection(payload,{papers:[{assetIndex:paper.index,position:'top',width:20,rotation:-2}]});
  }});
  assert.equal(calls,2);assert.equal(diagnostic.imageCount,1);assert.equal(diagnostic.paperCount,2);assert.equal(diagnostic.realPaperCount,1);
  assert.equal(result.headerReserved,true);assert.deepEqual(layoutIssues(result.elements),[]);
  for(const paper of sheets(result.elements)) {
   const file=join(paper.src.startsWith('/uploads/')?dir:join(root,'public'),paper.src);
   assert.ok((await readFile(file)).length>100);
   if(paper.assetId){assert.equal(paper.assetId,'asset-081');assert.equal(paper.src,'/materials/asset-081-cut.png');}
   else assert.match(paper.src,/^\/uploads\/[0-9a-f]{64}\.png$/);
  }
 } finally {await rm(dir,{recursive:true,force:true});}
});

test('writing shapes and patterns reach actual PNGs and leave every writing corner opaque',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'paper-shapes-unit-'));
 try {
  const library=(await readLibrary()).filter(a=>a.id===ids[0]),sources=new Set();
  for(const shape of Object.keys(paperShapes))for(const pattern of ['plain','grid','dots','ruled']) {
   const diagnostic={};
   const out=await generatePaperGroup({...input,elements:[source[1]]},library,{root,data:dir,vision:false,diagnostic,requestAI:async messages=>{
    const payload=JSON.parse(messages[1].content);assert.ok(payload.shapes[shape]);assert.ok(payload.patterns[pattern]);
    return modelSelection(payload,{writing:{...selection.writing,shape,pattern,width:18}});
   }});
   assert.equal(diagnostic.writingShape,shape);assert.equal(diagnostic.writingPattern,pattern);assert.equal(diagnostic.paperCount,1);
   assert.deepEqual(layoutIssues(out.elements),[]);
   const paper=sheets(out.elements)[0];sources.add(paper.src);
   const {data,info}=await sharp(await readFile(join(dir,paper.src))).ensureAlpha().raw().toBuffer({resolveWithObject:true});
   const alpha=(x,y)=>data[(Math.min(info.height-1,Math.max(0,Math.round(y)))*info.width+Math.min(info.width-1,Math.max(0,Math.round(x))))*info.channels+3];
   for(const text of out.elements.filter(p=>p.kind==='text'))for(const x of [text.x,text.x+text.w])for(const y of [text.y,text.y+text.h]) {
    assert.equal(alpha((x-paper.x)/paper.w*info.width,(y-paper.y)/paper.h*info.height),255,`${shape}/${pattern}: writing corner is opaque`);
   }
   assert.equal(alpha(0,0),0,'paper keeps transparent cut edges');
  }
  assert.equal(sources.size,16,'distinct shape and pattern choices must change actual generated files');
 } finally {await rm(dir,{recursive:true,force:true});}
});

test('paper-only designs work without a material library and recover locally with accurate output counts',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'paper-empty-library-'));
 try {
  const occupied=[{kind:'photo',x:0,y:0,w:50,h:100},{kind:'photo',x:50,y:0,w:50,h:40},{kind:'photo',x:50,y:54,w:50,h:46}];
  const page={...input,elements:[{id:'brief',kind:'text',role:'body',text:'今天非常开心',x:62,y:44,w:20}],occupiedElements:occupied};
  const diagnostic={};let calls=0;
  const requestAI=async messages=>{
   calls++;assert.equal(typeof messages[1].content,'string','an empty library must not make an invalid image board');
   const payload=JSON.parse(messages[1].content);assert.deepEqual(payload.candidates,[]);
   return {...selection,palette:{frontPaper:selection.palette.frontPaper,ink:selection.palette.ink},papers:[generatedBack],stickers:[]};
  };
  const result=await generatePaperGroup(page,[],{root,data:dir,vision:true,diagnostic,requestAI});
  assert.equal(calls,1,'space recovery must not consume an extra model call');
  assert.equal(diagnostic.imageCount,0);assert.equal(diagnostic.paperCount,1);assert.equal(diagnostic.realPaperCount,0);assert.equal(diagnostic.stickerCount,0);assert.equal(diagnostic.reducedDecoration,true);
  assert.equal(result.elements.length,2);assert.equal(result.elements.find(p=>p.kind==='text').text,page.elements[0].text);
  assert.ok((await readFile(join(dir,sheets(result.elements)[0].src))).length>100);
  calls=0;
  await assert.rejects(()=>generatePaperGroup({...page,occupiedElements:[{kind:'photo',x:0,y:0,w:100,h:100}]},[],{root,data:dir,vision:true,requestAI}),{code:'group_space'});
  assert.equal(calls,1,'a truly full page must fail after bounded local recovery');
 } finally {await rm(dir,{recursive:true,force:true});}
});

test('invalid model indices are rejected twice instead of falling back to an old or arbitrary paper',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'paper-indices-unit-'));
 try {
  const library=(await readLibrary()).filter(a=>[ids[0],'asset-035'].includes(a.id));
  for(const assetIndex of [0,-1,999,1.5,'1',null,NaN])for(const target of ['papers','stickers']) {
   let calls=0;
   await assert.rejects(()=>generatePaperGroup(input,library,{root,data:dir,vision:false,requestAI:async messages=>{
    calls++;const payload=JSON.parse(messages[1].content),valid=modelSelection(payload);
    return target==='papers'?{...valid,papers:[{assetIndex,position:'top',width:20}]}:{...valid,stickers:[{slot:'hero',assetIndex,width:5}]};
   }}));
   assert.equal(calls,2,`${target}: ${assetIndex}`);
  }
 } finally {await rm(dir,{recursive:true,force:true});}
});
