import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {startTestServer} from './test-server.mjs';
import {regenerateSpread} from '../lib/journal.ts';

const {base, dir} = await startTestServer(test);
const requests = [], mockErrors = [];
let omit = false;
const mock = http.createServer(async (req, res) => {
  try {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const request = JSON.parse(raw), system = request.messages[0].content;
    const input = JSON.parse(request.messages[1].content);
    requests.push({system, input});
    let output;
    if (system.includes('preset 选择')) output = {preset: 'free', density: 'balanced', palette: ['#345678'], concept: '保留原有材料并整理正文'};
    else if (system.includes('私人手帐的内容编辑')) output = {mode: 'preserve', requirements: {}, paragraphs: []};
    else {
      assert.ok(input.preservedUnits?.length, 'the model receives geometric descriptions of retained units');
      assert.ok(input.preservedUnits.every(unit => !('text' in unit) && !('src' in unit)));
      assert.ok(!input.elements.some(p => ['manual-asset', 'manual-doodle', 'group-photo', 'group-caption'].includes(p.id)), 'retained originals stay outside the model rewrite list');
      output = {theme: 'archive', layout: 'collage', days: [], elements: omit
        ? [{kind: 'text', text: '不能代替原文', role: 'title', x: 5, y: 14, w: 30}]
        : input.requiredSources.map(p => ({kind: p.kind, sourceId: p.sourceId, x: 5, y: 16, w: 40, fontSize: 18, frame: 'plain', fontFamily: 'pen'}))};
      // Models may echo fixed input, including a hidden full-page material; it is never a new obstacle.
      output.elements.push(...input.elements.filter(p => p.locked).map(p => ({...p, sourceId: p.id})));
      // Retained user materials can be echoed without a usable assetId; restore the original locally.
      output.elements.push({kind:'asset',sourceId:'manual-asset',assetId:'invented-material',x:80,y:80,w:10});
      if(!omit)output.elements.push(...input.requiredSources.map(p=>({kind:p.kind,sourceId:p.sourceId,text:'不能用重复引用改写原文',x:65,y:24,w:8})));
    }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({choices: [{message: {content: JSON.stringify(output)}}]}));
  } catch (error) {
    mockErrors.push(error.message);
    res.writeHead(500, {'content-type': 'application/json'});
    res.end(JSON.stringify({error: 'isolated mock assertion failed'}));
  }
});
mock.listen(0, '127.0.0.1');
await once(mock, 'listening');
test.after(() => new Promise(resolve => mock.close(resolve)));

const call = async (path, data, method = 'POST') => {
  const response = await fetch(base + path, data === undefined ? {} : {method, headers: {'content-type': 'application/json'}, body: JSON.stringify(data)});
  return {status: response.status, data: await response.json()};
};
const same = (actual, original) => {
  for (const key of Object.keys(original)) assert.deepEqual(actual[key], original[key], `${original.id}.${key}`);
};
const translationOnly = (actual, original, dx, dy) => same(actual, {...original, x: original.x + dx, y: original.y + dy});

