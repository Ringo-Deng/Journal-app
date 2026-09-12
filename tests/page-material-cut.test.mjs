import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPageMaterialCut,
  assertPageMaterialCutTarget,
  pageMaterialCutPieces,
} from '../lib/page-material-cut.ts';

const piece = {
  id: 'piece',
  kind: 'asset',
  assetId: 'library-asset',
  src: '/uploads/original.png',
  x: 20,
  y: 10,
  w: 40,
  rotation: 0,
  locked: false,
  opacity: 0.8,
  groupId: 'group',
  attachedTo: 'caption',
};
const target = {
  sessionId: 'session',
  bookId: 'book',
  spreadId: 'spread',
  piece: structuredClone(piece),
  sourceSrc: '/uploads/original.png',
  pieceHeight: 20,
  canvasWidth: 1000,
  canvasHeight: 500,
  name: '原素材',
};
const output = (src, placement) => ({
  src,
  width: 400,
  height: 200,
  name: src.includes('left') ? '左半' : '右半',
  placement,
});
const halves = [
  output('/uploads/aaaaaaaa.png', { centerX: -0.25, centerY: 0, width: 0.5, height: 1 }),
  output('/uploads/bbbbbbbb.png', { centerX: 0.25, centerY: 0, width: 0.5, height: 1 }),
];
const books = [
  {
    id: 'book',
    month: '2026-09',
    title: '测试',
    spreads: [
      {
        id: 'spread',
        theme: 'blank',
        days: [],
        elements: [
          { id: 'under', kind: 'text', text: '下层', x: 0, y: 0, w: 10, rotation: 0, locked: false },
          piece,
          { id: 'over', kind: 'text', text: '上层', x: 0, y: 0, w: 10, rotation: 0, locked: false },
        ],
      },
    ],
  },
];

test('two tight cut images reconstruct the source layout without touching the library asset', () => {
  let serial = 0;
  const result = applyPageMaterialCut(books, target, halves, () => `new-${++serial}`),
    elements = result.books[0].spreads[0].elements;
  assert.deepEqual(books[0].spreads[0].elements[1], piece);
  assert.deepEqual(elements.map((item) => item.id), ['under', 'piece', 'new-1', 'over']);
  assert.deepEqual(result.pieces.map((item) => [item.x, item.y, item.w, item.h]), [
    [20, 10, 20, 20],
    [40, 10, 20, 20],
  ]);
  assert.equal(result.pieces[0].assetId, undefined);
  assert.equal(result.pieces[1].assetId, undefined);
  assert.equal(result.pieces[0].attachedTo, 'caption');
  assert.equal(result.pieces[1].attachedTo, undefined);
  assert.equal(result.pieces[1].groupId, 'group');
  assert.equal(result.pieces[0].opacity, 0.8);
  assert.ok(result.pieces.every((item) => item.stretch));
});

test('page mapping applies the original flip and rotation to moved cut centers', () => {
  const rotated = {
      ...target,
      piece: { ...target.piece, x: 30, y: 20, flipX: true, rotation: 90 },
    },
    [mapped] = pageMaterialCutPieces(
      rotated,
      [output('/uploads/bbbbbbbb.png', { centerX: 0.25, centerY: 0, width: 0.5, height: 1 })],
      () => 'unused',
  );
  assert.ok(Math.abs(mapped.x - 40) < 1e-8);
  assert.ok(Math.abs(mapped.y) < 1e-8);
  assert.equal(mapped.rotation, 90);
  assert.equal(mapped.flipX, true);
});

test('an original rotated bleed stays anchored when the cutter adds no new overflow', () => {
  const bleedTarget = {
      ...target,
      piece: { ...target.piece, x: 0, y: 0, rotation: 15 },
    },
    [mapped] = pageMaterialCutPieces(
      bleedTarget,
      [output('/uploads/abababab.png', { centerX: 0, centerY: 0, width: 1, height: 1 })],
      () => 'unused',
    );
  assert.ok(Math.abs(mapped.x) < 1e-8);
  assert.ok(Math.abs(mapped.y) < 1e-8);
  assert.equal(mapped.w, bleedTarget.piece.w);
  assert.equal(mapped.h, bleedTarget.pieceHeight);
});

