import test from 'node:test';
import assert from 'node:assert/strict';
import {finishCollage} from '../local/collage-layout.mjs';
import {resolveComposition} from '../local/layout-composition.mjs';
import {layoutIssues} from '../lib/layout-safety.mjs';
import {validatePlan} from '../local/design-plan.mjs';
import {regenerateSpread} from '../lib/journal.ts';

const assets = Array.from({length: 7}, (_, i) => ({id: `flower-${i}`, src: `/f${i}.png`, name: '小花', width: 100, height: 100}));
const body = (text, i = 0) => ({kind: 'text', sourceId: `text-${i}`, role: 'body', text, x: i ? 56 : 5, y: 20, w: 34, fontSize: 18, rotation: 0});
const photo = i => ({kind: 'photo', sourceId: `photo-${i}`, src: `/photo-${i}.png`, x: 5, y: 10, w: 30, h: 25, rotation: 0, frame: 'plain', crop: 33, cropY: 44, cropZoom: 1.2});

test('free composition preserves a right-page design and does not fill blank space', () => {
  const input = [{...body('下午在公园散步。'), x: 58, y: 38, fontFamily: 'pen', frame: 'plain'}, {kind: 'text', role: 'title', text: '周末散步', x: 60, y: 12, w: 25, fontSize: 34, fontFamily: 'brush'}];
  const before = structuredClone(input);
  const out = finishCollage(input, {elements: [], instruction: '现代杂志风格，文字放右页，左页留白'}, assets, {preset: 'free'});
  assert.deepEqual(out, before);
  assert.deepEqual(input, before);
});

test('quiet composition follows the chosen side and flows text without restyling or adding a title', () => {
  const input = [body('一段独立的记录。'.repeat(3)), {...body('第二段较短。', 1), fontFamily: 'pen', frame: 'outline', paragraphIndex: 1}];
  const out = finishCollage(input, {elements: []}, assets, {preset: 'quiet', primarySide: 'right'});
  assert.equal(out.length, 2);
  assert.ok(out.every(p => p.x > 50));
  assert.ok(out[1].y > out[0].y + out[0].h);
  assert.deepEqual(out.map(p => [p.sourceId, p.text, p.fontSize, p.fontFamily, p.frame, p.paragraphIndex]), input.map(p => [p.sourceId, p.text, p.fontSize, p.fontFamily, p.frame, p.paragraphIndex]));
  assert.deepEqual(layoutIssues(out), []);
});

test('every supported composition handles its content with no overlap or lost references', () => {
  const samples = {
    quiet: [body('记录今天的小事。')],
    'photo-led': [photo(0), body('照片背后的故事。')],
    'photo-story': [photo(0), {...photo(1), region: 'photos'}, {...photo(2), region: 'photos'}, body('照片一。'), {...body('照片二。', 1), region: 'continuation'}],
    'travel-notes': [body('今天出发，乘车到达。'), photo(0), {...body('途中收集的票据。', 1), region: 'story'}],
    'long-read': Array.from({length: 4}, (_, i) => body('这是一段日记，保留原始的记录和顺序。'.repeat(4), i)),
  };
  for (const ratio of [1, 1.43, 1.8]) for (const [preset, input] of Object.entries(samples)) {
    const before = structuredClone(input);
    const out = finishCollage(input, {elements: input.map(p => ({...p, id: p.sourceId})), ratio}, assets, {preset});
    assert.deepEqual(input, before);
    assert.deepEqual(out.map(p => p.sourceId), input.map(p => p.sourceId));
    assert.deepEqual(layoutIssues(out, ratio), [], `${preset} at ${ratio}`);
    for (const p of out.filter(p => p.kind === 'photo')) {
      const original = input.find(q => q.sourceId === p.sourceId);
      assert.ok(Math.abs(p.h / p.w - original.h / original.w) < 1e-9);
      assert.deepEqual([p.crop, p.cropY, p.cropZoom], [33, 44, 1.2]);
    }
  }
});

