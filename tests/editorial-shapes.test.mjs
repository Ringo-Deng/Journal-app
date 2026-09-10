import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {makeEditorialShape,isEditorialShape,editorialShapeInstructions} from '../local/editorial-shapes.mjs';
import {validatePlan} from '../local/design-plan.mjs';
import {finishCollage} from '../local/collage-layout.mjs';
import {layoutIssues} from '../lib/layout-safety.mjs';
import {regenerateSpread,appendDay,defaultBook,reserveHeaderSpace} from '../lib/journal.ts';

const motifs=['editorial-rect','editorial-circle','editorial-semicircle','editorial-line'];
const input={days:[],elements:[],doodleMode:'handdrawn',ratio:1.43};
const body={id:'writing',kind:'text',role:'body',text:'今天看完了一本书。',x:5,y:10,w:26,fontSize:18,rotation:0,locked:false};

test('editorial shapes render controlled geometry without using AI paths or hand doodle limits',()=>{
  const requested=motifs.map((motif,i)=>({kind:'doodle',motif,x:56,y:5+i*18,w:10,h:10,color:'#7e8989',path:'<svg onload=alert(1)>',drawing:[{path:'malicious',fill:'url(http://example.com)'}],frame:'collage-paper',background:'#ff0000'}));
  const shapes=validatePlan(requested,input,[]);
  for(const p of shapes){
    assert.ok(isEditorialShape(p));
    assert.equal(p.path,undefined);
    assert.equal(p.stretch,true);
    assert.equal(p.frame,'plain');
    assert.equal(p.background,undefined);
    assert.equal(p.drawing.length,1);
    assert.equal(p.drawing[0].fill,'#7e8989');
    assert.equal(p.drawing[0].stroke,'none');
    assert.match(p.drawing[0].path,/^M[\d\s.,MmLlHhVvCcSsQqTtAaZz+-]+$/);
  }
  const hand=Array.from({length:6},()=>({kind:'doodle',motif:'heart'}));
  assert.equal(validatePlan([...hand,...requested],input,[]).length,10);
  assert.throws(()=>validatePlan([...hand,{kind:'doodle',motif:'heart'},...requested],input,[]),/最多6/);
  assert.throws(()=>validatePlan([{kind:'doodle',motif:'editorial-svg',path:'M0 0 H100'}],input,[]),/motif|素材库/);
  assert.match(editorialShapeInstructions,/正文和照片之外/);
});

test('only finite dimensions and six digit colors enter a geometric drawing',()=>{
  for(const color of ['red','#fff','#12345678','url(http://example.com)',null,{},['#123456']]) {
    assert.throws(()=>makeEditorialShape({motif:'editorial-rect',color}),/颜色/);
  }
  for(const field of ['w','h']) for(const value of [NaN,Infinity,-Infinity,'20',null]) {
    assert.throws(()=>makeEditorialShape({motif:'editorial-rect',[field]:value}),/尺寸/);
  }
  const large=makeEditorialShape({motif:'editorial-rect',w:1000,h:1000});
  assert.deepEqual([large.w,large.h],[44,50]);
  const tiny=makeEditorialShape({motif:'editorial-rect',w:-100,h:-100});
  assert.deepEqual([tiny.w,tiny.h],[3,3]);
  for(const motif of [undefined,'toString','__proto__','editorial-path',['editorial-circle']]) assert.throws(()=>makeEditorialShape({motif}),/只能选择/);
  assert.equal(isEditorialShape({kind:'doodle',doodleMotif:['editorial-circle']}),false);
});

