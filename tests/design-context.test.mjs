import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareDesignContext, finishDesignContext} from '../local/design-context.mjs';
import {bounds, intersects} from '../lib/layout-safety.mjs';

const asset = (id, extra = {}) => ({id, kind: 'asset', assetId: id, src: `/materials/${id}.png`, x: 8, y: 15, w: 8, h: 10, rotation: 0, locked: false, ...extra});
const text = (id, extra = {}) => ({id, kind: 'text', role: 'body', text: '原有文字完整保留。', x: 58, y: 22, w: 30, fontSize: 18, rotation: 0, locked: false, ...extra});
const drawing = (id, extra = {}) => ({id, kind: 'doodle', x: 30, y: 65, w: 8, h: 8, rotation: 0, locked: false, drawing: [{path: 'M0 0 L10 10', stroke: '#123456'}], ...extra});
const inputFor = (elements, extra = {}) => ({days: [], elements, ratio: 1.43, ...extra});
const ref = p => ({...p, sourceId: p.id});
const originalFields = p => { const {sourceId: _sourceId, ...original} = p; return original; };

function collage() {
  return [
    asset('backing', {groupId: 'manual-group', frame: 'collage-paper', x: 7, y: 14, w: 36, h: 63, opacity: .8}),
    {id: 'photo', kind: 'photo', groupId: 'manual-group', src: '/uploads/example.png', photoOriginal: '/uploads/original.png', x: 11, y: 22, w: 25, h: 24, rotation: -3, locked: false, crop: 37, cropY: 64, cropZoom: 1.9, flipX: true, frame: 'torn'},
    text('caption', {groupId: 'manual-group', x: 12, y: 56, w: 22, fontFamily: 'pen', lineHeight: 1.5, colorRuns: [{start: 0, end: 2, color: '#123456'}], highlightRuns: [{start: 3, end: 4, color: '#ffcccc'}]}),
    drawing('drawn', {groupId: 'manual-group', x: 32, y: 66, w: 6, h: 6, opacity: .6}),
  ];
}

function assertTranslation(original, output) {
  const matched = original.map(p => output.find(q => q.sourceId === p.id));
  assert.ok(matched.every(Boolean));
  const dx = matched[0].x - original[0].x, dy = matched[0].y - original[0].y;
  for (let i = 0; i < original.length; i++) {
    assert.ok(Math.abs(matched[i].x - original[i].x - dx) < 1e-8);
    assert.ok(Math.abs(matched[i].y - original[i].y - dy) < 1e-8);
    assert.deepEqual({...originalFields(matched[i]), x: original[i].x, y: original[i].y}, original[i]);
  }
  return {dx, dy};
}

test('prepare distinguishes explicit group locks from movable groups and keeps every manual material locally', () => {
  const movable = collage();
  const fixed = [asset('fixed', {groupId: 'fixed-group', locked: true}), text('fixed-caption', {groupId: 'fixed-group', locked: false})];
  const hidden = asset('hidden', {hidden: true, locked: false});
  const free = text('free');
  const source = inputFor([...movable, ...fixed, hidden, free, asset('manual'), drawing('manual-drawing')]);
  const before = structuredClone(source), ctx = prepareDesignContext(source);
  assert.deepEqual(ctx.editable, [free]);
  assert.deepEqual(ctx.fixed, [...fixed, hidden]);
  assert.equal(ctx.movableUnits.length, 3);
  assert.deepEqual(ctx.input.elements.map(p => p.id), ['free', 'fixed', 'fixed-caption', 'hidden']);
  assert.ok(ctx.input.elements.filter(p => p.id !== 'free').every(p => p.locked));
  assert.ok(ctx.input.preservedUnits.every(unit => unit.movable && Object.keys(unit).every(key => ['id', 'sourceIds', 'movable', 'x', 'y', 'w', 'h'].includes(key))));
  assert.deepEqual(source, before);
});

