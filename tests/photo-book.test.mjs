import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { notebookUploads, remapNotebookUploads } from '../lib/journal-backup.ts';
import { bounds, layoutIssues } from '../lib/layout-safety.mjs';
const hooks = registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL?.endsWith('/lib/photo-book.ts') && specifier === './journal') return next('./journal.ts', context);
  return next(specifier, context);
} });
const { createPhotoBook, photoBookStyles, chronologicalPhotos, MAX_PHOTO_BOOK_PHOTOS } = await import('../lib/photo-book.ts');
hooks.deregister();
const photos = n => Array.from({length:n},(_,i)=>({id:`p${i}`,src:`/uploads/photo-${i}.webp`,width:i%3===0?600:1200,height:i%3===0?1000:800,capturedAt:`2026-${i%2?'10':'09'}-01T12:00:00Z`}));
const build = (items, style='cream',format='standard') => createPhotoBook({photos:items,style,format,title:'旅途与日常'});
for (const style of photoBookStyles) for (const format of ['standard','tn-regular']) {
 test(`${style.id}/${format}: every photo appears exactly once in order, including all partial endings`,()=>{
  for (const n of [...Array.from({length:65},(_,i)=>i+1),127,500]) {
   const input=photos(n), snapshot=structuredClone(input), book=build(input,style.id,format);
   assert.deepEqual(input,snapshot);
   const actual=book.spreads.flatMap(s=>s.elements.filter(p=>p.kind==='photo'));
   assert.deepEqual(actual.map(p=>p.src),input.map(p=>p.src));
   assert.equal(book.flyleaf.elements.filter(p=>p.kind==='photo').length,0);
   assert.ok(actual.every(p=>!p.locked&&p.photoOriginal===p.src&&p.cropZoom===1));
   const all=[book.flyleaf,...book.spreads], ids=all.flatMap(s=>[s.id,...s.elements.map(p=>p.id)]);
   assert.equal(new Set(ids).size,ids.length);
   assert.ok(book.spreads.every(s=>s.elements.length<=300));
   const ratio=format==='standard'?1.43:1.05;
   actual.forEach((p,i)=>{
    assert.ok(Math.abs(p.w*ratio/p.h-input[i].width/input[i].height)<1e-8);
    const b=bounds(p,ratio);assert.ok(b.x>=2&&b.x+b.w<=98&&b.y>=15&&b.y+b.h<88,JSON.stringify(b));
    assert.ok(b.x+b.w<=48||b.x>=52,'photograph stays out of the spine');
   });
   for (const spread of book.spreads) assert.deepEqual(layoutIssues(spread.elements.filter(p=>p.kind!=='doodle'),ratio,2),[]);
  }
 });
}
test('duplicates are explicit occurrences; over-capacity and corrupt inputs fail without truncation',()=>{
 const input=photos(2);input.push({...input[0]});assert.equal(build(input).spreads.flatMap(s=>s.elements.filter(p=>p.kind==='photo')).length,3);
 assert.throws(()=>build([]),/选择照片/);
 assert.throws(()=>build(photos(MAX_PHOTO_BOOK_PHOTOS+1)),/最多/);
 for(const bad of [{width:0},{height:NaN},{src:'blob:temporary'},{src:'https://other.test/a.png'}]) assert.throws(()=>build([{...photos(1)[0],...bad}]),/完整导入/);
});
test('photo references survive serialization, backup collection and remapping; later edits are ordinary pieces',()=>{
 const book=build(photos(30),'collage','tn-regular'),roundtrip=JSON.parse(JSON.stringify(book));
 assert.deepEqual(roundtrip.spreads,book.spreads);assert.deepEqual(roundtrip.flyleaf,book.flyleaf);assert.equal(notebookUploads([book]).length,30);
 const next=remapNotebookUploads(book,{'/uploads/photo-0.webp':'/uploads/restored.webp'});
 const first=next.spreads[0].elements.find(p=>p.kind==='photo');assert.equal(first.src,'/uploads/restored.webp');assert.equal(first.photoOriginal,first.src);
 first.x+=1;first.rotation=5;assert.notDeepEqual(next,book);assert.equal(book.spreads[0].elements.find(p=>p.kind==='photo').src,'/uploads/photo-0.webp');
});
test('date ordering is stable, nonmutating and puts unknown dates last',()=>{
 const input=[{id:'unknown'}, {id:'later',capturedAt:'2026-10-02'}, {id:'early',capturedAt:'2026-09-01'}, {id:'same',capturedAt:'2026-09-01'}];
 assert.deepEqual(chronologicalPhotos(input).map(p=>p.id),['early','same','later','unknown']);assert.equal(input[0].id,'unknown');
});

test('extreme panoramas and tall scans remain visible inside valid editable boxes',()=>{
 const input=[{...photos(1)[0],width:1,height:10000},{...photos(1)[0],width:10000,height:1}];
 for(const style of photoBookStyles){const book=build(input,style.id);for(const p of book.spreads.flatMap(s=>s.elements.filter(p=>p.kind==='photo'))){assert.ok(p.w>=1&&p.h>0&&p.h<85);assert.equal(p.photoFit,'contain');}}
});
