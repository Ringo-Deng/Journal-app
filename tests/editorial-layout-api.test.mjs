import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {startTestServer} from './test-server.mjs';
import {regenerateSpread} from '../lib/journal.ts';
import {bounds, intersects} from '../lib/layout-safety.mjs';

const {base} = await startTestServer(test);
const ratio = 1.43;
const instruction = '高级感几何排版';
let failure, requestedPlan, stages = [], editorialMistake = false;
const mock = http.createServer(async (req, res) => {
  let raw = '';
  for await (const part of req) raw += part;
  const request = JSON.parse(raw);
  const system = request.messages[0].content;
  const input = JSON.parse(request.messages[1].content);
  let output;
  if (system.includes('私人手帐的内容编辑')) {
    stages.push('editorial');
    output = editorialMistake
      ? {mode: 'rewrite', requirements: {paragraphCount: 99, stickers: true}, paragraphs: [{text: '模型未经授权改写的内容。', sourceIds: ['body']}]}
      : {mode: 'preserve', requirements: {paragraphCount: null, framed: false, stickers: false}, paragraphs: []};
  } else if (system.includes('preset 选择')) {
    stages.push('art');
    // Deliberately return the old diary preset: the explicit instruction must win.
    output = {preset: 'quiet', primarySide: 'right', density: 'sparse', concept: '大标题与几何留白', palette: ['#de5b47', '#203b3a']};
  } else if (system.includes('手帐拼贴选材师')) {
    stages.push('paper-group');
    output = {};
  } else {
    stages.push('layout');
    requestedPlan = input.compositionPlan;
    output = {theme: 'archive', layout: 'airy', days: [], elements: [
      ...input.elements.filter(p => p.kind === 'text' && !p.locked && !(failure === 'missing-content' && p.role === 'body')).map(p => ({
        kind: 'text', sourceId: p.id, x: 6, y: p.role === 'title' ? 12 : 36, w: 35,
        fontSize: p.role === 'title' ? 36 : 18, fontFamily: p.role === 'title' ? 'sans' : 'serif',
        fontWeight: p.role === 'title' ? 700 : 400, color: '#203b3a', textAlign: 'left', frame: 'plain',
      })),
      {kind: 'doodle', motif: 'editorial-rect', x: 61, y: 12, w: 15, h: 15, color: '#de5b47'},
      {kind: 'doodle', motif: 'editorial-circle', x: 77, y: 36, w: 12, h: 4, color: failure === 'invalid-geometry' ? 'url(https://example.invalid/fill)' : '#203b3a'},
      {kind: 'doodle', motif: 'editorial-line', x: 60, y: 60, w: 19, h: 0.8, color: '#203b3a'},
      {kind: 'doodle', motif: 'editorial-semicircle', x: 61, y: 77, w: 15, h: 4, color: '#de5b47'},
    ]};
  }
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({choices: [{message: {content: JSON.stringify(output)}}]}));
});
mock.listen(0, '127.0.0.1');
await once(mock, 'listening');
test.after(() => new Promise(resolve => mock.close(resolve)));

const call = async (path, data, method = 'POST') => {
  const response = await fetch(base + path, data === undefined ? {} : {
    method, headers: {'content-type': 'application/json'}, body: JSON.stringify(data),
  });
  return {status: response.status, data: await response.json()};
};
const generate = (elements, requestedInstruction=instruction) => {
  stages = [];
  return call('/api/generate', {days: [], elements, instruction:requestedInstruction, ratio});
};