test('an already safe page made only of groups and materials stays at exactly the same positions', () => {
  const source = inputFor([...collage(), asset('manual', {x: 63, y: 14}), drawing('manual-drawing', {x: 64, y: 40})]);
  const before = structuredClone(source), ctx = prepareDesignContext(source);
  const output = finishDesignContext([], ctx);
  assert.equal(output.headerReserved, true);
  assert.deepEqual(output.elements.map(originalFields), source.elements);
  assert.deepEqual(source, before);
});

test('a new writing design can move an unlocked existing group to make room without breaking its contents', () => {
  const group = collage();
  const free = text('new-writing', {x: 6, y: 5});
  const source = inputFor([...group, free]), before = structuredClone(source);
  const generated = {...ref(free), x: 3, y: 4, w: 44, h: 91};
  const output = finishDesignContext([generated], prepareDesignContext(source));
  const movement = assertTranslation(group, output.elements);
  assert.ok(movement.dx > 40, 'the existing group actually moves to the available right page');
  assert.deepEqual(output.elements.find(p => p.sourceId === free.id), generated);
  assert.ok(group.every(p => !intersects(bounds(output.elements.find(q => q.sourceId === p.id)), bounds(generated), 1)));
  assert.deepEqual(source, before);
  assert.deepEqual(new Set(output.elements.map(p => p.sourceId)), new Set(source.elements.map(p => p.id)));
});

test('checked AI output cannot rewrite, crop, recolor or delete original retained material', () => {
  const group = collage(), manual = asset('manual', {x: 63, y: 15}), doodle = drawing('manual-drawing', {x: 62, y: 40});
  const source = inputFor([...group, manual, doodle]);
  const hostile = [ref(group[1]), ref(manual), ref(doodle)].map(p => ({...p, x: 80, y: 80, w: 1, text: 'changed', src: '/wrong.png', crop: 0, color: '#ffffff', drawing: []}));
  const output = finishDesignContext(hostile, prepareDesignContext(source));
  assert.deepEqual(output.elements.map(originalFields), source.elements);
});

test('one explicit locked member freezes the entire group while preserving every original lock flag', () => {
  const group = collage().map((p, i) => ({...p, locked: i === 1}));
  const free = text('free', {x: 58, y: 20});
  const source = inputFor([...group, free], {instruction: '请把整组移到右页'});
  const output = finishDesignContext([ref(free)], prepareDesignContext(source));
  assert.deepEqual(output.elements.filter(p => p.groupId).map(originalFields), group);
  assert.deepEqual(output.elements.find(p => p.sourceId === free.id), ref(free));
});

test('a clear whole-group page request translates retained pieces together and leaves their styles unchanged', () => {
  const group = collage(), source = inputFor(group, {instruction: '请把整组放到右页'});
  const output = finishDesignContext([], prepareDesignContext(source));
  assert.ok(output.elements.every(p => bounds(p).x >= 52));
  assert.ok(assertTranslation(group, output.elements).dx > 0);
  const paragraphOnly = finishDesignContext([], prepareDesignContext(inputFor(group, {instruction: '标题放右页，照片放左页'})));
  assert.deepEqual(paragraphOnly.elements.map(originalFields), group);
  for (const instruction of ['不要把整组放到右页', '整组不要放到右页', '请把整组放到右页以外的地方']) {
    assert.deepEqual(finishDesignContext([], prepareDesignContext(inputFor(group, {instruction}))).elements.map(originalFields), group);
  }
});

test('real header space is respected without moving fixed or hidden source elements', () => {
  const movable = asset('movable', {y: 8}), fixed = asset('fixed', {x: 70, y: 2, locked: true});
  const hidden = asset('hidden', {hidden: true, x: 0, y: 0, w: 100, h: 100});
  const source = inputFor([movable, fixed, hidden], {headerSpace: 18});
  const output = finishDesignContext([], prepareDesignContext(source));
  assert.ok(bounds(output.elements.find(p => p.sourceId === movable.id)).y >= 18);
  assert.deepEqual(originalFields(output.elements.find(p => p.sourceId === fixed.id)), fixed);
  assert.deepEqual(originalFields(output.elements.find(p => p.sourceId === hidden.id)), hidden);
});

