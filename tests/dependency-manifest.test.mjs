import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  dependencyMismatches,
  assertDependencyManifest,
} from '../local/dependency-manifest.mjs';

test('dependency drift is detected in either dependency section', () => {
  const pkg = { dependencies: { a: '1', b: '2' }, devDependencies: { c: '3' } };
  const lock = { packages: { '': { dependencies: { a: '1', b: '9' }, devDependencies: { c: '3', d: '4' } } } };
  assert.deepEqual(dependencyMismatches(pkg, lock), [
    { section: 'dependencies', name: 'b', packageVersion: '2', lockVersion: '9' },
    { section: 'devDependencies', name: 'd', packageVersion: null, lockVersion: '4' },
  ]);
});

test('aligned package manifests pass the startup assertion', async () => {
  const root = await mkdtemp(join(tmpdir(), 'shiguang-deps-'));
  const pkg = { dependencies: { 'input-otp': '1.4.2', 'tw-animate-css': '1.4.0' }, devDependencies: { vite: '8.0.13' } };
  const lock = { packages: { '': { dependencies: { 'input-otp': '1.4.2', 'tw-animate-css': '1.4.0' }, devDependencies: { vite: '8.0.13' } } } };
  await writeFile(join(root, 'package.json'), JSON.stringify(pkg));
  await writeFile(join(root, 'package-lock.json'), JSON.stringify(lock));
  assert.equal(await assertDependencyManifest(root), true);
});

test('startup assertion explains the exact dependency that drifted', async () => {
  const root = await mkdtemp(join(tmpdir(), 'shiguang-deps-bad-'));
  await writeFile(join(root, 'package.json'), JSON.stringify({ dependencies: { 'input-otp': '9.8.1' } }));
  await writeFile(join(root, 'package-lock.json'), JSON.stringify({ packages: { '': { dependencies: { 'input-otp': '1.4.2' } } } }));
  await assert.rejects(() => assertDependencyManifest(root), /input-otp: package\.json=9\.8\.1，package-lock\.json=1\.4\.2/);
});

test('repository package dependencies match package-lock exactly', async () => {
  const root = resolve(new URL('..', import.meta.url).pathname);
  assert.equal(await assertDependencyManifest(root), true);
  const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  assert.equal(pkg.dependencies['input-otp'], '1.4.2');
  assert.equal(pkg.dependencies['tw-animate-css'], '1.4.0');
});
