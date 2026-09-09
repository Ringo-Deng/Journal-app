import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,access,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {once} from 'node:events';

const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function freePort(){const socket=createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));return port}

test('recognition commits only final results and preserves edits made during processing',{skip:process.platform!=='darwin'||process.arch!=='arm64'},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'journal-segment-storage-'));
 let child;
 try{
  await mkdir(join(dir,'uploads'));
  const file='00000000-0000-4000-8000-000000000001.png',src='/uploads/'+file;
  await writeFile(join(dir,'uploads',file),'isolated test input');
  // Control only the native process boundary; exercise the real HTTP handler,
  // serialization queue, import endpoint and disk persistence without timing races.
  const preload=join(dir,'native-fixture.mjs');
  await writeFile(preload,`
import cp from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {promisify} from 'node:util';
import {readFile,writeFile,access} from 'node:fs/promises';
import {join,basename} from 'node:path';
import {randomUUID} from 'node:crypto';
const original=promisify(cp.execFile),dir=process.env.JOURNAL_DATA_DIR;
const originalExecFile=cp.execFile;
function fixtureExecFile(...args){return originalExecFile(...args)}
fixtureExecFile[promisify.custom]=async function(file,args,options){
 if(basename(file)!=='segment')return original(file,args,options);
 const mode=await readFile(join(dir,'fixture-mode'),'utf8').catch(()=> 'ok');
 if(mode==='fail')throw Error('fixture failure');
 if(mode==='hold'){
  await writeFile(join(dir,'started'),'yes');
  for(let i=0;i<200;i++){try{await access(join(dir,'release'));break}catch{await new Promise(r=>setTimeout(r,10))}}
 }
 const output=randomUUID()+'.png';await writeFile(join(dir,'uploads',output),'fixture image');
 return{stdout:JSON.stringify({engine:'fixture',items:[{file:output,width:40,height:40,bounds:[.2,.2,.4,.4]}]}),stderr:''};
};
cp.execFile=fixtureExecFile;syncBuiltinESMExports();
`);
  const port=await freePort(),base='http://127.0.0.1:'+port;
  child=spawn(process.execPath,['--import',pathToFileURL(preload).href,'local/server.mjs'],{cwd:resolve('.'),env:{...process.env,JOURNAL_DATA_DIR:dir,JOURNAL_CONFIG_DIR:dir,JOURNAL_PORT:String(port)},stdio:['ignore','pipe','pipe']});
  let diagnostics='';child.stderr.on('data',chunk=>{diagnostics+=chunk.toString()});
  await Promise.race([once(child.stdout,'data'),once(child,'exit').then(([code])=>{throw Error('server exited '+code+': '+diagnostics)})]);
  const call=async(path,data)=>{const response=await fetch(base+'/api/materials'+path,{method:data?'POST':'GET',headers:{'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});return{status:response.status,data:await response.json()}};
  const source=await call('/source',{src,name:'test'});assert.equal(source.status,200);
  const jobId=source.data.id;
  const manual=await call('/add-item',{jobId,src,width:30,height:30,name:'manual original'});
  const manualId=manual.data.items[0].id;
  const input={src,name:'test',mode:'paper',tolerance:28};
  const first=await call('/segment',input);assert.equal(first.status,200);
  const fresh=first.data.items.find(i=>!i.manual);
  assert.equal(first.data.id,jobId);assert.ok(first.data.items.some(i=>i.id===manualId));
  await writeFile(join(dir,'fixture-mode'),'hold');
  const pending=call('/segment',input);
  let started=false;
  for(let i=0;i<100;i++){try{await access(join(dir,'started'));started=true;break}catch{await wait(10)}}
  assert.ok(started,'recognition reached the controlled native boundary');
  const extra=await call('/add-item',{jobId,src,width:20,height:20,name:'manual during recognition'});
  const extraId=extra.data.items.at(-1).id;
  const imported=await call('/import',{jobId,itemIds:[fresh.id]});assert.equal(imported.status,200);
  await writeFile(join(dir,'release'),'yes');
  const recognized=await pending;assert.equal(recognized.status,200);
  assert.ok(recognized.data.items.some(i=>i.id===manualId&&i.manual));
  assert.ok(recognized.data.items.some(i=>i.id===extraId&&i.manual));
  assert.ok(recognized.data.items.some(i=>i.id===fresh.id&&i.imported));
  assert.equal(recognized.data.items.length,4);
  const saved=await readFile(join(dir,'material-jobs.json'),'utf8');
  await writeFile(join(dir,'fixture-mode'),'fail');
  assert.equal((await call('/segment',input)).status,422);
  assert.equal(await readFile(join(dir,'material-jobs.json'),'utf8'),saved);
  assert.deepEqual((await call('/jobs')).data,JSON.parse(saved));
 }finally{
  if(child&&child.exitCode===null){const stopped=once(child,'exit');child.kill('SIGTERM');await stopped}
  await rm(dir,{recursive:true,force:true});
 }
});