test('preserved standalone paper may remain beneath original writing in a retained group', () => {
  const paper = asset('paper', {frame: 'collage-paper', x: 7, y: 14, w: 36, h: 63});
  const source = inputFor([paper, text('caption', {groupId: 'letters', x: 12, y: 32, w: 22})]);
  const output = finishDesignContext([], prepareDesignContext(source));
  assert.deepEqual(output.elements.map(originalFields), source.elements);
});

test('original ungrouped writing stays above its original backing paper, including full-page paper', () => {
  for (const geometry of [{x: 8, y: 15, w: 32, h: 40}, {x: 2, y: 3, w: 96, h: 94}]) {
    const paper = asset('paper', {frame: 'collage-paper', ...geometry});
    const writing = text('writing', {x: 15, y: 28, w: 15});
    const source = inputFor([paper, writing]);
    const output = finishDesignContext([ref(writing)], prepareDesignContext(source));
    assert.deepEqual(output.elements.map(originalFields), source.elements);
  }
});

test('an impossible layout and invalid source references fail without mutating either input or AI output', () => {
  const fixed = asset('wall', {x: 2, y: 3, w: 96, h: 94, locked: true});
  const free = text('free', {x: 20, y: 30}), source = inputFor([fixed, free]);
  const planned = [ref(free)], before = structuredClone({source, planned});
  assert.throws(() => finishDesignContext(planned, prepareDesignContext(source)), {code: 'design_space'});
  assert.deepEqual({source, planned}, before);
  const ctx = prepareDesignContext(inputFor([free, asset('manual')]));
  for (const result of [[], [ref(free), ref(free)], [{...ref(free), kind: 'asset'}], [{...ref(free), sourceId: 'foreign'}]])
    assert.throws(() => finishDesignContext(result, ctx), {code: 'design_source'});
});

test('fallback can keep a large existing combination and translate the complete new design into a gap', () => {
  const group = [asset('wide', {groupId: 'wide-group', x: 2, y: 3, w: 96, h: 69})];
  const free = text('free', {x: 10, y: 25, w: 30});
  const output = finishDesignContext([ref(free)], prepareDesignContext(inputFor([...group, free])));
  assert.deepEqual(originalFields(output.elements.find(p => p.sourceId === 'wide')), group[0]);
  assert.ok(output.elements.find(p => p.sourceId === 'free').y >= 73);
});

test('a whole-spread redesign actually recomposes old groups into a main group and a responding group', () => {
  const main = collage();
  const secondary = [asset('secondary', {groupId: 'secondary-group', x: 7, y: 82, w: 13, h: 11})];
  for (const instruction of ['换个感觉，重新设计整个跨页', '整理整个跨页', '多一点留白']) {
    const source = inputFor([...main, ...secondary], {instruction});
    const out = finishDesignContext([], prepareDesignContext(source));
    assert.equal(out.unchanged, false);
    const moved = assertTranslation(main, out.elements);
    assert.ok(Math.abs(moved.dx) + Math.abs(moved.dy) >= 5, 'composition must visibly move the main group');
    const response = out.elements.find(p => p.sourceId === secondary[0].id);
    assert.ok(response.x >= 52, 'the secondary group responds from the other page');
    assertTranslation(secondary, out.elements);
  }
});

test('the internal compose intent works without a new control while ordinary old API calls keep their positions', () => {
  const group = collage();
  const legacy = finishDesignContext([], prepareDesignContext(inputFor(group)));
  assert.equal(legacy.unchanged, true);
  assert.deepEqual(legacy.elements.map(originalFields), group);
  const composed = finishDesignContext([], prepareDesignContext(inputFor(group, {layoutIntent: 'compose'})));
  assert.equal(composed.unchanged, false);
  assert.ok(Math.abs(assertTranslation(group, composed.elements).dy) >= 5);
});

