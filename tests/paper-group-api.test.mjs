import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import sharp from 'sharp';
import {startTestServer} from './test-server.mjs';
import {regenerateSpread} from '../lib/journal.ts';
import {bounds, intersects, layoutIssues} from '../lib/layout-safety.mjs';
import {referenceLayoutGuide} from '../local/reference-layout-guide.mjs';

const {base, dir} = await startTestServer(test);
const requests = [];
const mockErrors = [];
let mode = 'valid';
let libraryAssets = [];
const mock = http.createServer(async (req, res) => {
  try {
    let raw = '';
    for await (const part of req) raw += part;
    const request = JSON.parse(raw);
    const payload = JSON.parse(request.messages[1].content);
    const captured = {system: request.messages[0].content, payload, messages: request.messages};
    requests.push(captured);
    assert.ok(Array.isArray(payload.candidates), 'short writing must use the material-selection route');
    const paperCandidates = payload.candidates.filter(a => a.paper === true);
    const backPaper = paperCandidates.find(a => {
      const source = libraryAssets.find(s => s.id === a.id);
      return source?.height / source?.width >= 0.6 && source.height / source.width <= 1.2;
    }) || paperCandidates[0];
    assert.ok(backPaper, 'the material shortlist must include a real paper candidate');
    const picks = payload.candidates.filter(a => a.paper !== true && !/邮票|stamp/i.test(a.category + ' ' + a.name)).slice(0, 2);
    assert.equal(picks.length, 2);
    const output = {
      palette: {backPaper: '#b9dce9', frontPaper: '#fff8e8', ink: '#344b61', tape: '#e8a26b'},
      writing: {shape: mode === 'invalid-writing' ? 'unknown-shape' : 'ticket', pattern: 'plain', width: 24, align: 'left'},
      papers: [{assetIndex: backPaper.index, position: 'top', width: 22, rotation: -4}],
      stickers: mode === 'null-selection' ? [null] : picks.map((a, i) => ({slot: i ? 'accent' : 'hero', assetIndex: a.index, width: i ? 4 : 6})),
      tapes: [],
    };
    if (mode === 'missing-writing') delete output.writing;
    if (mode === 'missing-papers') delete output.papers;
    captured.selection = output;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({choices: [{message: {content: JSON.stringify(output)}}]}));
  } catch (error) {
    mockErrors.push(error);
    res.writeHead(500, {'content-type': 'application/json'});
    res.end(JSON.stringify({error: 'Unexpected isolated test request'}));
  }
});
mock.listen(0, '127.0.0.1');
await once(mock, 'listening');
test.after(() => new Promise(resolve => mock.close(resolve)));

const call = async (path, data, method = 'POST') => {
  const response = await fetch(base + path, data === undefined ? {} : {method, headers: {'content-type': 'application/json'}, body: JSON.stringify(data)});
  return {status: response.status, data: await response.json()};
};

