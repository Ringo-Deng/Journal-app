import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './test-server.mjs';

const { base } = await startTestServer(test);
const validate = async (highlightRuns, kind = 'text') => {
  const element = {
    id: 'writing', kind, text: '洱海的风', x: 5, y: 8, w: 30, rotation: 0,
    locked: false, highlightRuns,
  };
  const response = await fetch(`${base}/api/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      revision: 0,
      books: [{
        id: 'book', month: '2026-09', title: '旅行', cover: 'linen-oat',
        spreads: [{ id: 'spread', theme: 'rose', days: [], elements: [element] }],
      }],
    }),
  });
  return response.status;
};

test('journal validation accepts bounded highlighter ranges', async () => {
  assert.equal(await validate([{ start: 0, end: 2, color: '#f2d45c' }]), 200);
});

test('journal validation rejects unsafe highlighter ranges', async () => {
  assert.equal(await validate([{ start: -1, end: 2, color: '#f2d45c' }]), 400);
  assert.equal(await validate([{ start: 0, end: 20, color: '#f2d45c' }]), 400);
  assert.equal(await validate([{ start: 0, end: 2, color: 'yellow' }]), 400);
  assert.equal(await validate([{ start: 0, end: 2, color: '#f2d45c' }], 'photo'), 400);
  assert.equal(await validate(Array.from({ length: 101 }, () => ({ start: 0, end: 1, color: '#f2d45c' }))), 400);
});
