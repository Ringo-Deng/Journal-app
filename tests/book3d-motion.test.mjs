import test from "node:test";
import assert from "node:assert/strict";
import { BOOK, sampleSheet, stackTop, turnTarget } from "../lib/book3d-motion.ts";

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
test("sheet lands flat on the matching stack at both ends", () => {
  for (let leaf = 0; leaf < BOOK.leaves; leaf++) {
    for (const p of [0, 1]) {
      const points = sampleSheet(p, leaf);
      near(points.at(-1).x, p === 0 ? BOOK.width : -BOOK.width);
      for (const point of points)
        near(point.z, stackTop(p === 0 ? BOOK.leaves - leaf : leaf + 1) + 0.008);
    }
  }
});
test("turn preserves paper length and its spine without crossing below either stack", () => {
  for (let leaf = 0; leaf < BOOK.leaves; leaf++) {
    for (let step = 0; step <= 100; step++) {
      const p = step / 100;
      const points = sampleSheet(p, leaf);
      near(points[0].x, 0);
      near(points[0].z, stackTop(BOOK.leaves - leaf) * (1 - p) + stackTop(leaf + 1) * p + 0.008);
      for (let i = 1; i < points.length; i++) {
        near(
          Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z),
          BOOK.width / BOOK.segments,
        );
        assert.ok(points[i].z >= points[0].z - 1e-9);
      }
    }
  }
});
test("navigation clamps first and last page and returns through every spread", () => {
  let page = 0;
  near(turnTarget(page, -1), 0);
  for (let i = 0; i < BOOK.leaves; i++) page = turnTarget(page, 1);
  near(turnTarget(page, 1), BOOK.leaves);
  for (let i = 0; i < BOOK.leaves; i++) page = turnTarget(page, -1);
  near(page, 0);
});
