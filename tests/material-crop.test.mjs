import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const run=promisify(execFile);
for(const mode of ['crop','single'])test(`manual ${mode} returns one complete region without component splitting`,{skip:process.platform!=='darwin'},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'journal-crop-test-'));
 try{
  const {stdout}=await run(resolve('local/segment'),[resolve('public/materials/asset-001.jpg'),dir,mode,'28','0','0','0.5','0.5']);
  const result=JSON.parse(stdout);assert.equal(result.items.length,1);assert.equal(result.items[0].width,result.width);assert.equal(result.items[0].height,result.height);
  assert.deepEqual(result.items[0].bounds,[0,0,1,1]);const png=await readFile(join(dir,result.items[0].file));assert.equal(png.subarray(1,4).toString(),'PNG');
 }finally{await rm(dir,{recursive:true,force:true})}
});
