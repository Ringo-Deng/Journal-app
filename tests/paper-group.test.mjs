import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {paperGroupContent,validatePaperSelection,placePaperGroup} from '../local/paper-group-layout.mjs';
import {generatePaperGroup} from '../local/paper-group.mjs';
import {bounds,intersects,layoutIssues} from '../lib/layout-safety.mjs';
import {appendDay,regenerateSpread,defaultBook} from '../lib/journal.ts';
const source=[{id:'title',kind:'text',role:'title',text:'海边的一天',x:5,y:10,w:30},{id:'body',kind:'text',role:'body',text:'下午去海边散步，沿着沙滩走了一圈，在岸边坐到太阳落下。',x:5,y:20,w:30,colorRuns:[{start:0,end:2,color:'#123456'}]}];
const input={days:[],elements:source,ratio:1.43,headerSpace:12};
const ids=['asset-001','asset-085','asset-057','asset-083','asset-075','asset-026'];
const categories=['花卉','植物','蝴蝶','纸张','邮票','植物'];
const candidates=ids.map((id,i)=>({id,name:id,src:`/materials/${id}-cut.png`,width:100,height:160,category:categories[i]}));
const selection={palette:{backPaper:'#D8E0D0',frontPaper:'#F5F0E1',ink:'#6B5B4A',tape:'#C8D5B9'},stickers:['hero','leaf','butterfly','script','accent','sprig'].map((slot,i)=>({slot,assetId:ids[i]}))};
const papers=['/uploads/a.png','/uploads/b.png'];
const make=(extra={})=>placePaperGroup(paperGroupContent({...input,...extra}),selection,candidates,papers,{...input,...extra});

test('short writing keeps source identity, becomes one group with two overlapping papers and varied edge stickers',()=>{
 const before=structuredClone(input),result=make();
 assert.deepEqual(input,before);
 assert.equal(new Set(result.map(p=>p.groupId)).size,1);
 assert.deepEqual(result.filter(p=>p.kind==='text').map(p=>[p.sourceId,p.text]),source.map(p=>[p.id,p.text]));
 const paper=result.filter(p=>p.frame==='collage-paper'),stickers=result.filter(p=>p.kind==='asset'&&p.frame!=='collage-paper');
 assert.equal(paper.length,2);assert.ok(intersects(bounds(paper[0]),bounds(paper[1])));assert.equal(stickers.length,8);
 assert.ok(stickers.every(s=>paper.some(p=>intersects(bounds(s),bounds(p)))));
 assert.deepEqual(layoutIssues(result),[]);
 assert.ok(result.every(p=>bounds(p).y>=14));
});

test('placement prefers requested side, avoids occupied content, and fails without modifying a full spread',()=>{
 assert.ok(make({entrySide:'right'}).every(p=>p.x>=50));
 const occupied=[{kind:'photo',x:0,y:0,w:50,h:100}];
 assert.ok(make({occupiedElements:occupied}).every(p=>p.x>=50));
 const full=[...occupied,{kind:'photo',x:50,y:0,w:50,h:100}];const before=structuredClone(full);
 assert.throws(()=>make({occupiedElements:full}),/空白页/);assert.deepEqual(full,before);
 const first=make();const next=make({occupiedElements:first});
 assert.ok(next.every(p=>first.every(q=>!intersects(bounds(p),bounds(q),1))));
 assert.notEqual(first[0].groupId,next[0].groupId);
});

test('long text, photos, locked-only content, explicit minimal style and per-paragraph frames retain existing layout path',()=>{
 for(const extra of [{elements:[{...source[1],text:'很长的日记。'.repeat(200)}]},{elements:[...source,{kind:'photo'}]},{elements:source.map(p=>({...p,locked:true,groupId:'old'}))},{instruction:'不要贴纸，极简'},{requirements:{framed:true}}])assert.equal(paperGroupContent({...input,...extra}),null);
 assert.ok(paperGroupContent({days:[{title:'今日小记',raw:'散步看海。',photos:[]}],elements:[]}));
 assert.equal(paperGroupContent({days:[{raw:'看海',photos:['/uploads/a.png']}],elements:[]}),null);
});

