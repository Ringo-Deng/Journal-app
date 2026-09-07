import test from 'node:test';
import assert from 'node:assert/strict';
import { nextMaterialStrategy } from '../lib/material-retry.mjs';

test('first material recognition keeps the cheap requested strategy', () => {
  assert.deepEqual(
    nextMaterialStrategy({ requestedMode: 'auto', tolerance: 28 }),
    { mode: 'auto', tolerance: 28, attempt: 1 },
  );
});

test('second recognition switches away from the previous strategy', () => {
  assert.deepEqual(
    nextMaterialStrategy({
      requestedMode: 'auto',
      tolerance: 28,
      continuing: true,
      previous: { attempt: 1, strategy: 'paper', engine: '边缘连通纸底分离', mode: 'auto' },
    }),
    { mode: 'ai', tolerance: 28, attempt: 2 },
  );
  assert.deepEqual(
    nextMaterialStrategy({
      requestedMode: 'auto',
      tolerance: 28,
      continuing: true,
      previous: { attempt: 1, strategy: 'ai', engine: '本机 AI 主体识别', mode: 'auto' },
    }),
    { mode: 'paper', tolerance: 28, attempt: 2 },
  );
});

test('third and later recognition progressively strengthens the cheap paper pass', () => {
  assert.deepEqual(
    nextMaterialStrategy({
      requestedMode: 'auto',
      tolerance: 28,
      continuing: true,
      previous: { attempt: 2, strategy: 'ai', engine: '本机 AI 主体识别', mode: 'auto' },
    }),
    { mode: 'paper', tolerance: 40, attempt: 3 },
  );
  assert.deepEqual(
    nextMaterialStrategy({
      requestedMode: 'auto',
      tolerance: 28,
      continuing: true,
      previous: { attempt: 3, strategy: 'paper', engine: '边缘连通纸底分离', mode: 'auto' },
    }),
    { mode: 'paper', tolerance: 52, attempt: 4 },
  );
});

test('explicitly changing the mode wins over automatic retry switching', () => {
  assert.deepEqual(
    nextMaterialStrategy({
      requestedMode: 'dense',
      tolerance: 31,
      continuing: true,
      previous: { attempt: 1, strategy: 'paper', engine: '边缘连通纸底分离', mode: 'auto' },
    }),
    { mode: 'dense', tolerance: 31, attempt: 2 },
  );
});
