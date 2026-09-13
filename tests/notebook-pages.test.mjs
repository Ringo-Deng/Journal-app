import test from 'node:test';
import assert from 'node:assert/strict';
import {
  removeNotebookSpread,
  pageAfterSpreadRemoval,
  reorderNotebookSpread,
  pageAfterSpreadReorder,
} from '../lib/notebook-pages.ts';

const book = () => ({
  id: 'notebook', title: '测试', flyleaf: { id: 'flyleaf', elements: [] },
  spreads: ['a', 'b', 'c'].map(id => ({ id, days: [], elements: [{ id: `${id}-photo`, src: `/uploads/${id}.png` }] })),
});

test('deletion retains all other sheets and image references without mutating the undo snapshot', () => {
  const before = book(), snapshot = structuredClone(before);
  const after = removeNotebookSpread(before, 'b');
  assert.deepEqual(before, snapshot);
  assert.deepEqual(after.spreads.map(s => s.id), ['a', 'c']);
  assert.equal(after.flyleaf, before.flyleaf);
  assert.equal(after.spreads[1], before.spreads[2]);
  assert.equal(removeNotebookSpread(before, 'flyleaf'), before);
  assert.equal(removeNotebookSpread(before, 'missing'), before);
});

test('editing, reading and remembered editing cursors retain the same content after earlier deletion', () => {
  for (const withFlyleaf of [false, true]) {
    const before = book();
    if (!withFlyleaf) delete before.flyleaf;
    const after = removeNotebookSpread(before, 'a');
    assert.equal(pageAfterSpreadRemoval(before, after, 2), 1);
    assert.equal(pageAfterSpreadRemoval(before, after, 1), 0);
    const offset = Number(withFlyleaf);
    const readingIndex = 2 + offset;
    assert.equal(pageAfterSpreadRemoval(before, after, readingIndex - offset) + offset, 1 + offset);
  }
});

test('deleting the current sheet chooses its next neighbour, then previous, then flyleaf or cover', () => {
  const before = book();
  assert.equal(pageAfterSpreadRemoval(before, removeNotebookSpread(before, 'b'), 1), 1);
  assert.equal(pageAfterSpreadRemoval(before, removeNotebookSpread(before, 'c'), 2), 1);
  assert.equal(pageAfterSpreadRemoval(before, removeNotebookSpread(before, 'a'), -1), -1);
  for (const withFlyleaf of [false, true]) {
    const last = { ...before, spreads: before.spreads.slice(0, 1) };
    if (!withFlyleaf) delete last.flyleaf;
    const empty = removeNotebookSpread(last, 'a');
    assert.equal(empty.spreads.length, 0);
    assert.equal(pageAfterSpreadRemoval(last, empty, 0), -1);
    assert.equal(Boolean(empty.flyleaf), withFlyleaf);
  }
});

test('reordering moves a complete spread without mutating its pages or the undo snapshot', () => {
  const before = book(), snapshot = structuredClone(before);
  const after = reorderNotebookSpread(before, 'a', 2);
  assert.deepEqual(before, snapshot);
  assert.deepEqual(after.spreads.map(spread => spread.id), ['b', 'c', 'a']);
  assert.equal(after.spreads[2], before.spreads[0]);
  assert.equal(after.flyleaf, before.flyleaf);
  assert.equal(reorderNotebookSpread(before, 'missing', 1), before);
  assert.equal(reorderNotebookSpread(before, 'b', 1), before);
});

test('editing, reading and remembered cursors follow the same spread after reordering', () => {
  const before = book();
  const after = reorderNotebookSpread(before, 'a', 2);
  assert.equal(pageAfterSpreadReorder(before, after, 0), 2);
  assert.equal(pageAfterSpreadReorder(before, after, 1), 0);
  assert.equal(pageAfterSpreadReorder(before, after, 2), 1);
  assert.equal(pageAfterSpreadReorder(before, after, -1), -1);
});
