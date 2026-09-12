import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { decoratedTextSegments, validTextRuns, isCurrentTextSelection, textSelectionFromInput } from '../lib/text-runs.ts';
import { regenerateSpread } from '../lib/journal.ts';

test('text colour and highlighter runs render independently with the newest overlap winning', () => {
  const segments = decoratedTextSegments(
    '洱海的风很温柔',
    [{ start: 0, end: 2, color: '#336699' }],
    [
      { start: 2, end: 7, color: '#f2d45c' },
      { start: 4, end: 6, color: '#82bdd5' },
    ],
  );
  assert.deepEqual(segments, [
    { start: 0, end: 2, text: '洱海', color: '#336699', highlight: undefined },
    { start: 2, end: 4, text: '的风', color: undefined, highlight: '#f2d45c' },
    { start: 4, end: 6, text: '很温', color: undefined, highlight: '#82bdd5' },
    { start: 6, end: 7, text: '柔', color: undefined, highlight: '#f2d45c' },
  ]);
});

test('invalid and out-of-range runs never reach the renderer', () => {
  assert.deepEqual(
    validTextRuns('三字句', [
      { start: 0, end: 2, color: '#abcdef' },
      { start: -1, end: 2, color: '#abcdef' },
      { start: 1, end: 8, color: '#abcdef' },
      { start: 1, end: 1, color: '#abcdef' },
      { start: 1.2, end: 2, color: '#abcdef' },
      { start: 1, end: 2, color: 'yellow' },
    ]),
    [{ start: 0, end: 2, color: '#abcdef' }],
  );
});

test('text marking accepts only a nonempty selection of the current unchanged text box', () => {
  const piece = { id: 'text-a', text: '今天去海边玩耍了' };
  const selection = { id: piece.id, text: piece.text, start: 2, end: 5 };
  assert.equal(isCurrentTextSelection(selection, piece), true);
  assert.equal(isCurrentTextSelection({ ...selection, start: 0, end: piece.text.length }, piece), true);
  for (const invalid of [null, { ...selection, id: 'text-b' }, { ...selection, text: '今天去公园玩耍了' },
    { ...selection, start: -1 }, { ...selection, end: 99 }, { ...selection, end: 2 }, { ...selection, start: 1.5 }])
    assert.equal(isCurrentTextSelection(invalid, piece), false);
});

test('panel selection preserves saved offsets for old line endings, emoji and repeated words', () => {
  const piece = { id: 'text-a', text: '海边\r\n🌊海边\r下雨' };
  const value = '海边\n🌊海边\n下雨';
  const range = textSelectionFromInput(piece, value, 5, 7);
  assert.deepEqual(range, { ...piece, start: 6, end: 8 });
  assert.equal(piece.text.slice(range.start, range.end), '海边');
  assert.deepEqual(textSelectionFromInput(piece, value, 0, value.length), { ...piece, start: 0, end: piece.text.length });
  assert.equal(textSelectionFromInput(piece, value, 2, 2), null);
  assert.equal(textSelectionFromInput(piece, value, -1, 2), null);
  assert.equal(textSelectionFromInput(piece, '不同原文', 0, 2), null);
  assert.equal(textSelectionFromInput(piece, value, 0, 99), null);
});

test('AI layout keeps highlights only while the original wording is unchanged', () => {
  const source = {
    id: 'text', kind: 'text', text: '海边散步', x: 5, y: 8, w: 30, rotation: 0, locked: false,
    highlightRuns: [{ start: 0, end: 2, color: '#f2d45c' }],
  };
  const same = regenerateSpread(
    { id: 'spread', theme: 'rose', days: [], elements: [source] },
    { theme: 'rose', days: [], elements: [{ kind: 'text', sourceId: 'text', text: source.text, x: 10, y: 20, w: 30, rotation: 0 }] },
    [],
  );
  assert.deepEqual(same.elements[0].highlightRuns, source.highlightRuns);
  const changed = regenerateSpread(
    { id: 'spread', theme: 'rose', days: [], elements: [source] },
    { theme: 'rose', days: [], elements: [{ kind: 'text', sourceId: 'text', text: '重新写过', x: 10, y: 20, w: 30, rotation: 0 }] },
    [],
  );
  assert.equal(changed.elements[0].highlightRuns, undefined);
});

test('the text toolbar exposes five highlighter colours and one whole-box clear action', async () => {
  const source = await readFile(new URL('../components/collage-tools.tsx', import.meta.url), 'utf8');
  assert.match(source, /局部文字样式/);
  assert.match(source, /清除本框高亮/);
  assert.equal((source.match(/添加\$\{name\}荧光标记/g) || []).length, 1);
  for (const color of ['#f2d45c', '#ee9aa2', '#82bdd5', '#9bc58a', '#b79ad0'])
    assert.match(source, new RegExp(color));
  assert.doesNotMatch(source, /清除选区高亮/);
});

test('editing wording clears both local colour and highlighter ranges', async () => {
  const source = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
  assert.match(source, /patch\.text!==undefined&&patch\.text!==e\.text\?\{colorRuns:undefined,highlightRuns:undefined\}/);
});

test('the last valid text selection survives toolbar focus while new editing clears stale ranges', async () => {
  const source = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
  assert.match(source, /if\(t\.selectionEnd>t\.selectionStart\)setTextRange\(\{id:p\.id,start:t\.selectionStart,end:t\.selectionEnd,text:t\.value\}\)/);
  assert.match(source, /onChange=\{e=>\{setInlineText\(e\.target\.value\);setTextRange\(null\)\}\}/);
  assert.match(source, /if\(p\.kind==='text'\)\{setTextRange\(null\);setInlineId\(p\.id\)/);
});
