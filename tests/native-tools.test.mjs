import test from 'node:test';
import assert from 'node:assert/strict';
import { upgradeManualMaterialJobs } from '../local/native-tools.mjs';

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

test('leaves already automatic jobs unchanged', () => {
  const input = [{ id: 'job-2', manualOnly: false, mode: 'auto', engine: 'Vision' }];
  const result = upgradeManualMaterialJobs(input);
  assert.equal(result.changed, false);
  assert.deepEqual(result.jobs, input);
});
