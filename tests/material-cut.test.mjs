import test from "node:test";
import assert from "node:assert/strict";
import {
  materialCutExportGeometry,
  materialCutMaskBounds,
  materialCutPathLength,
  materialCutVisibleMask,
  sampleMaterialCutPath,
  splitMaterialCutMask,
  styleMaterialCutPath,
} from "../lib/material-cut.ts";

const solid = (width, height) => new Uint8Array(width * height).fill(255);

test("a cut from one outside edge to the other separates both retained pieces", () => {
  const width = 80,
    height = 50,
    result = splitMaterialCutMask(solid(width, height), width, height, [
      { x: 40, y: -5 },
      { x: 40, y: 55 },
    ]);
  assert.equal(result.masks.length, 2);
  assert.ok(result.changed > 0);
  assert.ok(result.sizes.every((size) => size > 1_800));
  assert.ok(result.sizes.reduce((sum, size) => sum + size, 0) < width * height);
});

test("an unfinished slit stays connected and a later continuation completes the cut", () => {
  const width = 80,
    height = 50,
    base = solid(width, height),
    first = splitMaterialCutMask(
      base,
      width,
      height,
      [
        { x: 0, y: 25 },
        { x: 40, y: 25 },
      ],
      { baseMask: base },
    );
  assert.equal(first.masks.length, 1);
  const continued = splitMaterialCutMask(
    first.masks[0],
    width,
    height,
    [
      { x: 40, y: 25 },
      { x: 85, y: 25 },
    ],
    { baseMask: base },
  );
  assert.equal(continued.masks.length, 2);
});

test("a bent continuation uses the retained slit instead of an invented straight extension", () => {
  const width = 80,
    height = 50,
    base = solid(width, height),
    first = splitMaterialCutMask(
      base,
      width,
      height,
      [
        { x: -5, y: 25 },
        { x: 40, y: 25 },
      ],
      { baseMask: base },
    );
  const continued = splitMaterialCutMask(
    first.masks[0],
    width,
    height,
    [
      { x: 40, y: 25 },
      { x: 10, y: 45 },
      { x: 85, y: 45 },
    ],
    { baseMask: base },
  );
  assert.equal(continued.masks.length, 2);
  assert.equal(
    continued.sizes.reduce((sum, size) => sum + size, 0),
    continued.masks.reduce(
      (sum, piece) => sum + piece.reduce((count, value) => count + (value ? 1 : 0), 0),
      0,
    ),
  );
});

test("a continued cut through a transparent subject keeps both real child pieces", () => {
  const width = 80,
    height = 50,
    base = new Uint8Array(width * height);
  for (let y = 10; y <= 39; y++) for (let x = 10; x <= 69; x++) base[y * width + x] = 255;
  const first = splitMaterialCutMask(
    base,
    width,
    height,
    [
      { x: 5, y: 25 },
      { x: 40, y: 25 },
    ],
    { baseMask: base },
  );
  assert.equal(first.masks.length, 1);
  const continued = splitMaterialCutMask(
    first.masks[0],
    width,
    height,
    [
      { x: 40, y: 25 },
      { x: 75, y: 25 },
    ],
    { baseMask: base },
  );
  assert.equal(continued.masks.length, 2);
  assert.deepEqual(
    continued.sizes.map((size) => size).sort((a, b) => a - b),
    [780, 840],
  );
});

test("a cut may begin and end on the enclosed transparent hole of a ring", () => {
  const width = 80,
    height = 50,
    ring = new Uint8Array(width * height);
  for (let y = 8; y <= 41; y++)
    for (let x = 8; x <= 71; x++)
      if (x < 24 || x > 55 || y < 18 || y > 31) ring[y * width + x] = 255;
  const split = splitMaterialCutMask(
    ring,
    width,
    height,
    [
      { x: 30, y: 23 },
      { x: 30, y: 13 },
      { x: 50, y: 13 },
      { x: 50, y: 23 },
    ],
    { baseMask: ring },
  );
  assert.equal(split.masks.length, 2);
  assert.deepEqual(
    [...split.sizes].sort((a, b) => a - b),
    [51, 1592],
  );
});

test("a closed free-cut path extracts the middle while keeping the outside", () => {
  const width = 80,
    height = 50,
    result = splitMaterialCutMask(solid(width, height), width, height, [
      { x: 20, y: 15 },
      { x: 60, y: 15 },
      { x: 60, y: 35 },
      { x: 20, y: 35 },
      { x: 20, y: 15 },
    ]);
  assert.equal(result.masks.length, 2);
  assert.ok(result.sizes.some((size) => size > 500 && size < 800));
  assert.ok(result.sizes.some((size) => size > 2_800));
});

