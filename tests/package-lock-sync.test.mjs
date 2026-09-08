import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const packagePath=new URL('../package.json',import.meta.url);
const lockPath=new URL('../package-lock.json',import.meta.url);

const sortedEntries=value=>Object.fromEntries(Object.entries(value||{}).sort(([a],[b])=>a.localeCompare(b)));

test('package.json dependency lists stay in sync with package-lock root package',async()=>{
  const pkg=JSON.parse(await readFile(packagePath,'utf8'));
  const lock=JSON.parse(await readFile(lockPath,'utf8'));
  const root=lock.packages?.[''];
  assert.ok(root,'package-lock.json is missing the root package entry');
  assert.deepEqual(sortedEntries(pkg.dependencies),sortedEntries(root.dependencies));
  assert.deepEqual(sortedEntries(pkg.devDependencies),sortedEntries(root.devDependencies));
});
