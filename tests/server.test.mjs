import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { once } from 'node:events';
import http from 'node:http';
import { startTestServer } from './test-server.mjs';
const { dir, base, webPort } = await startTestServer(test);
const call = async (path, data, method = 'PUT', headers = {}) => {
  const res = await fetch(base + path, {
    method: data === undefined ? 'GET' : method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  return { status: res.status, data: await res.json() };
};
const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jz1sAAAAASUVORK5CYII=';
let uploaded,
  received,
  mode = 'ok';
const mock = http.createServer(async (req, res) => {
  let raw = '';
  for await (const p of req) raw += p;
  received = JSON.parse(raw);
  if (mode === 'bad') {
    res.writeHead(401);
    res.end('{}');
    return;
  }
  res.setHeader('content-type', 'application/json');
  if(mode==='recover' && received.messages.length===2){res.end(JSON.stringify({choices:[{finish_reason:'length',message:{content:''}}]}));return;}
  const lastContent=received.messages?.at(-1)?.content;
  const prompt=typeof lastContent==='string'?lastContent:(Array.isArray(lastContent)?lastContent.find(x=>x.type==='text')?.text||'':'');
  if(/Reply with OK only/i.test(prompt)){res.end(JSON.stringify({choices:[{message:{content:'OK'}}]}));return;}
  if(/Return only this JSON object/i.test(prompt)){res.end(JSON.stringify({choices:[{message:{content:'{"ok":true}'}}]}));return;}
  if(/Describe this image/i.test(prompt)){res.end(JSON.stringify({choices:[{message:{content:'pixel'}}]}));return;}
  res.end(
    JSON.stringify({
      choices: [
        {
          message: {
            content:
              mode === 'hand'
                ? JSON.stringify({theme:'archive',days:[],elements:[{kind:'doodle',motif:'arrow',w:40,h:50,x:10,y:10,path:'invalid generated path'}]})
                : mode === 'malformed'
                ? 'not-json'
                : JSON.stringify({
                    elements: [{kind:'text',role:'body',dayIndex:0,text:'今天喝了拿铁。',x:54,y:20,w:35,frame:'outline'}, {kind:'photo',dayIndex:0,photoIndex:0,x:5,y:10,w:30}],
                    theme: 'rose',
                    days: [
                      {
                        title: '一杯拿铁',
                        text: '今天喝了拿铁。',
                        assetIds: ['asset-001', 'nonexistent'],
                      },
                    ],
                  }),
          },
        },
      ],
    }),
  );
});
test.after(() => new Promise(resolve => mock.close(resolve)));
mock.listen(0, '127.0.0.1');
await once(mock, 'listening');
const mockUrl = `http://127.0.0.1:${mock.address().port}/v1`;
test('saves durable journal data with optimistic revision conflict protection', async () => {
  const empty = await call('/api/state');
  assert.equal(empty.data.revision, 0);
  const b = {
    id: 'book1',
    month: '2026-09',
    title: '我的手帐',
    cover: 'walnut',
    spreads: [],
  };
  const saved = await call('/api/state', { revision: 0, books: [b] });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.revision, 1);
  assert.equal(
    JSON.parse(await readFile(join(dir, 'journal.json'), 'utf8')).books[0]
      .title,
    b.title,
  );
  const stale = await call('/api/state', { revision: 0, books: [] });
  assert.equal(stale.status, 409);
  assert.equal((await call('/api/state')).data.books.length, 1);
  assert.equal((await stat(join(dir, 'journal.json'))).mode & 0o777, 0o600);
});
test('accepts the dynamically paired local web origin for saves', async () => {
  const current = await call('/api/state');
  const result = await call('/api/state', { revision: current.data.revision, books: current.data.books }, 'PUT', {
    Origin: `http://127.0.0.1:${webPort}`,
  });
  assert.equal(result.status, 200);
});
test('rejects foreign origins and invalid uploads', async () => {
  assert.equal(
    (
      await call('/api/state', { revision: 1, books: [] }, 'PUT', {
        Origin: 'https://evil.example',
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        '/api/upload',
        { data: 'data:image/png;base64,SGVsbG8=' },
        'POST',
      )
    ).status,
    400,
  );
  assert.equal((await fetch(base + '/uploads/..%2fsettings.json')).status, 404);
  const result = await call('/api/upload', { data: png }, 'POST');
  assert.equal(result.status, 200);
  uploaded = result.data.src;
  const res = await fetch(base + uploaded);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.ok((await res.arrayBuffer()).byteLength > 30);
});
test('photo library imports, deduplicates, lists, backs up and protects selected sources',async()=>{
  const bytes=Buffer.from(png.split(',')[1],'base64');
  const query='/api/photos/import?filename='+encodeURIComponent('旅行照片.png')+'&lastModified='+Date.parse('2026-08-09T10:11:12Z');
  const first=await fetch(base+query,{method:'POST',headers:{'content-type':'image/png'},body:bytes});assert.equal(first.status,200);const imported=await first.json();assert.equal(imported.duplicate,false);assert.match(imported.item.src,/^\/uploads\/photo-[a-f0-9]{32}\.webp$/);
  const repeated=await fetch(base+query,{method:'POST',headers:{'content-type':'image/png'},body:bytes});assert.equal(repeated.status,200);assert.equal((await repeated.json()).duplicate,true);
  const photos=await call('/api/photos');assert.equal(photos.status,200);assert.ok(photos.data.items.some(item=>item.id===imported.item.id));assert.equal(photos.data.items.find(item=>item.id===imported.item.id).capturedAt,'2026-08-09T10:11:12.000Z');
  const display=await fetch(base+imported.item.src);assert.equal(display.status,200);assert.equal(display.headers.get('content-type'),'image/webp');
  const thumbnail=await fetch(base+imported.item.thumbnailSrc);assert.equal(thumbnail.status,200);assert.equal(thumbnail.headers.get('content-type'),'image/webp');
  const backup=await fetch(base+'/api/photos/backup');assert.equal(backup.status,200);const archive=await backup.text();assert.match(archive,/shiguang-photo-library-v1/);assert.match(archive,/"type":"complete"/);
  const restored=await fetch(base+'/api/photos/restore',{method:'POST',headers:{'content-type':'application/x-shiguang-photo-library'},body:archive});assert.equal(restored.status,200);assert.ok((await restored.json()).duplicates>=1);
  const incomplete=await fetch(base+'/api/photos/restore',{method:'POST',headers:{'content-type':'application/x-shiguang-photo-library'},body:archive.split('\n').slice(0,-2).join('\n')});assert.equal(incomplete.status,400);assert.match((await incomplete.json()).error,/不完整/);
  const blocked=await fetch(base+'/api/photos/'+imported.item.id,{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({protectedSources:[imported.item.src]})});assert.equal(blocked.status,409);
});
test('API key stays local and missing settings do not pretend to run AI', async () => {
  assert.equal(
    (await call('/api/generate', { days: [{ raw: '今天喝了拿铁。' }] }, 'POST'))
      .status,
    409,
  );
  const config = await call('/api/settings', {
    baseUrl: mockUrl,
    model: 'test-model',
    apiKey: 'private-test-key',
    vision: false,
  });
  assert.equal(config.data.hasKey, true);
  assert.equal(config.data.apiKey, undefined);
  assert.ok(
    !JSON.stringify((await call('/api/settings')).data).includes(
      'private-test-key',
    ),
  );
  assert.equal((await stat(join(dir, 'settings.json'))).mode & 0o777, 0o600);
});
test('real HTTP AI adapter validates output and respects photo sending preference', async () => {
  const days = [
    { date: '2026-09-05', raw: '今天喝了拿铁。', photos: [uploaded] },
  ];
  const result = await call('/api/generate', { days }, 'POST');
  assert.equal(result.status, 200);
  assert.equal(result.data.days[0].text, '今天喝了拿铁。');
  assert.deepEqual(result.data.days[0].assetIds, ['asset-001']);
  assert.equal(typeof received.messages[1].content, 'string');
  await call('/api/settings', {
    baseUrl: mockUrl,
    model: 'test-model',
    vision: true,
  });
  assert.equal((await call('/api/generate', { days }, 'POST')).status, 200);
  assert.equal(
    received.messages[1].content.some((c) => c.type === 'image_url'),
    true,
  );
  mode = 'bad';
  assert.equal((await call('/api/generate', { days }, 'POST')).status, 502);
  mode = 'malformed';
  assert.equal((await call('/api/generate', { days }, 'POST')).status, 502);
});

test('truncated design automatically retries once and records useful diagnostics without journal text', async()=>{
  mode='recover';
  const days=[{raw:'今天喝了拿铁。',photos:[uploaded]}];
  const result=await call('/api/generate',{days},'POST');
  assert.equal(result.status,200);
  assert.equal(received.messages.length,3);
  const info=JSON.parse(await readFile(join(dir,'ai-last-result.json'),'utf8'));
  assert.equal(info.attempts.length,2);
  assert.equal(info.attempts[0].errorCode,'truncated');
  assert.equal(info.ok,true);
  assert.ok(!JSON.stringify(info).includes(days[0].raw));
  mode='ok';
});
test('production homepage and its bundled assets are served',async()=>{const r=await fetch(base+'/');assert.equal(r.status,200);const html=await r.text();const paths=[...new Set([...html.matchAll(/(?:src|href)="(\/[^" ]+\.(?:js|css))"/g)].map(m=>m[1]))];assert.ok(paths.length>0);for(const path of paths)assert.equal((await fetch(base+path)).status,200)});
test('reopening and saving a blank key preserves the saved credential',async()=>{mode='ok';const before=JSON.parse(await readFile(join(dir,'settings.json'),'utf8'));const saved=await call('/api/settings',{baseUrl:before.baseUrl,model:before.model,apiKey:'',vision:before.vision});assert.equal(saved.status,200);assert.equal(saved.data.hasKey,true);const after=JSON.parse(await readFile(join(dir,'settings.json'),'utf8'));assert.equal(after.apiKey,before.apiKey);assert.equal((await call('/api/settings')).data.apiKey,undefined);assert.equal((await call('/api/settings/test',{},'POST')).status,200);const invalid=await call('/api/settings',{baseUrl:before.baseUrl,model:'same-model',apiKey:'same-model'});assert.equal(invalid.status,400);assert.match(invalid.data.error,/模型名称/);assert.equal(JSON.parse(await readFile(join(dir,'settings.json'),'utf8')).apiKey,before.apiKey)});
test('material workbench splits a sheet, imports transparent pieces and persists the library',async()=>{
 const initial=(await call('/api/materials')).data.length;
 const fixture=await readFile('tests/fixtures/sticker-sheet.png');
 const upload=await call('/api/upload',{data:'data:image/png;base64,'+fixture.toString('base64')},'POST');
 const capabilities=(await call('/api/capabilities')).data;
 const result=await call('/api/materials/segment',{src:upload.data.src,name:'测试素材纸',mode:'auto',tolerance:28},'POST');
 if(!capabilities.segment){assert.equal(result.status,501);assert.match(result.data.error,/当前系统暂不支持/);return;}
 assert.equal(result.status,200);assert.equal(result.data.items.length,3);
 for(const item of result.data.items){const r=await fetch(base+item.src);assert.equal(r.status,200);const image=Buffer.from(await r.arrayBuffer());assert.equal(image[25],6);assert.ok(item.width>50&&item.height>50)}
 const first=result.data.items[0];
 const crop=await call('/api/materials/segment',{src:upload.data.src,name:'单个框选',mode:'crop',tolerance:28,rect:first.bounds},'POST');
 assert.equal(crop.status,200);
 const originalIds=new Set(result.data.items.map(item=>item.id));
 const croppedItems=crop.data.items.filter(item=>!originalIds.has(item.id));
 assert.equal(crop.data.id,result.data.id);
 assert.equal(croppedItems.length,1);assert.equal(croppedItems[0].manual,true);
 assert.deepEqual(crop.data.items.filter(item=>originalIds.has(item.id)),result.data.items);
 const payload={jobId:result.data.id,itemIds:result.data.items.map(i=>i.id),category:'测试贴纸',tags:'复古，测试',names:{[first.id]:'独立绿色素材'}};
 const imported=await call('/api/materials/import',payload,'POST');assert.equal(imported.status,200);assert.equal(imported.data.added,3);assert.equal(imported.data.assets.length,initial+3);assert.equal(imported.data.assets.find(a=>a.id===first.id).name,'独立绿色素材');
 assert.equal((await call('/api/materials/import',payload,'POST')).data.added,0);
 assert.equal((await call('/api/materials')).data.length,initial+3);
 assert.equal(JSON.parse(await readFile(join(dir,'materials.json'),'utf8')).length,3);
 const savedItems=(await call('/api/materials/jobs')).data.find(j=>j.id===result.data.id).items;
 assert.ok(savedItems.filter(item=>originalIds.has(item.id)).every(item=>item.imported));
 assert.equal(savedItems.find(item=>item.id===croppedItems[0].id).imported,false);
 assert.equal((await call('/api/materials/import',{jobId:result.data.id,itemIds:['unknown']},'POST')).status,400);
 assert.equal((await call('/api/materials/segment',{src:upload.data.src,rect:[.9,0,.5,.5]},'POST')).status,400);
});


test('saved user material can be reopened for editing and deleted again',async()=>{
 const capabilities=(await call('/api/capabilities')).data;
 const source=await call('/api/materials/source',{src:uploaded,name:'可再次编辑素材'},'POST');assert.equal(source.status,200);
 assert.equal(source.data.manualOnly,!capabilities.segment);assert.equal(source.data.mode,capabilities.segment?'auto':'manual');
 const withItem=await call('/api/materials/add-item',{jobId:source.data.id,src:uploaded,width:1,height:1,name:'可再次编辑素材'},'POST');assert.equal(withItem.status,200);
 const item=withItem.data.items.at(-1);
 const imported=await call('/api/materials/import',{jobId:source.data.id,itemIds:[item.id],names:{[item.id]:'可再次编辑素材'}},'POST');assert.equal(imported.status,200);
 const custom=imported.data.assets.find(a=>a.id===item.id);assert.ok(custom?.sourceImage);
 const catalog=(await call('/api/materials/catalog')).data;
 const classified=await call('/api/materials/catalog',{action:'apply',manual:true,revision:catalog.revision,patches:[{id:custom.id,group:'装饰贴纸',labels:{content:['植物'],style:['复古'],color:['绿']}}]},'POST');assert.equal(classified.status,200);
 const editSource=await call('/api/materials/source',{src:custom.src,name:custom.name,replaceAssetId:custom.id},'POST');assert.equal(editSource.status,200);assert.equal(editSource.data.replaceAssetId,custom.id);assert.equal(editSource.data.items.length,0);
 const editedJob=await call('/api/materials/add-item',{jobId:editSource.data.id,src:uploaded,width:2,height:3,name:'处理后的素材'},'POST');assert.equal(editedJob.status,200);
 const editedItem=editedJob.data.items.at(-1);
 const replaced=await call('/api/materials/import',{jobId:editSource.data.id,itemIds:[editedItem.id],names:{[editedItem.id]:'处理后的素材'}},'POST');assert.equal(replaced.status,200);assert.equal(replaced.data.updated,1);assert.equal(replaced.data.added,0);
 const current=replaced.data.assets.find(a=>a.id===custom.id);assert.equal(current.name,'处理后的素材');assert.equal(current.src,uploaded);assert.equal(current.group,'装饰贴纸');assert.deepEqual(current.labels,{content:['植物'],style:['复古'],color:['绿']});
 assert.equal(replaced.data.assets.some(a=>a.id===editedItem.id),false);
 const repeated=await call('/api/materials/import',{jobId:editSource.data.id,itemIds:[editedItem.id]},'POST');assert.equal(repeated.status,200);assert.equal(repeated.data.updated,0);assert.equal(repeated.data.added,0);assert.equal(repeated.data.assets.length,replaced.data.assets.length);
 const queued=await call('/api/materials/reopen',{id:custom.id},'POST');assert.equal(queued.status,200);
 const take=await call('/api/materials/reopen');assert.equal(take.status,200);assert.equal(take.data.item.id,custom.id);assert.equal(take.data.item.src,uploaded);
 assert.equal((await call('/api/materials/reopen')).data.item,null);
 const removed=await call('/api/materials/remove',{id:custom.id},'POST');assert.equal(removed.status,200);assert.equal(removed.data.assets.some(a=>a.id===custom.id),false);
 assert.equal((await call('/api/materials/remove',{id:custom.id},'POST')).status,404);
});

 test('HTTP layout uses small hand-drawn motifs instead of model-authored geometry',async()=>{
 mode='hand';
 const result=await call('/api/generate',{days:[],elements:[],instruction:'一条自然的小弯箭头'},'POST');
 assert.equal(result.status,200);assert.equal(result.data.elements[0].doodleMotif,'arrow');
 assert.ok(result.data.elements[0].w<=17);assert.ok(result.data.elements[0].path.startsWith('M6'));
 mode='ok';
});