test("edge styling keeps endpoints stable and produces deterministic visible variation", () => {
  const source = [
    { x: 0, y: 0 },
    { x: 60, y: 0 },
  ];
  assert.equal(materialCutPathLength(source), 60);
  assert.deepEqual(
    sampleMaterialCutPath(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 3, y: 0 },
      ],
      1,
    ).map((point) => point.x),
    [0, 1, 2, 3],
  );
  for (const edge of ["torn", "wave", "zigzag"]) {
    const first = styleMaterialCutPath(source, edge, 5),
      repeated = styleMaterialCutPath(source, edge, 5);
    assert.deepEqual(first, repeated);
    assert.deepEqual(first[0], source[0]);
    assert.deepEqual(first.at(-1), source.at(-1));
    assert.ok(first.some((point) => Math.abs(point.y) > 0.5));
  }
  assert.ok(styleMaterialCutPath(source, "straight", 5).every((point) => point.y === 0));
});

test("visible bounds ignore transparent pixels outside the retained subject", () => {
  const width = 10,
    height = 8,
    mask = solid(width, height),
    alpha = new Uint8Array(width * height);
  for (let y = 2; y <= 5; y++) for (let x = 3; x <= 7; x++) alpha[y * width + x] = 255;
  assert.deepEqual(materialCutMaskBounds(mask, width, height, alpha), {
    x0: 3,
    y0: 2,
    x1: 7,
    y1: 5,
    count: 20,
  });
});

test("transparent padding is not cuttable and a fully transparent image is rejected", () => {
  const width = 12,
    height = 8,
    alpha = new Uint8Array(width * height);
  for (let y = 2; y <= 5; y++) for (let x = 3; x <= 8; x++) alpha[y * width + x] = 255;
  alpha[0] = 2;
  const mask = materialCutVisibleMask(alpha, width, height);
  assert.ok(mask);
  assert.equal(mask[0], 0);
  assert.equal(mask[3 + 2 * width], 255);
  const split = splitMaterialCutMask(mask, width, height, [
    { x: 6, y: 1 },
    { x: 6, y: 6 },
  ]);
  assert.equal(split.masks.length, 2);
  assert.equal(materialCutVisibleMask(new Uint8Array(width * height), width, height), null);
});

test("one cut keeps disconnected transparent artwork grouped into two physical sides", () => {
  const width = 24,
    height = 18,
    mask = new Uint8Array(width * height);
  for (const [x0, y0, x1, y1] of [
    [2, 2, 21, 6],
    [2, 11, 21, 15],
  ])
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) mask[y * width + x] = 255;
  const split = splitMaterialCutMask(mask, width, height, [
    { x: 12, y: -4 },
    { x: 12, y: 22 },
  ]);
  assert.equal(split.masks.length, 2);
  assert.deepEqual(split.sizes, [90, 80]);
  assert.ok(split.masks.every((piece) => piece.some((value, index) => value && index < width * 8)));
  assert.ok(split.masks.every((piece) => piece.some((value, index) => value && index > width * 10)));
});

test("an extended grouping line never cuts an untouched transparent island", () => {
  const width = 24,
    height = 18,
    mask = new Uint8Array(width * height);
  for (let y = 2; y <= 6; y++) for (let x = 2; x <= 21; x++) mask[y * width + x] = 255;
  for (let y = 11; y <= 15; y++) for (let x = 2; x <= 21; x++) mask[y * width + x] = 255;
  const split = splitMaterialCutMask(mask, width, height, [
    { x: 12, y: -4 },
    { x: 12, y: 9 },
  ]);
  assert.equal(split.masks.length, 2);
  assert.equal(split.sizes.reduce((sum, size) => sum + size, 0), 185);
  const lowerCounts = split.masks
    .map((piece) => {
      let count = 0;
      for (let y = 11; y <= 15; y++)
        for (let x = 2; x <= 21; x++) if (piece[y * width + x]) count++;
      return count;
    })
    .sort((a, b) => a - b);
  assert.deepEqual(lowerCounts, [0, 100]);
});

test("an incomplete cut does not explode pre-existing transparent islands", () => {
  const width = 24,
    height = 18,
    mask = new Uint8Array(width * height);
  for (let y = 2; y <= 6; y++) for (let x = 2; x <= 21; x++) mask[y * width + x] = 255;
  for (let y = 11; y <= 15; y++) for (let x = 2; x <= 21; x++) mask[y * width + x] = 255;
  const slit = splitMaterialCutMask(mask, width, height, [
    { x: -4, y: 4 },
    { x: 10, y: 4 },
  ]);
  assert.equal(slit.masks.length, 1);
  assert.ok(slit.changed > 0);
});

test("export sizing preserves a small crop from a large original", () => {
  const small = materialCutExportGeometry(
    { x0: 100, y0: 40, x1: 199, y1: 89 },
    1200,
    800,
    12000,
    8000,
    3072,
  );
  assert.equal(small.sourceWidth, 1000);
  assert.equal(small.sourceHeight, 500);
  assert.equal(small.width, 1000);
  assert.equal(small.height, 500);
  const large = materialCutExportGeometry(
    { x0: 0, y0: 0, x1: 1199, y1: 799 },
    1200,
    800,
    12000,
    8000,
    3072,
  );
  assert.equal(large.width, 3072);
  assert.equal(large.height, 2048);
});