test('redesign retains manual assets and whole groups through repeated previews, application and saved reload; rejected output is harmless', async () => {
  const settings = await call('/api/settings', {baseUrl: `http://127.0.0.1:${mock.address().port}/v1`, model: 'retained-context-test', apiKey: 'isolated-test-key', vision: false}, 'PUT');
  assert.equal(settings.status, 200);
  const library = (await call('/api/materials')).data;
  const material = library.find(p => p.src.startsWith('/materials/'));
  assert.ok(material);
  const photo = '/uploads/context-photo.png';
  await mkdir(join(dir, 'uploads'), {recursive: true});
  await writeFile(join(dir, photo), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8/x8AAwMCAO+/l1cAAAAASUVORK5CYII=', 'base64'));
  const a = (id, extra = {}) => ({id, kind: 'asset', assetId: material.id, src: material.src, x: 62, y: 15, w: 8, h: 9, rotation: 0, locked: false, ...extra});
  const t = (id, extra = {}) => ({id, kind: 'text', role: 'body', text: '手动写下的原文。', x: 12, y: 39, w: 22, fontSize: 16, fontFamily: 'pen', lineHeight: 1.5, rotation: 0, locked: false, ...extra});
  const group = [
    a('group-paper', {groupId: 'my-collage', frame: 'collage-paper', x: 7, y: 12, w: 32, h: 41, stackOrder: 2, opacity: .82}),
    {id: 'group-photo', kind: 'photo', groupId: 'my-collage', src: photo, photoOriginal: photo, x: 12, y: 18, w: 21, h: 16, rotation: -2, locked: false, crop: 34, cropY: 63, cropZoom: 1.7, frame: 'plain', flipX: true, stackOrder: 5},
    t('group-caption', {groupId: 'my-collage', colorRuns: [{start: 0, end: 2, color: '#456789'}], highlightRuns: [{start: 2, end: 4, color: '#ffeedd'}], stackOrder: 10}),
  ];
  const manual = [
    a('manual-asset', {layerName: '自己挑选的素材', opacity: .6, flipY: true}),
    {id: 'manual-doodle', kind: 'doodle', x: 78, y: 15, w: 8, h: 9, rotation: 3, locked: false, color: '#654321', drawing: [{path: 'M0 0 L10 10', stroke: '#654321', width: 2}], opacity: .7},
  ];
  const fixed = [a('fixed-asset', {groupId: 'fixed-group', x: 65, y: 68, locked: true}), t('fixed-caption', {groupId: 'fixed-group', x: 62, y: 82, w: 22})];
  const hidden = a('hidden', {hidden: true, x: 0, y: 0, w: 100, h: 100});
  const free = t('free-writing', {x: 58, y: 35, w: 30, fontSize: 18, text: '下午沿着海边慢慢散步，回来整理今天的照片。'.repeat(9), colorRuns: [{start: 0, end: 2, color: '#678945'}]});
  // A deleted older instance of the same library material must not delete current instances again.
  let spread = {id: 'context-spread', theme: 'archive', layout: 'collage', days: [], removed: [material.id], elements: [...group, ...manual, ...fixed, hidden, free]};
  const book = {id: 'context-book', month: '2026-09', title: '隔离原素材保护测试', cover: 'walnut', spreads: [spread]};
  let state = (await call('/api/state', {revision: 0, books: [book]}, 'PUT')).data;
  assert.equal(state.revision, 1, JSON.stringify(state));

  for (let run = 0; run < 2; run++) {
    const before = (await call('/api/state')).data;
    const generated = await call('/api/generate', {days: [], elements: spread.elements, ratio: 1.43, headerSpace: 10});
    assert.equal(generated.status, 200, JSON.stringify({response: generated.data, mockErrors}));
    assert.equal(generated.data.headerReserved, true);
    assert.deepEqual(mockErrors, []);
    assert.deepEqual((await call('/api/state')).data, before, 'generation only builds a preview');
    const result = generated.data.elements;
    const moved = result.find(p => p.sourceId === group[0].id);
    assert.ok(moved, JSON.stringify({ids: result.map(p => ({id: p.id, sourceId: p.sourceId, groupId: p.groupId})), requests: requests.map(p => Object.keys(p.input))}));
    const dx = moved.x - group[0].x, dy = moved.y - group[0].y;
    if (!run) assert.ok(Math.abs(dx) + Math.abs(dy) > 1, 'an unlocked original group can really move to accommodate writing');
    for (const p of group) translationOnly(result.find(q => q.sourceId === p.id), p, dx, dy);
    for (const p of [...manual, ...fixed, hidden]) {
      const out = result.find(q => q.sourceId === p.id);
      assert.ok(out, p.id);
      if (fixed.includes(p) || p.hidden) same(out, p);
      else translationOnly(out, p, out.x - p.x, out.y - p.y);
    }
    assert.equal(result.find(p => p.sourceId === free.id).text, free.text);
    assert.deepEqual(new Set(result.map(p => p.sourceId)), new Set(spread.elements.map(p => p.id)));
    const originalSpread = structuredClone(spread);
    const sourceSpread = spread;
    spread = regenerateSpread(sourceSpread, generated.data, library);
    assert.deepEqual(sourceSpread, originalSpread, 'applying a preview must not mutate its source');
    assert.deepEqual(new Set(spread.elements.map(p => p.id)), new Set(originalSpread.elements.map(p => p.id)), 'distinct instances of the same material must survive application');
    assert.deepEqual(spread.elements.find(p => p.id === free.id).colorRuns, free.colorRuns);
    const saved = await call('/api/state', {revision: before.revision, books: [{...book, spreads: [spread]}]}, 'PUT');
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    state = (await call('/api/state')).data;
    assert.deepEqual(state.books[0].spreads[0], JSON.parse(JSON.stringify(spread)));
  }

  omit = true;
  const count = requests.length, beforeRejected = structuredClone(state);
  const rejected = await call('/api/generate', {days: [], elements: spread.elements, ratio: 1.43});
  assert.equal(rejected.status, 502, JSON.stringify(rejected.data));
  assert.match(rejected.data.error, /遗漏|完整/);
  assert.equal(requests.length - count, 3, 'one design brief and two rejected layout attempts');
  assert.deepEqual((await call('/api/state')).data, beforeRejected);
  assert.deepEqual(mockErrors, []);
  omit = false;

  const groupOnly = {...spread, elements: spread.elements.filter(p => p.id !== free.id)};
  const beforeLocal = requests.length;
  const local = await call('/api/generate', {days: [], elements: groupOnly.elements, ratio: 1.43});
  assert.equal(local.status, 200, JSON.stringify(local.data));
  assert.equal(requests.length, beforeLocal, 'existing groups/materials require no model call');
  assert.deepEqual(new Set(local.data.elements.map(p => p.sourceId)), new Set(groupOnly.elements.map(p => p.id)));
  const composed = await call('/api/generate', {days: [], elements: groupOnly.elements, ratio: 1.43, layoutIntent: 'compose'});
  assert.equal(composed.status, 200, JSON.stringify(composed.data));
  assert.equal(composed.data.unchanged, false, 'the one-click intent must visibly arrange existing movable groups');
  assert.equal(requests.length, beforeLocal, 'composing retained groups stays local');
  assert.deepEqual(new Set(composed.data.elements.map(p => p.sourceId)), new Set(groupOnly.elements.map(p => p.id)));
});
