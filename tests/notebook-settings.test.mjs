import test from 'node:test';
import assert from 'node:assert/strict';
import {newBook,applyHeader,applyPaper,applyPaperBg,defaultHeader,headerOf,renderHeader,addBlankSpread,paperBgOf} from '../lib/journal.ts';
import {notebookUploads,remapNotebookUploads} from '../lib/journal-backup.ts';

test('whole-book settings reach existing and new pages without moving content or changing the flyleaf',()=>{
 const book=newBook('2026-09');
 book.spreads[0].elements=[{id:'manual',kind:'text',text:'手写内容',x:8,y:12,w:20,rotation:3,locked:true}];
 book.spreads[0].date='2025-03-04';
 book.spreads[0].header={...defaultHeader(),text:'旧的单页页眉'};
 const before=structuredClone(book);
 const custom={...defaultHeader(),text:'旅行\n{日期} {星期} · {页码}',align:'left',fontSize:18,color:undefined,customFormat:undefined};
 let updated=applyHeader(applyPaperBg(applyPaper(book,'lines','#2b2b28'),{src:'/uploads/bg.png',x:-5,y:2,scale:120}),custom);
 updated=addBlankSpread(updated);
 assert.deepEqual(updated.spreads[0].elements,before.spreads[0].elements);
 assert.equal(updated.spreads[0].date,'2025-03-04');
 assert.deepEqual(updated.flyleaf,before.flyleaf);
 assert.deepEqual(headerOf(updated,updated.spreads[0]),custom);
 assert.deepEqual(headerOf(updated,updated.spreads[1]),custom);
 assert.equal(paperBgOf(updated,updated.spreads[1]).src,'/uploads/bg.png');
 assert.deepEqual(book,before);
 const single=applyHeader(updated,{...custom,text:'仅当前页'},updated.spreads[0].id);
 assert.equal(headerOf(single,single.spreads[0]).text,'仅当前页');
 assert.equal(headerOf(single,single.spreads[1]).text,custom.text);
 assert.deepEqual(single.header,custom);
});

test('fixed record dates and both legacy and Chinese header tokens render without system-date substitution',()=>{
 const header={...defaultHeader(),text:'{日期} {星期} 第{页码}页 / {date}',dateFormat:'custom',customFormat:'yyyy年M月d日'};
 assert.equal(renderHeader(header,{date:'2025-03-04',page:3}),'2025年3月4日 周二 第3页 / 2025年3月4日');
 assert.equal(renderHeader({...header,text:'{日期}'},{}),'');
});

test('backup round trip retains flyleaf photos, backgrounds, templates and original images',()=>{
 const book=newBook('2026-09');
 book.coverAsset='/uploads/cover.png';
 book.paperBg={src:'/uploads/background.png',x:2,y:3,scale:120};
 book.paperTemplates=[{id:'t',name:'内页',src:'/uploads/template.png',x:0,y:0,scale:100}];
 book.flyleaf.elements=[{id:'p',kind:'photo',src:'/uploads/leaf.png',photoOriginal:'/uploads/original.jpg',x:55,y:12,w:30,rotation:0}];
 book.spreads[0].paperBg={src:'/uploads/page.png',x:0,y:0,scale:100};
 const before=structuredClone(book);
 const paths=notebookUploads([book]);
 assert.equal(paths.length,6);
 const mapping=Object.fromEntries(paths.map((p,i)=>[p,`/uploads/restored-${i}.png`]));
 const restored=remapNotebookUploads(book,mapping);
 assert.deepEqual(new Set(notebookUploads([restored])),new Set(Object.values(mapping)));
 assert.deepEqual(restored.flyleaf.elements[0],{...book.flyleaf.elements[0],src:mapping['/uploads/leaf.png'],photoOriginal:mapping['/uploads/original.jpg']});
 assert.deepEqual(book,before);
});

test('left and right page overrides stay independent and whole-book changes clear only the matching overrides',async()=>{
 const {patchPage,pageSpread,paperSettings}=await import('../lib/journal.ts');
 let book=newBook('2026-09');
 const id=book.spreads[0].id;
 book=patchPage(book,id,'right',{paperColor:'#2b2b28',paperStyle:'dots',header:{...defaultHeader(),text:'右页'},date:'2025-06-03',paperBg:{src:'/uploads/right.png',x:10,y:5,scale:110}});
 assert.equal(paperSettings(book,pageSpread(book.spreads[0],'left')).color,'#ffffff');
 assert.equal(paperSettings(book,pageSpread(book.spreads[0],'right')).color,'#2b2b28');
 assert.equal(headerOf(book,pageSpread(book.spreads[0],'right')).text,'右页');
 assert.equal(notebookUploads([book])[0],'/uploads/right.png');
 const restored=remapNotebookUploads(book,{'/uploads/right.png':'/uploads/new.png'});
 assert.equal(restored.spreads[0].pages.right.paperBg.src,'/uploads/new.png');
 const updated=applyPaper(book,'lines','#f7f1e3');
 assert.equal(paperSettings(updated,pageSpread(updated.spreads[0],'right')).color,'#f7f1e3');
 assert.equal(headerOf(updated,pageSpread(updated.spreads[0],'right')).text,'右页');
 assert.equal(updated.spreads[0].pages.right.date,'2025-06-03');
 const headed=applyHeader(updated,{...defaultHeader(),text:'整本'});
 assert.equal(headerOf(headed,pageSpread(headed.spreads[0],'right')).text,'整本');
 assert.equal(headed.spreads[0].pages.right.date,'2025-06-03');
});

test('new AI layouts reserve header space while locked manual pieces keep their geometry',async()=>{
 const {reserveHeaderSpace}=await import('../lib/journal.ts');
 const elements=[{kind:'text',text:'新文字',x:4,y:0,w:35,h:20,fontSize:18},{kind:'photo',sourceId:'locked',x:60,y:3,w:20,h:20}];
 const fitted=reserveHeaderSpace(elements,18,['locked']);
 assert.equal(fitted[0].y,18);
 assert.ok(fitted[0].y+fitted[0].h<=100);
 assert.deepEqual(fitted[1],elements[1]);
 assert.equal(elements[0].y,0);
});