test('rejects invalid references, repeated slots, unreadable colors, excessive stamps and single-style selections',()=>{
 assert.deepEqual(validatePaperSelection(selection,candidates),selection);
 assert.throws(()=>validatePaperSelection({...selection,palette:{...selection.palette,ink:selection.palette.frontPaper}},candidates),/对比/);
 assert.throws(()=>validatePaperSelection({...selection,stickers:selection.stickers.map(p=>({...p,assetId:'unknown'}))},candidates));
 assert.throws(()=>validatePaperSelection({...selection,stickers:[...selection.stickers.slice(0,4),selection.stickers[0]]},candidates));
 assert.throws(()=>validatePaperSelection(selection,candidates.map(a=>({...a,category:'邮票'}))),/邮票/);
});

test('new entry and redesign preserve group geometry, latest text, color runs and locked manual items',()=>{
 const elements=make();const result={elements,headerReserved:true,theme:'herbarium',layout:'collage',days:[{title:'今日小记',text:'散步',assetIds:[]}]};
 const book=defaultBook(),day={id:'day',date:book.month+'-09',raw:'散步',text:'散步',title:'今日小记',photos:[]};
 const appended=appendDay(book,day,result,[],0,0,12);
 assert.deepEqual(appended.spreads[0].elements.map(p=>[p.x,p.y,p.h,p.fontSize,p.groupId]),elements.map(p=>[p.x,p.y,p.h,p.fontSize,p.groupId]));
 const locked={id:'manual',kind:'photo',src:'/uploads/photo.png',x:60,y:10,w:20,locked:true,groupId:'manual-group'};
 const spread={id:'spread',theme:'herbarium',days:[],elements:[...source,locked]};
 const applied=regenerateSpread(spread,{...result,days:[]},[]);
 assert.deepEqual(applied.elements.find(p=>p.id==='manual'),locked);
 assert.deepEqual(applied.elements.find(p=>p.id==='body').colorRuns,source[1].colorRuns);
 assert.equal(applied.elements.find(p=>p.id==='body').text,source[1].text);
});

test('real asset thumbnails and generated paper files survive composition; invalid model output retries',async()=>{
 const root=new URL('../',import.meta.url).pathname,dir=await mkdtemp(join(tmpdir(),'paper-group-unit-'));
 try{
  const all=JSON.parse(await readFile(join(root,'public/materials/manifest.json')));let calls=0;
  const diagnostic={};
  const result=await generatePaperGroup(input,all,{root,data:dir,vision:true,diagnostic,requestAI:async messages=>{
   calls++;assert.equal(messages[1].content[1].type,'image_url');
   const payload=JSON.parse(messages[1].content[0].text);
   assert.ok(payload.candidates.length>=4);
   // This fixture uses candidates actually present in the visual shortlist.
   const used=new Set();
   const selected=selection.stickers.map(s=>{const a=payload.candidates.find(a=>a.id===s.assetId&&!used.has(a.id))||payload.candidates.find(a=>a.category===categories[ids.indexOf(s.assetId)]&&!used.has(a.id));used.add(a.id);return {...s,assetId:a.id};});
   if(calls===1)return {palette:{}};
   return {...selection,stickers:selected.map(s=>({slot:s.slot,assetIndex:payload.candidates.find(a=>a.id===s.assetId).index}))};
  }});
  assert.equal(calls,2);assert.equal(diagnostic.imageCount,1);assert.equal(result.headerReserved,true);
  for(const paper of result.elements.filter(p=>p.frame==='collage-paper'))assert.ok((await readFile(join(dir,paper.src))).length>100);
  assert.deepEqual(layoutIssues(result.elements),[]);
 }finally{await rm(dir,{recursive:true,force:true});}
});
