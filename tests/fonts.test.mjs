import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, stat} from 'node:fs/promises';
import {join} from 'node:path';
import {startTestServer} from './test-server.mjs';
const {dir,base}=await startTestServer(test);

function storedZip(name,data){
  const filename=Buffer.from(name);
  const local=Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0,6);local.writeUInt16LE(0,8);
  local.writeUInt32LE(0,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(filename.length,26);local.writeUInt16LE(0,28);
  const central=Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0,8);central.writeUInt16LE(0,10);
  central.writeUInt32LE(0,16);central.writeUInt32LE(data.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(filename.length,28);
  central.writeUInt16LE(0,30);central.writeUInt16LE(0,32);central.writeUInt16LE(0,34);central.writeUInt16LE(0,36);central.writeUInt32LE(0,38);central.writeUInt32LE(0,42);
  const prefix=Buffer.concat([local,filename,data]);
  const centralPart=Buffer.concat([central,filename]);
  const eocd=Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50,0);eocd.writeUInt16LE(0,4);eocd.writeUInt16LE(0,6);eocd.writeUInt16LE(1,8);eocd.writeUInt16LE(1,10);
  eocd.writeUInt32LE(centralPart.length,12);eocd.writeUInt32LE(prefix.length,16);eocd.writeUInt16LE(0,20);
  return Buffer.concat([prefix,centralPart,eocd]);
}
async function importFile(filename,data,type='application/octet-stream'){
  const r=await fetch(`${base}/api/fonts/import?filename=${encodeURIComponent(filename)}`,{method:'POST',headers:{'Content-Type':type},body:data});
  return {status:r.status,data:await r.json()};
}

test('built-in handwriting font files and catalog are packaged',async()=>{
  const required=['liyu-shoushu.ttf','xiaolai.ttf','yozai-medium.ttf','kaiti-gb.ttf','kaiti-big5.ttf','comic-neue.otf','lobster-two.otf','purisa.otf'];
  for(const file of required)assert.ok((await stat(new URL('../public/fonts/'+file,import.meta.url))).size>30000,file);
  const [catalog,css,layout]=await Promise.all([readFile(new URL('../lib/collage.ts',import.meta.url),'utf8'),readFile(new URL('../app/globals.css',import.meta.url),'utf8'),readFile(new URL('../app/layout.tsx',import.meta.url),'utf8')]);
  for(const id of ['liyu','xiaolai','yozai','kaiti-gb','kaiti-big5','comic-neue','lobster-two','purisa'])assert.match(catalog,new RegExp(`id:'${id}'`));
  assert.match(css,/Journal Liyu/);assert.match(css,/Journal Xiaolai/);assert.match(css,/Journal Yozai/);
  assert.match(layout,/\/api\/fonts\.css/);
});

test('user can import a font, persist it, reload CSS and deduplicate the same file',async()=>{
  assert.deepEqual((await (await fetch(base+'/api/fonts')).json()).fonts,[]);
  const comic=await readFile(new URL('../public/fonts/comic-neue.otf',import.meta.url));
  const first=await importFile('My-Comic-Regular.otf',comic);
  assert.equal(first.status,200);assert.equal(first.data.fonts.length,1);
  const font=first.data.fonts[0];
  assert.match(font.id,/^[a-f0-9]{24}$/);assert.equal(font.name,'My Comic');
  const saved=JSON.parse(await readFile(join(dir,'fonts.json'),'utf8'));
  assert.equal(saved.length,1);assert.equal((await stat(join(dir,'user-fonts',font.id+'.otf'))).size,comic.length);
  const file=await fetch(base+font.url);assert.equal(file.status,200);assert.equal(file.headers.get('content-type'),'font/otf');assert.equal(Buffer.from(await file.arrayBuffer()).subarray(0,4).toString('ascii'),'OTTO');
  const css=await (await fetch(base+'/api/fonts.css')).text();assert.match(css,new RegExp(`Journal User ${font.id}`));
  const duplicate=await importFile('Again.otf',comic);assert.equal(duplicate.data.fonts[0].id,font.id);
  assert.equal((await (await fetch(base+'/api/fonts')).json()).fonts.length,1);
});

test('ZIP font packs import supported font files and reject non-font payloads',async()=>{
  const purisa=await readFile(new URL('../public/fonts/purisa.otf',import.meta.url));
  const zipped=storedZip('folder/Purisa-Regular.otf',purisa);
  const result=await importFile('my-font-pack.zip',zipped,'application/zip');
  assert.equal(result.status,200);assert.equal(result.data.fonts.length,1);assert.equal(result.data.fonts[0].name,'Purisa');
  assert.equal((await (await fetch(base+'/api/fonts')).json()).fonts.length,2);
  const invalid=await importFile('bad.ttf',Buffer.from('not a font'));
  assert.equal(invalid.status,400);assert.match(invalid.data.error,/有效的字体文件/);
});

test('the additional font pack is served locally with complete files and source notices', async () => {
  const { createHash } = await import('node:crypto');
  const manifest = JSON.parse(await readFile(new URL('../public/fonts/licenses/font-pack-v2-sources.json', import.meta.url), 'utf8'));
  assert.equal(manifest.fonts.length, 8);
  for (const font of manifest.fonts) {
    const response = await fetch(`${base}/fonts/${font.bundled_file}`);
    assert.equal(response.status, 200, font.id);
    assert.equal(response.headers.get('content-type'), 'font/woff2', font.id);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.subarray(0, 4).toString(), 'wOF2', font.id);
    assert.equal(bytes.length, font.bundled_bytes, font.id);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), font.bundled_sha256, font.id);
    const license = await readFile(new URL('../public/fonts/licenses/' + font.license_file, import.meta.url), 'utf8');
    assert.match(license, /SIL OPEN FONT LICENSE/i, font.id);
  }
});
