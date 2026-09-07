import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newBook,
  appendDay,
  localResult,
  regenerateSpread,
  pieceKey,
} from '../lib/journal.ts';
const assets = [
  { id: 'a', src: '/materials/a.jpg', category: '植物' },
  { id: 'b', src: '/materials/b.jpg', category: '邮票' },
  { id: 'c', src: '/materials/c.jpg', category: '纸张' },
];
const day = (date, raw = '今天下雨，喝了拿铁。') => ({
  id: date,
  date,
  raw,
  text: raw,
  title: '今天',
  photos: [],
});
test('multiple entries and repeated dates share a spread without automatically adding pages', () => {
  let b = newBook('2026-09');
  b = appendDay(
    b,
    day('2026-09-01'),
    localResult([day('2026-09-01')], 'rose'),
    assets,
  );
  const left = structuredClone(b.spreads[0].elements);
  b = appendDay(
    b,
    day('2026-09-03'),
    localResult([day('2026-09-03')], 'archive'),
    assets,
  );
  assert.equal(b.spreads.length, 1);
  assert.equal(b.spreads[0].theme, 'rose');
  assert.deepEqual(b.spreads[0].elements.slice(0, left.length), left);
  b = appendDay(
    b,
    day('2026-09-04'),
    localResult([day('2026-09-04')], 'archive'),
    assets,
  );
  assert.equal(b.spreads.length, 1);
  b = appendDay(b, day('2026-09-03'), localResult([day('2026-09-03')]), assets);
  assert.equal(b.spreads[0].days.length, 4);
  assert.throws(
    () =>
      appendDay(b, day('2026-10-01'), localResult([day('2026-10-01')]), assets),
    /月份/,
  );
});
test('regeneration preserves manually edited text, transform, source and deletion', () => {
  const b = appendDay(
    newBook('2026-09'),
    day('2026-09-01'),
    localResult([day('2026-09-01')]),
    assets,
  );
  const s = b.spreads[0];
  const body = s.elements.find((p) => p.role === 'body');
  body.text = '我亲手改过的句子';
  body.x = 11;
  body.rotation = 9;
  body.locked = true;
  s.days[0].text = body.text;
  const deleted = {
    id: 'deleted-sticker',
    kind: 'asset',
    assetId: 'b',
    src: '/materials/b.jpg',
    x: 4,
    y: 70,
    w: 14,
    rotation: 0,
    locked: false,
  };
  s.elements.push(deleted);
  s.removed = [pieceKey(deleted)];
  s.elements = s.elements.filter((p) => p.id !== deleted.id);
  const result = regenerateSpread(
    s,
    {
      theme: 'rose',
      days: [{ title: '新的标题', text: 'AI 不应覆盖此内容', assetIds: ['b'] }],
    },
    assets,
    3,
  );
  assert.deepEqual(
    result.elements.find((p) => p.id === body.id),
    body,
  );
  assert.equal(result.days[0].text, body.text);
  assert.equal(result.elements.filter((p) => p.role === 'body').length, 1);
  assert.equal(
    result.elements.some((p) => pieceKey(p) === pieceKey(deleted)),
    false,
  );
});
test('local layout preserves source text without invented events', () => {
  const raw = '下雨。';
  assert.equal(localResult([{ raw }]).days[0].text, raw);
});
test('paper style and color persist independently of AI and default to white blank pages', async () => {
  const { paperSettings, applyPaper } = await import('../lib/journal.ts');
  let b = newBook('2026-09');
  assert.deepEqual(paperSettings(b), { style: 'blank', color: '#ffffff' });
  b = applyPaper(b, 'dots', '#e8eef5');
  b = appendDay(b, day('2026-09-01'), localResult([day('2026-09-01')]), assets);
  assert.deepEqual(paperSettings(b, b.spreads[0]), {
    style: 'dots',
    color: '#e8eef5',
  });
  b = applyPaper(b, 'grid', '#fffdf4', b.spreads[0].id);
  const s = regenerateSpread(
    b.spreads[0],
    localResult(b.spreads[0].days, 'rose'),
    assets,
  );
  assert.deepEqual(paperSettings(b, s), { style: 'grid', color: '#fffdf4' });
  assert.ok(!s.elements.some((p) => p.role === 'date'));
  b = applyPaper(b, 'blank', '#ffffff');
  assert.deepEqual(paperSettings(b, b.spreads[0]), {
    style: 'blank',
    color: '#ffffff',
  });
  assert.throws(() => applyPaper(b, 'grid', 'bad'));
});

test('new entries and local regeneration never inject default stickers', () => {
  const d = day('2026-09-01');
  const b = appendDay(newBook('2026-09'), d, localResult([d]), assets);
  assert.equal(
    b.spreads[0].elements.filter((p) => p.kind === 'asset').length,
    0,
  );
  const regenerated = regenerateSpread(b.spreads[0], localResult([d]), assets);
  assert.equal(
    regenerated.elements.filter((p) => p.kind === 'asset').length,
    0,
  );
  const ai = appendDay(
    newBook('2026-09'),
    d,
    { theme: 'rose', days: [{ title: '日常', text: d.raw, assetIds: ['a'] }] },
    assets,
  );
  assert.deepEqual(
    ai.spreads[0].elements
      .filter((p) => p.kind === 'asset')
      .map((p) => p.assetId),
    ['a'],
  );
});