test('circle and semicircle have real circular proportions in the existing stretched drawing renderer',async()=>{
  for(const ratio of [.6,.8,1,1.43,1.8,2.5]) for(const motif of ['editorial-circle','editorial-semicircle']) {
    const [p]=validatePlan([{kind:'doodle',motif,w:32,h:3,x:95,y:90}],{...input,ratio},[]);
    const width=Math.round(p.w*10),height=Math.round(p.h/ratio*10);
    assert.equal(height,motif==='editorial-circle'?width:Math.round(width/2));
    assert.ok(p.h<=50);
    assert.ok(p.x+p.w<=98);
    assert.ok(p.y+p.h<=94);
    const layer=p.drawing[0];
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="${layer.path}" fill="${layer.fill}" stroke="none"/></svg>`;
    const {data,info}=await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const alpha=(x,y)=>data[(y*info.width+x)*4+3];
    assert.equal(alpha(0,0),0);
    assert.equal(alpha(Math.floor(width/2),Math.floor(height/2)),255);
    assert.equal(alpha(Math.floor(width/2),height-1),255);
    if(motif==='editorial-circle') assert.equal(alpha(0,height-1),0);
    else assert.ok(alpha(3,height-2)>0);
  }
});

test('separator remains a thin horizontal shape even when the model asks for a giant height',()=>{
  const [line]=validatePlan([{kind:'doodle',motif:'editorial-line',w:30,h:50}],input,[]);
  assert.ok(line.h/input.ratio<.2);
  assert.equal(line.w,30);
  assert.equal(line.rotation,0);
});

test('new entries keep circles circular when leaving room for the existing page header',()=>{
  for(const ratio of [.8,1.43,1.8])for(const motif of ['editorial-circle','editorial-semicircle']) {
    const [shape]=validatePlan([{kind:'doodle',motif,x:57,y:20,w:24}],{...input,ratio},[]);
    const text={...body,dayIndex:0};
    const book=defaultBook();
    const day={id:'day',date:book.month+'-01',raw:body.text,text:body.text,title:'小记',photos:[]};
    const result={theme:'archive',layout:'airy',days:[{title:day.title,text:day.text,assetIds:[]}],elements:[shape,text]};
    const before=structuredClone(result);
    for(const header of [0,12,20]) {
      const applied=appendDay(book,day,result,[],0,0,header);
      const saved=JSON.parse(JSON.stringify(applied));
      const circle=saved.spreads[0].elements.find(isEditorialShape);
      assert.ok(Math.abs(circle.h/circle.w-shape.h/shape.w)<1e-9,`${motif}/${ratio}/${header}`);
      assert.ok(circle.y>=header);
      assert.equal(saved.spreads[0].elements.find(p=>p.kind==='text').text,body.text);
    }
    assert.deepEqual(result,before);
    const locked={...shape,sourceId:'locked'};
    assert.deepEqual(reserveHeaderSpace([locked],20,['locked']),[locked]);
  }
});

test('geometric main visuals cannot bypass writing, photo, gutter or locked-content clearance',()=>{
  const locked={id:'locked-photo',kind:'photo',src:'/uploads/photo.png',x:57,y:30,w:25,h:20,rotation:0,locked:true};
  const request={...input,elements:[body,locked]};
  const planned=validatePlan([
    {kind:'text',sourceId:body.id,x:5,y:10,w:26},
    {kind:'doodle',motif:'editorial-rect',x:5,y:10,w:20,h:20,frame:'collage-paper'},
    {kind:'doodle',motif:'editorial-circle',x:57,y:32,w:16},
    {kind:'doodle',motif:'editorial-rect',x:6,y:50,w:28,h:20},
  ],request,[]);
  const finished=finishCollage(planned,request,[],{composition:{preset:'free'}});
  assert.equal(finished.filter(isEditorialShape).length,1);
  assert.equal(finished.find(isEditorialShape).y,50);
  assert.deepEqual(layoutIssues([...finished,locked],request.ratio),[]);
  assert.throws(()=>validatePlan([{kind:'doodle',motif:'editorial-circle',x:6,y:50,w:28}],request,[]),/遗漏/);
});

test('saved geometric layers keep their source identity, color and manual attributes during redesign',()=>{
  const [p]=validatePlan([{kind:'doodle',motif:'editorial-circle',x:56,y:42,w:12,color:'#889494'}],input,[]);
  const source={...p,id:'geometric',rotation:10,flipX:true,opacity:.7,locked:false};
  const request={...input,elements:[body,source]};
  const before=structuredClone(request);
  const parsed=validatePlan([{kind:'text',sourceId:body.id},{kind:'doodle',sourceId:source.id}],request,[]);
  const retained=parsed.find(isEditorialShape);
  assert.equal(retained.sourceId,source.id);
  for(const field of ['x','y','w','h','rotation','color','flipX','opacity']) assert.equal(retained[field],source[field]);
  assert.deepEqual(retained.drawing,source.drawing);
  const spread={id:'spread',theme:'archive',days:[],elements:[body,source]};
  const saved=JSON.parse(JSON.stringify(regenerateSpread(spread,{theme:'archive',days:[],elements:parsed},[])));
  assert.equal(saved.elements.find(isEditorialShape).id,source.id);
  assert.deepEqual(saved.elements.find(isEditorialShape).drawing,source.drawing);
  assert.equal(saved.elements.find(p=>p.id===body.id).text,body.text);
  assert.deepEqual(request,before);
  const locked={...source,locked:true};
  const lockedResult=validatePlan([{kind:'text',sourceId:body.id},{kind:'doodle',sourceId:locked.id,motif:'editorial-rect',x:3,y:3,color:'#FF0000'}],{...request,elements:[body,locked]},[]);
  const lockedSaved=regenerateSpread({...spread,elements:[body,locked]},{theme:'archive',days:[],elements:lockedResult},[]);
  assert.deepEqual(lockedSaved.elements.find(p=>p.id===locked.id),locked);
});
