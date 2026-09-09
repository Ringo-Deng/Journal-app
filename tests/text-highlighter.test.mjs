import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { decoratedTextSegments, validTextRuns } from '../lib/text-runs.ts';
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
