import test from 'node:test';
import assert from 'node:assert/strict';
import {newBook,applyHeader,applyPaper,applyPaperBg,defaultHeader,headerOf,renderHeader,addBlankSpread,paperBgOf,formatHeaderDate,headerDateFormats} from '../lib/journal.ts';
import {copyNotebooks,notebookUploads,remapNotebookUploads} from '../lib/journal-backup.ts';

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
 const header={...defaultHeader(),text:'{日期} {星期} 第{页码}页 / {date}',dateFormat:'cn'};
 assert.equal(renderHeader(header,{date:'2025-03-04',page:3}),'2025年3月4日 星期二 第3页 / 2025年3月4日');
 assert.equal(renderHeader({...header,text:'{日期}'},{}),'');
});

test('legacy custom date formats retain their saved formatting',()=>{
 const header={...defaultHeader(),text:'{日期} / {date}',dateFormat:'custom',customFormat:'yyyy年M月d日'};
 assert.equal(renderHeader(header,{date:'2025-03-04'}),'2025年3月4日 / 2025年3月4日');
 assert.ok(headerDateFormats.some(format=>format.id==='custom'));
 for(const [template,expected] of [
  ['yyyy年MM月dd日','2025年03月04日'],
  ['M月d日 · yyyy','3月4日 · 2025'],
  ['MM/dd / M/d','03/04 / 3/4'],
  ['旅行记录','旅行记录'],
  ['', '2025.03.04'],
  [undefined,'2025.03.04'],
 ])assert.equal(formatHeaderDate('2025-03-04','custom',template),expected);
 assert.equal(formatHeaderDate(undefined,'custom','yyyy.MM.dd'),'');
 assert.equal(formatHeaderDate('2025-03-04','dash','M月d日'),'2025-03-04');
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

test('restoring notebook copies preserves all pages and image references with independent nested content and new book identities',()=>{
 const source=newBook('2026-09','linen-oat','旅行记录');
 source.coverAsset='/uploads/cover.png';
 source.paperBg={src:'/uploads/book-paper.png',x:2,y:3,scale:110};
 source.paperTemplates=[{id:'paper-template',name:'旧纸',src:'/uploads/template.png',x:0,y:0,scale:100}];
 source.flyleaf.elements=[{id:'leaf-photo',kind:'photo',src:'/uploads/leaf.png',photoOriginal:'/uploads/leaf-original.jpg',x:58,y:12,w:28,rotation:3,locked:true}];
 const spread=source.spreads[0];
 spread.pages={left:{paperBg:{src:'/uploads/left-paper.png',x:0,y:0,scale:100}}};
 spread.days=[{id:'day-a',date:'2026-09-09',raw:'原文',title:'旅行',text:'海边散步',photos:['/uploads/day-original.jpg']}];
 spread.elements=[
  {id:'photo-a',kind:'photo',dayId:'day-a',src:'/uploads/crop.png',photoOriginal:'/uploads/day-original.jpg',x:5,y:10,w:30,rotation:5,locked:true,groupId:'group-a'},
  {id:'caption-a',kind:'text',dayId:'day-a',text:'海边散步',x:8,y:42,w:25,rotation:0,locked:false,groupId:'group-a',attachedTo:'photo-a',colorRuns:[{start:0,end:2,color:'#336699'}]},
 ];
 source.collageTemplates=[{id:'collage-a',name:'照片组合',ratio:1.43,elements:structuredClone(spread.elements)}];
 const another=newBook('2026-08');
 another.title='';
 const originals=[source,another],before=structuredClone(originals);
 const copies=copyNotebooks(originals,'历史恢复');
 const repeated=copyNotebooks(originals,'历史恢复');
 assert.equal(new Set([...originals,...copies,...repeated].map(book=>book.id)).size,6);
 assert.equal(copies[0].title,'旅行记录 · 历史恢复');
 assert.equal(copies[1].title,'未命名笔记本 · 历史恢复');
 for(const [index,copy] of copies.entries()){
  // Only the notebook identity and display name change; page/element IDs and links stay intact.
  assert.deepEqual({...copy,id:originals[index].id,title:originals[index].title},originals[index]);
 }
 assert.deepEqual(notebookUploads(copies),notebookUploads(originals));
 copies[0].flyleaf.elements[0].src='/uploads/copy-only.png';
 copies[0].spreads[0].elements[1].colorRuns[0].color='#ff0000';
 copies[0].spreads[0].days[0].photos.push('/uploads/extra.png');
 copies[0].spreads[0].pages.left.paperBg.x=40;
 copies[0].collageTemplates[0].elements[0].photoOriginal='/uploads/changed.jpg';
 copies[0].paperTemplates[0].name='副本内页';
 assert.deepEqual(originals,before);
 assert.deepEqual(repeated[0].flyleaf,before[0].flyleaf);
 assert.deepEqual(repeated[0].spreads,before[0].spreads);
});

test('left and right page overrides stay independent and whole-book changes clear only the matching overrides',async()=>{
 const {patchPage,pageSpread,paperSettings}=await import('../lib/journal.ts');
 let book=newBook('2026-09');
 const id=book.spreads[0].id;
 book=patchPage(book,id,'right',{paperColor:'#2b2b28',paperStyle:'dots',header:{...defaultHeader(),text:'右页'},date:'2025-06-03',paperBg:{src:'/uploads/right.png',x:10,y:5,scale:110}});
 assert.equal(paperSettings(book,pageSpread(book.spreads[0],'left')).color,'#f3ecd9');
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