test('short-entry API uses a real backing paper and selected writing shape while preserving content across preview, save and rejected selections', async () => {
  const settings = await call('/api/settings', {baseUrl: `http://127.0.0.1:${mock.address().port}/v1`, model: 'paper-group-test', apiKey: 'isolated-test-key', vision: false}, 'PUT');
  assert.equal(settings.status, 200);
  const library = await call('/api/materials');
  assert.equal(library.status, 200);
  libraryAssets = library.data;
  const photoFile = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8/x8AAwMCAO+/l1cAAAAASUVORK5CYII=', 'base64');
  await mkdir(join(dir, 'uploads'), {recursive: true});
  await writeFile(join(dir, 'uploads/manual-photo.png'), photoFile);
  const writing = [
    {id: 'title', kind: 'text', role: 'title', text: '海边小记', x: 6, y: 8, w: 32, fontSize: 24, rotation: 0, locked: false},
    {id: 'body', kind: 'text', role: 'body', text: '下午沿沙滩散步，坐在岸边看夕阳。', x: 6, y: 24, w: 32, fontSize: 18, rotation: 0, locked: false, colorRuns: [{start: 0, end: 2, color: '#345678'}]},
  ];
  const manual = [
    {id: 'manual-photo', kind: 'photo', src: '/uploads/manual-photo.png', x: 64, y: 14, w: 23, h: 23, rotation: 2, locked: true, groupId: 'manual-group', crop: 37, cropY: 43, cropZoom: 1.2},
    {id: 'manual-caption', kind: 'text', role: 'decor', text: '手动保留的照片说明', x: 64, y: 43, w: 25, fontSize: 16, rotation: 0, locked: true, groupId: 'manual-group'},
  ];
  const spread = {id: 'spread', theme: 'archive', days: [], elements: [...writing, ...manual]};
  const book = {id: 'book', month: '2026-09', title: '隔离短文拼贴测试', cover: 'walnut', spreads: [spread]};
  const saved = await call('/api/state', {revision: 0, books: [book]}, 'PUT');
  assert.equal(saved.status, 200);
  const before = (await call('/api/state')).data;
  const sourceCopy = structuredClone(spread);
  const input = {days: [], elements: spread.elements, ratio: 1.43};
  const generated = await call('/api/generate', input);
  assert.equal(generated.status, 200, JSON.stringify(generated.data));
  assert.deepEqual(mockErrors, []);
  assert.equal(requests.length, 1, 'a valid reference selection should not retry or use another design route');
  assert.ok(requests[0].system.includes(referenceLayoutGuide));
  assert.deepEqual(requests[0].payload.text, writing.map(p => p.text));
  assert.equal(generated.data.headerReserved, true);
  assert.deepEqual(generated.data.elements.filter(p => p.kind === 'text').map(p => [p.sourceId, p.text]), writing.map(p => [p.id, p.text]));
  assert.ok(generated.data.elements.filter(p => p.kind === 'text').every(p => p.textAlign === 'left'));
  assert.equal(generated.data.elements.filter(p => p.assetId && p.frame !== 'collage-paper').length, 2);
  assert.equal(generated.data.elements.filter(p => p.material === 'tape').length, 0, 'an empty tape selection must not add fixed tape strips');
  assert.equal(new Set(generated.data.elements.map(p => p.groupId)).size, 1);
  assert.deepEqual(layoutIssues(generated.data.elements, 1.43), []);
  assert.ok(generated.data.elements.every(p => manual.every(m => !intersects(bounds(p, 1.43), bounds(m, 1.43)))));
  assert.deepEqual((await call('/api/state')).data, before, 'generation is only a preview');

  const papers = generated.data.elements.filter(p => p.frame === 'collage-paper');
  assert.equal(papers.length, 2);
  const chosenPaper = requests[0].payload.candidates.find(a => a.index === requests[0].selection.papers[0].assetIndex);
  assert.equal(chosenPaper.paper, true);
  const originalPaper = libraryAssets.find(a => a.id === chosenPaper.id);
  assert.ok(originalPaper);
  const realPaper = papers.find(p => p.assetId === originalPaper.id);
  assert.ok(realPaper, 'the chosen paper must remain a backing layer rather than a small sticker');
  assert.equal(realPaper.src, originalPaper.src);
  const realPaperResponse = await fetch(base + realPaper.src);
  assert.equal(realPaperResponse.status, 200);
  const realPaperBytes = Buffer.from(await realPaperResponse.arrayBuffer());
  const metadata = await sharp(realPaperBytes).metadata();
  assert.ok(Math.abs(realPaper.h / realPaper.w - metadata.height / metadata.width * input.ratio) < 1e-9, 'real paper keeps its original image proportions');
  const originalPaperBytes = await readFile(originalPaper.src.startsWith('/uploads/') ? join(dir, originalPaper.src) : new URL('../public' + originalPaper.src, import.meta.url));
  assert.deepEqual(realPaperBytes, originalPaperBytes);
  assert.equal(generated.data.elements.filter(p => p.assetId === originalPaper.id).length, 1);

  const writingPaper = papers.at(-1);
  assert.equal(writingPaper.assetId, undefined);
  assert.match(writingPaper.src, /^\/uploads\/.*\.png$/);
  const png = await readFile(join(dir, writingPaper.src));
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const served = await fetch(base + writingPaper.src);
  assert.equal(served.status, 200, 'the chosen writing shape is rendered to a file usable by the saved page');
  assert.deepEqual(Buffer.from(await served.arrayBuffer()), png);
  const diagnostic = JSON.parse(await readFile(join(dir, 'ai-last-result.json'), 'utf8'));
  assert.equal(diagnostic.paperCount, 2);
  assert.equal(diagnostic.realPaperCount, 1);
  assert.equal(diagnostic.writingShape, 'ticket');
  assert.equal(diagnostic.stickerCount, 2);

  const applied = regenerateSpread(spread, generated.data, []);
  assert.deepEqual(spread, sourceCopy, 'applying a preview does not mutate its source spread');
  for (const original of writing) {
    const kept = applied.elements.find(p => p.id === original.id);
    assert.equal(kept.text, original.text);
    assert.deepEqual(kept.colorRuns, original.colorRuns);
  }
  for (const original of manual) assert.deepEqual(applied.elements.find(p => p.id === original.id), original);
  assert.equal((await call('/api/state', {revision: before.revision, books: [{...book, spreads: [applied]}]}, 'PUT')).status, 200);
  const persisted = (await call('/api/state')).data;
  assert.deepEqual(persisted.books[0].spreads[0], JSON.parse(JSON.stringify(applied)));

  for (const failure of ['invalid-writing', 'null-selection', 'missing-writing', 'missing-papers']) {
    mode = failure;
    const requestCount = requests.length;
    // Use the ungrouped source input again, since the applied text now belongs to a preserved group.
    const rejected = await call('/api/generate', input);
    assert.equal(rejected.status, 502, JSON.stringify(rejected.data));
    assert.match(rejected.data.error, /原有手帐未改动/);
    assert.equal(requests.length - requestCount, 2, `${failure} should retry once before rejecting`);
    assert.match(requests.at(-1).messages.at(-1).content, /纸张设计未通过检查/);
    assert.deepEqual((await call('/api/state')).data, persisted, `${failure} must leave the saved page unchanged`);
  }
  assert.deepEqual(await readFile(join(dir, 'uploads/manual-photo.png')), photoFile);
  assert.deepEqual(mockErrors, []);
});