test('long text flows to the second page in order; impossible content fails without mutation', () => {
  const ps = Array.from({length: 5}, (_, i) => body('这是一段记录。'.repeat(10), i));
  const out = finishCollage(ps, {elements: []}, [], {preset: 'long-read'});
  assert.ok(out.some(p => p.x > 50));
  const right = out.filter(p => p.x > 50);
  assert.deepEqual(right.map(p => p.sourceId), [...right].sort((a, b) => a.y - b.y).map(p => p.sourceId));
  const huge = [body('原文不能丢失。'.repeat(1000))];
  const before = structuredClone(huge);
  assert.throws(() => finishCollage(huge, {elements: []}, [], {preset: 'long-read'}), /无法.*排下/);
  assert.deepEqual(huge, before);
});

test('locked combinations bypass preset geometry and survive validation and application', () => {
  const lock = {...photo(0), id: 'locked', sourceId: undefined, x: 57, y: 60, w: 28, groupId: 'group', locked: true};
  const source = {...body('保留最新正文。'), id: 'text-0', colorRuns: [{start: 0, end: 2, color: '#123456'}]};
  const input = {days: [], elements: [source, lock]};
  const composition = resolveComposition({preset: 'photo-led'}, input);
  assert.equal(composition.preset, 'free');
  const validated = validatePlan([{...source, sourceId: source.id, region: 'writing'}], input, []);
  const output = finishCollage(validated, input, [], {preset: 'photo-led'});
  const spread = {id: 's', theme: 'archive', days: [], elements: [source, lock]};
  const before = structuredClone(spread);
  const applied = regenerateSpread(spread, {theme: 'archive', days: [], elements: output}, []);
  assert.deepEqual(spread, before);
  assert.deepEqual(applied.elements.find(p => p.id === lock.id), lock);
  assert.deepEqual(applied.elements.find(p => p.id === source.id).colorRuns, source.colorRuns);
  assert.ok(applied.elements.every(p => p.region === undefined));
});

test('selected decorations have no count cap and never recruit library filler', () => {
  const writing = body('不要遮住这段文字。');
  const flowers = assets.map((a, i) => ({kind: 'asset', assetId: a.id, src: a.src, x: 58 + i % 3 * 12, y: 15 + Math.floor(i / 3) * 17, w: 6, rotation: 0}));
  const out = finishCollage([writing, ...flowers], {elements: []}, assets, {density: 'sparse'});
  assert.equal(out.filter(p => p.kind === 'asset').length, flowers.length);
  assert.deepEqual(out[0], writing);
  assert.deepEqual(finishCollage([writing], {elements: []}, assets), [writing]);
  const blocked = {...flowers[0], x: writing.x, y: writing.y};
  assert.deepEqual(finishCollage([writing, blocked], {elements: []}, assets), [writing]);
  assert.deepEqual(finishCollage([writing, ...flowers], {elements: [], instruction: '不要贴纸'}, assets), [writing]);
});

test('required paragraph stickers stay associated with their writing', async () => {
  const {checkParagraphDesign} = await import('../local/editorial.mjs');
  const paragraphs = Array.from({length: 3}, (_, i) => ({...body(`段落${i}。`, i), paragraphIndex: i}));
  const selected = paragraphs.map((p, i) => ({kind: 'asset', assetId: assets[i].id, src: assets[i].src, forParagraph: p.sourceId, x: 80, y: 80, w: 4, rotation: 0}));
  const input = {elements: paragraphs.map(p => ({...p, id: p.sourceId})), requirements: {stickers: true}};
  const out = finishCollage([...paragraphs, ...selected], input, assets, {preset: 'long-read'});
  assert.equal(out.filter(p => p.kind === 'asset').length, 3);
  checkParagraphDesign(out, input, input.requirements, assets);
});

test('a heading follows its paragraph to the next region rather than being stranded', () => {
  const pieces = [body('日记记录。'.repeat(44)), {...body('下一段', 1), role: 'title', fontSize: 28}, body('接在标题后面的正文。'.repeat(8), 2)];
  const result = finishCollage(pieces, {elements: []}, [], {preset: 'long-read'});
  assert.ok(result[0].x < 50);
  assert.ok(result[1].x > 50);
  assert.equal(result[1].x, result[2].x);
  assert.ok(result[1].y + result[1].h < result[2].y);
});