test('editorial instruction keeps short writing out of paper groups and preserves geometry through apply/save/read', async t => {
  const settings = await call('/api/settings', {
    baseUrl: `http://127.0.0.1:${mock.address().port}/v1`, model: 'editorial-test', apiKey: 'isolated-test-key', vision: false,
  }, 'PUT');
  assert.equal(settings.status, 200);
  const spread = {id: 'spread', theme: 'archive', days: [], elements: [
    {id: 'title', kind: 'text', role: 'title', text: '海边小记', x: 6, y: 8, w: 35, fontSize: 28, rotation: 0, locked: false},
    {id: 'body', kind: 'text', role: 'body', text: '今天去海边玩耍了。', x: 6, y: 30, w: 35, fontSize: 18, rotation: 0, locked: false},
  ]};
  const book = {id: 'book', month: '2026-09', title: '隔离几何排版测试', cover: 'walnut', spreads: [spread]};
  assert.equal((await call('/api/state', {revision: 0, books: [book]}, 'PUT')).status, 200);
  let persisted = (await call('/api/state')).data;
  let applied;

  await t.test('explicit style overrides quiet without relying on a locked element', async () => {
    const response = await generate(spread.elements);
    assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.deepEqual(stages, ['editorial', 'art', 'layout']);
    assert.equal(requestedPlan.preset, 'free');
    assert.deepEqual(requestedPlan.regions, []);
    assert.equal(response.data.contentEdited, false);
    assert.deepEqual((await call('/api/state')).data, persisted, 'generation only creates a preview');

    const pieces = response.data.elements;
    const title = pieces.find(p => p.sourceId === 'title');
    const body = pieces.find(p => p.sourceId === 'body');
    assert.equal(title.text, spread.elements[0].text);
    assert.equal(body.text, spread.elements[1].text);
    assert.equal(title.fontSize, 36);
    assert.equal(title.fontFamily, 'sans');
    assert.equal(body.fontSize, 18);
    assert.equal(body.fontFamily, 'serif');
    assert.equal(title.x, 6, 'quiet must not move the title to its right-page writing region');
    const geometry = pieces.filter(p => p.kind === 'doodle');
    assert.deepEqual(geometry.map(p => p.doodleMotif), ['editorial-rect', 'editorial-circle', 'editorial-line', 'editorial-semicircle']);
    assert.ok(geometry.every(p => p.drawing?.length && p.drawing.every(layer => typeof layer.path === 'string')));
    assert.ok(geometry.every(p => [title, body].every(text => !intersects(bounds(p, ratio), bounds(text, ratio)))));
    const circle = geometry.find(p => p.doodleMotif === 'editorial-circle');
    assert.ok(Math.abs(circle.h / circle.w - ratio) < 1e-10, 'circle dimensions account for the spread aspect ratio');
    assert.ok(pieces.every(p => p.kind !== 'asset' && !p.groupId), 'no fallback paper or automatic collage group');

    applied = regenerateSpread(spread, response.data, []);
    assert.deepEqual(applied.elements.filter(p => p.kind === 'text').map(p => [p.id, p.text]), spread.elements.map(p => [p.id, p.text]));
    assert.deepEqual(applied.elements.filter(p => p.kind === 'doodle').map(p => p.drawing), geometry.map(p => p.drawing));
    assert.equal((await call('/api/state', {revision: persisted.revision, books: [{...book, spreads: [applied]}]}, 'PUT')).status, 200);
    persisted = (await call('/api/state')).data;
    assert.deepEqual(persisted.books[0].spreads[0], JSON.parse(JSON.stringify(applied)));
  });

  await t.test('another preview and application leave an existing locked group intact', async () => {
    const locked = [
      {id: 'manual-note', kind: 'text', role: 'decor', text: '手动保留的小角落', x: 7, y: 75, w: 24, fontSize: 16, rotation: 0, locked: true, groupId: 'manual-group'},
      {id: 'manual-mark', kind: 'doodle', path: 'M4 50 L96 50', x: 35, y: 77, w: 8, h: 10, rotation: 0, color: '#7c6650', locked: true, groupId: 'manual-group'},
    ];
    const protectedSpread = {...applied, elements: [...applied.elements, ...locked]};
    assert.equal((await call('/api/state', {revision: persisted.revision, books: [{...book, spreads: [protectedSpread]}]}, 'PUT')).status, 200);
    persisted = (await call('/api/state')).data;
    const response = await generate(protectedSpread.elements);
    assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.deepEqual(stages, ['editorial', 'art', 'layout']);
    assert.deepEqual((await call('/api/state')).data, persisted);
    applied = regenerateSpread(protectedSpread, response.data, []);
    assert.deepEqual(applied.elements.filter(p => p.groupId === 'manual-group'), locked);
    assert.deepEqual(applied.elements.filter(p => ['title', 'body'].includes(p.id)).map(p => [p.id, p.text]), spread.elements.map(p => [p.id, p.text]));
    assert.equal((await call('/api/state', {revision: persisted.revision, books: [{...book, spreads: [applied]}]}, 'PUT')).status, 200);
    persisted = (await call('/api/state')).data;
    assert.deepEqual(persisted.books[0].spreads[0], JSON.parse(JSON.stringify(applied)));
  });

  await t.test('an erroneous model rewrite proposal cannot replace preserved wording or source ids', async () => {
    editorialMistake = true;
    try {
      const response = await generate(spread.elements, '保留原文和原有素材，用清晰的阅读顺序排在两页上，正文易读，少量装饰，采用高级感几何排版。');
      assert.equal(response.status, 200, JSON.stringify(response.data));
      assert.deepEqual(stages, ['editorial', 'art', 'layout'], 'invented paragraph and sticker requirements must not cause retries');
      assert.equal(response.data.contentEdited, false);
      const preview = regenerateSpread(spread, response.data, []);
      assert.deepEqual(preview.elements.filter(p=>p.kind==='text').map(p=>[p.id,p.text]), spread.elements.map(p=>[p.id,p.text]));
      assert.deepEqual((await call('/api/state')).data, persisted, 'rejected rewriting leaves saved content untouched');
    } finally { editorialMistake = false; }
  });

  for (const [mode, message] of [['missing-content', /遗漏/], ['invalid-geometry', /颜色|色值|几何/]]) {
    await t.test(`${mode} is rejected without changing saved writing or locked groups`, async () => {
      failure = mode;
      const response = await generate(applied.elements);
      assert.equal(response.status, 502, JSON.stringify(response.data));
      assert.match(response.data.error, message);
      assert.deepEqual(stages, ['editorial', 'art', 'layout', 'layout'], 'invalid output is retried only on the general layout path');
      assert.deepEqual((await call('/api/state')).data, persisted);
    });
  }
});
