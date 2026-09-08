import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { upgradeManualMaterialJobs, prepareNativeImageTools } from '../local/native-tools.mjs';

test('restores stale manual-only Pinterest jobs after native segmentation becomes available', () => {
  const input = [{
    id: 'job-1',
    source: '/uploads/example.jpg',
    engine: 'Pinterest 原图 · 手动裁切',
    mode: 'manual',
    manualOnly: true,
    sourceMeta: { type: 'pinterest', pinId: '884746289450443581' },
    items: [],
  }];
  const result = upgradeManualMaterialJobs(input);
  assert.equal(result.changed, true);
  assert.equal(result.jobs[0].manualOnly, false);
  assert.equal(result.jobs[0].mode, 'auto');
  assert.equal(result.jobs[0].engine, 'Pinterest 原图 · 可自动分离');
});

test('repairs downloaded native tool permissions and saved Pinterest jobs on macOS arm64', async () => {
  const root = await mkdtemp(join(tmpdir(), 'shiguang-native-'));
  const local = join(root, 'local');
  const data = join(root, 'data');
  await mkdir(local, { recursive: true });
  await mkdir(data, { recursive: true });
  for (const name of ['segment', 'cutout', 'material-palette', 'clean-paper']) {
    await writeFile(join(local, name), '#!/bin/sh\nexit 0\n', { mode: 0o600 });
  }
  await writeFile(join(data, 'material-jobs.json'), JSON.stringify([{
    id: 'job-1', source: '/uploads/example.jpg', engine: 'Pinterest 原图 · 手动裁切',
    mode: 'manual', manualOnly: true, sourceMeta: { type: 'pinterest' }, items: [],
  }]));

  const result = await prepareNativeImageTools({ root, dataDir: data, platformName: 'darwin', archName: 'arm64' });
  assert.equal(result.segment, true);
  assert.equal(result.cutout, true);
  assert.equal(result.upgradedJobs, true);
  for (const name of ['segment', 'cutout', 'material-palette', 'clean-paper']) {
    const mode = (await stat(join(local, name))).mode;
    assert.notEqual(mode & 0o111, 0);
  }
  const saved = JSON.parse(await readFile(join(data, 'material-jobs.json'), 'utf8'));
  assert.equal(saved[0].manualOnly, false);
  assert.equal(saved[0].mode, 'auto');
});

test('native bootstrap is idempotent across repeated launches', async () => {
  const root = await mkdtemp(join(tmpdir(), 'shiguang-native-repeat-'));
  const local = join(root, 'local');
  const data = join(root, 'data');
  await mkdir(local, { recursive: true });
  await mkdir(data, { recursive: true });
  for (const name of ['segment', 'cutout', 'material-palette', 'clean-paper']) {
    await writeFile(join(local, name), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  }
  await writeFile(join(data, 'material-jobs.json'), JSON.stringify([{
    id: 'job-2', manualOnly: false, mode: 'auto', engine: 'Vision', items: [],
  }]));
  const first = await prepareNativeImageTools({ root, dataDir: data, platformName: 'darwin', archName: 'arm64' });
  const second = await prepareNativeImageTools({ root, dataDir: data, platformName: 'darwin', archName: 'arm64' });
  assert.equal(first.segment, true);
  assert.equal(second.segment, true);
  assert.equal(first.upgradedJobs, false);
  assert.equal(second.upgradedJobs, false);
});

test('does not falsely enable macOS native tools on unsupported architectures', async () => {
  const root = await mkdtemp(join(tmpdir(), 'shiguang-native-x64-'));
  const result = await prepareNativeImageTools({ root, platformName: 'darwin', archName: 'x64' });
  assert.equal(result.segment, false);
  assert.equal(result.upgradedJobs, false);
});

test('recovered Pinterest job makes the current Continue Recognition button eligible', () => {
  const { jobs } = upgradeManualMaterialJobs([{
    id: 'job-continue',
    manualOnly: true,
    mode: 'manual',
    engine: 'Pinterest 原图 · 手动裁切',
    sourceMeta: { type: 'pinterest' },
    items: [],
  }]);
  const job = jobs[0];
  const busy = false;
  const continueDisabled = busy || !job || !!job.manualOnly;
  assert.equal(continueDisabled, false);
});
