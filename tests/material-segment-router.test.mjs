import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, chmod, readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';
import {installMaterialSegmentRouter} from '../local/material-segment-router.mjs';

installMaterialSegmentRouter();
const {execFile} = await import('node:child_process');
const run = promisify(execFile);

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'segment-router-'));
  const executable = join(dir, 'segment');
  await writeFile(executable, `#!/usr/bin/env node\nconst fs=require('fs'),path=require('path'),crypto=require('crypto');const [, , input,out,mode]=process.argv;function f(){const n=crypto.randomUUID()+'.png';fs.writeFileSync(path.join(out,n),'x');return n}let r;if(mode==='auto'){r={width:1000,height:1000,engine:'auto',items:[{file:f(),width:990,height:990,bounds:[.005,.005,.99,.99]}]}}else if(mode==='panels'){r={width:1000,height:1000,engine:'panels',items:[0,.25,.5,.75].map(y=>({file:f(),width:1000,height:210,bounds:[0,y,1,.21]}))}}else{r={width:1000,height:1000,engine:mode,items:[]}}console.log(JSON.stringify(r));`);
  await chmod(executable, 0o755);
  return {dir, executable};
}

test('auto segment chooses an obviously better panel result and cleans rejected files', async () => {
  const {dir, executable} = await fixture();
  const output = await run(executable, ['input.png', dir, 'auto', '28'], {timeout: 5000});
  const parsed = JSON.parse(output.stdout);
  assert.equal(parsed.items.length, 4);
  assert.match(parsed.engine, /自动选优/);
  const pngs = (await readdir(dir)).filter(name=>name.endsWith('.png'));
  assert.equal(pngs.length, 4);
});

test('auto segment gives semantic recovery one chance for dozens of tiny fragments', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'segment-router-fragments-'));
  const executable = join(dir, 'segment');
  await writeFile(executable, `#!/usr/bin/env node
const fs=require('fs'),path=require('path'),crypto=require('crypto');const[, ,input,out,mode]=process.argv;const f=()=>{const n=crypto.randomUUID()+'.png';fs.writeFileSync(path.join(out,n),'x');return n};const items=mode==='auto'?Array.from({length:56},(_,i)=>({file:f(),width:24,height:24,bounds:[.1+(i%14)*.055,.62+Math.floor(i/14)*.035,.024,.024]})):mode==='ai'?[{file:f(),width:860,height:210,bounds:[.07,.58,.86,.21]}]:[];console.log(JSON.stringify({width:1000,height:1000,engine:mode,items}));`);
  await chmod(executable, 0o755);
  const output = await run(executable, ['input.png', dir, 'auto', '28'], {timeout: 5000});
  const parsed = JSON.parse(output.stdout);
  assert.equal(parsed.items.length, 1);
  assert.match(parsed.engine, /ai · 自动选优/);
  const pngs = (await readdir(dir)).filter(name=>name.endsWith('.png'));
  assert.equal(pngs.length, 1);
});

test('unrelated promisified execFile keeps the standard options-only overload', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'segment-router-unrelated-'));
  const executable = join(dir, 'noop');
  await writeFile(executable, '#!/bin/sh\nprintf ok\n');
  await chmod(executable, 0o755);
  const output = await run(executable, {encoding: 'utf8'});
  assert.equal(output.stdout, 'ok');
});
