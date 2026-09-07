import test from 'node:test';
import assert from 'node:assert/strict';
import {unionBoxes,transformCluster,cloneCluster,creamTravel,instantiateTemplate} from '../lib/collage.ts';
import {tidyLayout,layoutIssues,estimatedHeight} from '../lib/layout-safety.mjs';
import {validatePlan} from '../local/design-plan.mjs';
import {notebookUploads,remapNotebookUploads} from '../lib/journal-backup.ts';
const p=(id,extra={})=>({id,kind:'text',text:'一段旅行记录',x:7,y:12,w:22,h:8,rotation:0,locked:false,...extra});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('cluster movement, scaling and rotation preserve attachment geometry on non-square paper',()=>{
 const members=[p('photo',{kind:'photo',groupId:'g'}),p('caption',{x:8,y:23,groupId:'g',attachedTo:'photo',fontSize:16})];
 const cw=1000,ch=800,boxes=members.map(p=>({x:p.x*cw/100,y:p.y*ch/100,w:p.w*cw/100,h:p.h*ch/100,rotation:p.rotation}));
 const before=unionBoxes(boxes),after={...before,x:before.x+100,y:before.y+50,w:before.w*1.5,h:before.h*1.5,rotation:35};
 const next=transformCluster(members,boxes,before,after,cw,ch);
 const distance=ps=>Math.hypot((ps[0].x+ps[0].w/2-ps[1].x-ps[1].w/2)*cw/100,(ps[0].y+ps[0].h/2-ps[1].y-ps[1].h/2)*ch/100);
 near(distance(next),distance(members)*1.5);near(next[1].fontSize,24);assert.equal(next[1].attachedTo,'photo');assert.equal(next[0].rotation,35);
 assert.equal(members[1].fontSize,16);
});
test('copying a group remaps identities and internal links without binding to the original',()=>{
 let n=0;const ps=[p('a',{groupId:'old'}),p('b',{groupId:'old',attachedTo:'a'})];
 const copy=cloneCluster(ps,()=>`new-${++n}`);
 assert.notEqual(copy[0].groupId,'old');assert.equal(copy[1].groupId,copy[0].groupId);assert.equal(copy[1].attachedTo,copy[0].id);
 assert.equal(cloneCluster([ps[1]],()=>`new-${++n}`)[0].attachedTo,undefined);
});
test('templates retain physical proportions across notebook ratios',()=>{
 let n=0;const t={id:'t',name:'组合',ratio:1.4,elements:[p('a',{kind:'photo',h:20,y:0}),p('b',{y:25,h:6,attachedTo:'a'})]};
 const copy=instantiateTemplate(t,()=>`c${++n}`,1);
 near(copy[0].h,20/1.4);near(copy[1].y,8+25/1.4);assert.equal(copy[1].attachedTo,copy[0].id);
});
test('travel styling changes neither text nor locked pieces and reaches both page overrides',()=>{
 const fixed=p('fixed',{locked:true,fontFamily:'serif'}),s={id:'s',days:[],elements:[fixed,p('title',{role:'title'})],pages:{left:{paperColor:'#fff'},right:{paperStyle:'dots'}}};
 const out=creamTravel(s);assert.deepEqual(out.elements[0],fixed);assert.equal(out.elements[1].text,s.elements[1].text);assert.equal(out.elements[1].fontFamily,'brush');assert.equal(out.pages.right.paperColor,out.paperColor);
});
test('layout checking catches rotated edges, long writing and decorations covering text',()=>{
 assert.ok(layoutIssues([p('a',{rotation:45,x:0})]).some(i=>i.type==='edge'));
 assert.ok(layoutIssues([p('a',{x:45,w:15})]).some(i=>i.type==='spine'));
 assert.ok(estimatedHeight(p('a',{text:'很长的记录。'.repeat(100)}))>100);
 assert.ok(layoutIssues([p('a'),p('b',{kind:'photo'})]).some(i=>i.type==='overlap'));
});
test('tidying preserves rigid groups and locked coordinates, resolves available collisions',()=>{
 const input=[p('locked',{locked:true}),p('a',{groupId:'g',kind:'photo'}),p('b',{groupId:'g',x:8,y:27})];
 const before=structuredClone(input),out=tidyLayout(input);
 assert.deepEqual(out.elements[0],input[0]);assert.deepEqual(input,before);
 near(out.elements[1].x-out.elements[2].x,input[1].x-input[2].x);near(out.elements[1].y-out.elements[2].y,input[1].y-input[2].y);
 assert.equal(out.issues.length,0);
});
test('overfull paper reports unresolved issues instead of deleting text or reducing fonts',()=>{
 const input=[p('long',{text:'完整保留。'.repeat(150),fontSize:22})];const out=tidyLayout(input);assert.ok(out.issues.length);assert.equal(out.elements[0].text,input[0].text);assert.equal(out.elements[0].fontSize,22);
});
test('AI validation retains photo crop, mounting and typography and rejects unsafe style choices',()=>{
 const photo=p('photo',{kind:'photo',src:'/uploads/photo.png',photoOriginal:'/uploads/original.png',crop:23,cropY:78,cropZoom:1.8,frame:'stamp',photoBorder:.9});
 const text=p('text',{fontFamily:'brush',lineHeight:1.3,letterSpacing:.05});
 const result=validatePlan([{kind:'photo',sourceId:'photo'},{kind:'text',sourceId:'text'}],{days:[],elements:[photo,text]},[]);
 assert.equal(result[0].cropY,78);assert.equal(result[0].frame,'stamp');assert.equal(result[0].photoOriginal,photo.photoOriginal);assert.equal(result[1].fontFamily,'brush');assert.equal(result[1].lineHeight,1.3);
 const clipped=validatePlan([{kind:'photo',sourceId:'photo',frame:'<bad>',cropZoom:50}],{days:[],elements:[photo]},[])[0];assert.equal(clipped.frame,'stamp');assert.equal(clipped.cropZoom,4);
});
test('backup includes photos saved only in reusable combinations and remaps them on import',()=>{
 const b={id:'b',spreads:[],collageTemplates:[{id:'t',elements:[p('a',{src:'/uploads/a.png',photoOriginal:'/uploads/b.png'})]}]};
 assert.deepEqual(notebookUploads([b]).sort(),['/uploads/a.png','/uploads/b.png']);
 const next=remapNotebookUploads(b,{'/uploads/a.png':'/uploads/new.png'});assert.equal(next.collageTemplates[0].elements[0].src,'/uploads/new.png');assert.equal(b.collageTemplates[0].elements[0].src,'/uploads/a.png');
});
