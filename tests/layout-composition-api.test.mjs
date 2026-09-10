import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {startTestServer} from './test-server.mjs';
import {regenerateSpread} from '../lib/journal.ts';

const {base} = await startTestServer(test);
let omit = false, requestedPlan;
const mock = http.createServer(async (req, res) => {
  let raw = '';
  for await (const part of req) raw += part;
  const request = JSON.parse(raw);
  const system = request.messages[0].content;
  const input = JSON.parse(request.messages[1].content);
  let output;
  if (system.includes('preset 选择')) output = {preset: 'quiet', primarySide: 'right', density: 'sparse', concept: '右页日记，左页留白', palette: ['#756650']};
  else {
    requestedPlan = input.compositionPlan;
    output = {theme: 'archive', days: [], elements: input.elements.filter(p => !(omit && p.role === 'body')).map(p => ({kind: p.kind, sourceId: p.id, region: 'writing', x: 5, y: 5, w: 35, fontSize: p.role === 'title' ? 28 : 18, frame: 'plain'}))};
  }
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({choices: [{message: {content: JSON.stringify(output)}}]}));
});
mock.listen(0, '127.0.0.1');
await once(mock, 'listening');
test.after(() => new Promise(resolve => mock.close(resolve)));
const call = async (path, data, method = 'POST') => {
  const response = await fetch(base + path, data === undefined ? {} : {method, headers: {'content-type': 'application/json'}, body: JSON.stringify(data)});
  return {status: response.status, data: await response.json()};
};

test('AI composition request -> preview -> application -> save/read retains content; invalid output never changes saved data', async () => {
  await call('/api/settings', {baseUrl: `http://127.0.0.1:${mock.address().port}/v1`, model: 'layout-test', apiKey: 'isolated-test-key', vision: false}, 'PUT');
  const spread = {id: 'spread', theme: 'archive', days: [], elements: [
    {id: 'title', kind: 'text', role: 'title', text: '周末散步', x: 6, y: 8, w: 35, fontSize: 28, rotation: 0, locked: false},
    // Keep this fixture on the general composition path; short text now uses paper groups.
    {id: 'body', kind: 'text', role: 'body', text: '下午在公园散步，回来喝了一杯茶。'.repeat(6), x: 6, y: 30, w: 35, fontSize: 18, rotation: 0, locked: false},
  ]};
  const book = {id: 'book', month: '2026-09', title: '隔离排版测试', cover: 'walnut', spreads: [spread]};
  const saved = await call('/api/state', {revision: 0, books: [book]}, 'PUT');
  assert.equal(saved.status, 200);
  const before = (await call('/api/state')).data;
  const response = await call('/api/generate', {days: [], elements: spread.elements, ratio: 1.43});
  assert.equal(response.status, 200, JSON.stringify(response.data));
  assert.equal(requestedPlan.preset, 'quiet');
  assert.equal(requestedPlan.primarySide, 'right');
  assert.ok(response.data.elements.every(p => p.x > 50 && p.region === undefined));
  assert.deepEqual((await call('/api/state')).data, before, 'generation is only a preview');
  const applied = regenerateSpread(spread, response.data, []);
  assert.deepEqual(applied.elements.map(p => [p.id, p.text]), spread.elements.map(p => [p.id, p.text]));
  assert.equal((await call('/api/state', {revision: before.revision, books: [{...book, spreads: [applied]}]}, 'PUT')).status, 200);
  const persisted = (await call('/api/state')).data;
  assert.deepEqual(persisted.books[0].spreads[0], JSON.parse(JSON.stringify(applied)));
  omit = true;
  const invalid = await call('/api/generate', {days: [], elements: applied.elements});
  assert.equal(invalid.status, 502);
  assert.match(invalid.data.error, /遗漏/);
  assert.deepEqual((await call('/api/state')).data, persisted);
});