test('dense overlapping clusters keep every selected layer while writing and photos remain protected', () => {
  const writing = body('周末去海边。');
  const photograph = {...photo(0), x: 55, y: 60, w: 30, h: 25};
  const cluster = Array.from({length: 18}, (_, i) => ({kind: 'asset', assetId: assets[i % assets.length].id, src: assets[i % assets.length].src, x: 56 + i % 5 * 3, y: 15 + Math.floor(i / 5) * 3, w: 10, rotation: i % 2 ? -4 : 4}));
  const input = [writing, photograph, ...cluster];
  const out = finishCollage(input, {elements: []}, assets, {density: 'rich'});
  assert.equal(out.length, input.length);
  assert.deepEqual(out.slice(0, 2), input.slice(0, 2));
  assert.deepEqual(out.slice(2).map(p => [p.x, p.y, p.w, p.rotation]), cluster.map(p => [p.x, p.y, p.w, p.rotation]));
  assert.deepEqual(layoutIssues(out), []);
  const unsafe = {...cluster[0], x: photograph.x, y: photograph.y};
  assert.equal(finishCollage([writing, photograph, unsafe], {elements: []}, assets).length, 2);
});

test('backing paper is retained beneath text even when the model lists it last', () => {
  const writing = {...body('叠贴不能遮住文字。'), stackOrder: 1};
  const paper = {kind: 'asset', assetId: 'collage-paper', x: 3, y: 16, w: 40, h: 20, rotation: 0};
  const out = finishCollage([writing, paper], {elements: []}, [{id: 'collage-paper'}]);
  assert.equal(out.length, 2);
  assert.equal(out[0].assetId, 'collage-paper');
  assert.equal(out[0].stackOrder, 1);
  assert.deepEqual(out[1], writing);
  assert.deepEqual(layoutIssues(out), []);
});

test('flowing a paragraph translates its decorative cluster without collapsing relative offsets', () => {
  const writing = {...body('正文。'), region: 'writing'};
  const cluster = [0, 1, 2].map(i => ({kind: 'asset', assetId: assets[i].id, forParagraph: writing.sourceId, x: 6 + i * 3, y: 34 + i, w: 5, rotation: 0}));
  const out = finishCollage([writing, ...cluster], {elements: []}, assets, {preset: 'quiet', primarySide: 'right'});
  const decorations = out.filter(p => p.kind === 'asset');
  assert.equal(decorations.length, 3);
  assert.equal(decorations[1].x - decorations[0].x, 3);
  assert.equal(decorations[1].y - decorations[0].y, 1);
  assert.ok(decorations.every(p => p.x > 50));
});

test('a visibly adjacent sticker can supply omitted paragraph metadata without moving or inventing material', async () => {
  const {checkParagraphDesign} = await import('../local/editorial.mjs');
  const writing = body('一段记录。');
  const sticker = {kind: 'asset', assetId: assets[0].id, x: 8, y: 34, w: 5, rotation: 0};
  const input = {elements: [], requirements: {stickers: true}};
  const out = finishCollage([writing, sticker], input, assets);
  assert.equal(out.length, 2);
  assert.equal(out[1].forParagraph, writing.sourceId);
  assert.deepEqual([out[1].x, out[1].y, out[1].w], [sticker.x, sticker.y, sticker.w]);
  checkParagraphDesign(out, input, input.requirements, assets);
  const far = finishCollage([writing, {...sticker, x: 60, y: 80}], input, assets);
  assert.throws(() => checkParagraphDesign(far, input, input.requirements, assets), /配上贴纸/);
});

test('a guessed oversized text box does not reserve an empty half page and discard nearby collage layers', () => {
  const writing = {...body('只是一行短文。'), x: 55, y: 10, h: 55};
  const sticker = {kind: 'asset', assetId: assets[0].id, x: 58, y: 30, w: 8, rotation: 0};
  const before = structuredClone(writing);
  const out = finishCollage([writing, sticker], {elements: []}, assets, {preset: 'free'});
  assert.equal(out.length, 2);
  assert.ok(out[0].h < 10);
  assert.equal(out[0].fontSize, writing.fontSize);
  assert.equal(out[0].text, writing.text);
  assert.deepEqual(writing, before);
  assert.deepEqual(layoutIssues(out), []);
});