test('a whole-spread composition honors an explicit page and never moves a locked group', () => {
  const movable = collage();
  const locked = [asset('fixed-corner', {groupId: 'fixed-corner-group', x: 4, y: 4, locked: true}), text('fixed-corner-text', {groupId: 'fixed-corner-group', x: 4, y: 19, w: 20})];
  const source = inputFor([...locked, ...movable], {layoutIntent: 'compose', instruction: '重新设计整个跨页，请把整组放到右页'});
  const out = finishDesignContext([], prepareDesignContext(source));
  assert.equal(out.unchanged, false);
  assert.deepEqual(out.elements.filter(p => p.groupId === 'fixed-corner-group').map(originalFields), locked);
  assert.ok(out.elements.filter(p => p.groupId === 'manual-group').every(p => bounds(p).x >= 52));
  assertTranslation(movable, out.elements);
});

test('negated or local design requests never activate broad recomposition, even with an internal compose intent', () => {
  const group = collage();
  for (const instruction of ['不要重新设计整个跨页', '不要移动任何内容，多一点留白', '不要改变位置，换个感觉', '不要把整组放到右页', '整组位置不动，换个感觉', '标题换个感觉', '保持原位，换个感觉', '只重新设计标题', '仅调整文字颜色', '单独整理这一段']) {
    const out = finishDesignContext([], prepareDesignContext(inputFor(group, {layoutIntent: 'compose', instruction})));
    assert.equal(out.unchanged, true, instruction);
    assert.deepEqual(out.elements.map(originalFields), group, instruction);
  }
  const local = finishDesignContext([], prepareDesignContext(inputFor(group, {instruction: '重新设计这个标题'})));
  assert.equal(local.unchanged, true);
});

test('a fixed page or a full-spread backing returns unchanged when translation cannot improve the composition', () => {
  const page = [asset('full-page', {x: 2, y: 3, w: 96, h: 94})];
  const out = finishDesignContext([], prepareDesignContext(inputFor(page, {layoutIntent: 'compose'})));
  assert.equal(out.unchanged, true);
  assert.deepEqual(out.elements.map(originalFields), page);
  const group = collage().map(p => ({...p, locked: true}));
  const fixed = finishDesignContext([], prepareDesignContext(inputFor(group, {instruction: '换个感觉，重新设计整个跨页'})));
  assert.equal(fixed.unchanged, true);
  assert.deepEqual(fixed.elements.map(originalFields), group);
});

test('recomposition keeps an existing ungrouped backing attached to the writing placed over it', () => {
  const related = [asset('paper', {frame: 'collage-paper', x: 7, y: 14, w: 36, h: 63}), text('caption', {groupId: 'letters', x: 12, y: 32, w: 22})];
  const out = finishDesignContext([], prepareDesignContext(inputFor(related, {instruction: '重新设计整个跨页'})));
  assert.equal(out.unchanged, false);
  assertTranslation(related, out.elements);
});

test('unchanged accounts for layer order and ignores already-persisted source reference metadata', () => {
  const photos = ['a', 'b'].map(id => ({id, kind: 'photo', src: `/uploads/${id}.png`, x: 10, y: 20, w: 20, h: 20, rotation: 0, locked: false}));
  const reversed = finishDesignContext([...photos].reverse().map(ref), prepareDesignContext(inputFor(photos)));
  assert.equal(reversed.unchanged, false, 'reversing overlapping layers visibly changes the page');
  const source = collage().map(ref);
  const repeated = finishDesignContext([], prepareDesignContext(inputFor(source)));
  assert.equal(repeated.unchanged, true, 'saved sourceId metadata does not make a no-op look like a new design');
  const free = text('new-text');
  const generated = finishDesignContext([{...ref(free), color: '#123456'}], prepareDesignContext(inputFor([free])));
  assert.equal(generated.unchanged, false, 'a newly styled free text design remains an applicable preview');
});