test('mapping uses the rendered source content box instead of stretching its contain box', () => {
  const containedTarget = {
      ...target,
      sourceBox: { x: 35, y: 10, width: 10, height: 20 },
    },
    [mapped] = pageMaterialCutPieces(
      containedTarget,
      [output('/uploads/acacacac.png', { centerX: 0, centerY: 0, width: 1, height: 1 })],
      () => 'unused',
    );
  assert.deepEqual([mapped.x, mapped.y, mapped.w, mapped.h], [35, 10, 10, 20]);
});

test('an off-centre source box rotates around its original parent centre', () => {
  const offsetTarget = {
      ...target,
      piece: { ...target.piece, rotation: 90 },
      sourceBox: { x: 20, y: 10, width: 10, height: 20 },
    },
    [mapped] = pageMaterialCutPieces(
      offsetTarget,
      [output('/uploads/adadadad.png', { centerX: 0, centerY: 0, width: 1, height: 1 })],
      () => 'unused',
    );
  assert.ok(Math.abs(mapped.x - 35) < 1e-8);
  assert.ok(Math.abs(mapped.y + 20) < 1e-8);
  assert.equal(mapped.w, 10);
  assert.equal(mapped.h, 20);
});

test('large rotated cuts are scaled into the page instead of creating an unsavable width', () => {
  const largeTarget = {
      ...target,
      piece: { ...target.piece, x: 0, y: 0, w: 100, rotation: 0 },
      pieceHeight: 100,
      canvasWidth: 1000,
      canvasHeight: 1000,
    },
    [mapped] = pageMaterialCutPieces(
      largeTarget,
      [output('/uploads/cccccccc.png', {
        centerX: 0,
        centerY: 0,
        width: Math.SQRT2,
        height: Math.SQRT2,
      })],
      () => 'unused',
    );
  assert.ok(mapped.w <= 100);
  assert.ok(mapped.h <= 100);
  assert.ok(mapped.x >= 0 && mapped.x + mapped.w <= 100);
  assert.ok(mapped.y >= 0 && mapped.y + mapped.h <= 100);
});

test('a separated group is translated together when its mapped layout crosses a page edge', () => {
  const edgeTarget = {
      ...target,
      piece: { ...target.piece, x: 0, y: 0 },
    },
    mapped = pageMaterialCutPieces(
      edgeTarget,
      [
        output('/uploads/dddddddd.png', { centerX: -0.5, centerY: 0, width: 0.5, height: 1 }),
        output('/uploads/eeeeeeee.png', { centerX: 0, centerY: 0, width: 0.5, height: 1 }),
      ],
      () => 'extra',
    );
  assert.deepEqual(mapped.map((item) => [item.x, item.y, item.w, item.h]), [
    [0, 0, 20, 20],
    [20, 0, 20, 20],
  ]);
});

test('stale targets and the 300 element ceiling reject before changing books', () => {
  const changed = structuredClone(books);
  changed[0].spreads[0].elements[1].x = 21;
  assert.throws(() => assertPageMaterialCutTarget(changed, target, 2), /已有修改/);

  const full = structuredClone(books);
  full[0].spreads[0].elements = [
    target.piece,
    ...Array.from({ length: 299 }, (_, index) => ({
      id: `item-${index}`,
      kind: 'asset',
      x: 0,
      y: 0,
      w: 1,
      rotation: 0,
      locked: false,
    })),
  ];
  assert.throws(() => assertPageMaterialCutTarget(full, target, 2), /超过上限/);
});

test('invalid or non-uploaded outputs never replace the source piece', () => {
  assert.throws(
    () => applyPageMaterialCut(books, target, [output('/materials/not-saved.png', halves[0].placement)], () => 'x'),
    /数据不完整/,
  );
  assert.equal(books[0].spreads[0].elements[1].assetId, 'library-asset');
});

test('very thin pieces are rejected instead of being silently stretched', () => {
  assert.throws(
    () => pageMaterialCutPieces(
      target,
      [output('/uploads/ffffffff.png', { centerX: 0, centerY: 0, width: 0.01, height: 1 })],
      () => 'unused',
    ),
    /最小可编辑尺寸/,
  );
});
