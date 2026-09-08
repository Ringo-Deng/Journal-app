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

test("pointer travel drives both directions continuously and pulling back unwinds the sheet", async () => {
  const { dragTurnProgress } = await import("../lib/book3d-motion.ts");
  for (const direction of [-1, 1]) {
    const progress = [0, 120, 240, 480, 160, 0].map((travel) =>
      dragTurnProgress(-direction * travel, direction, 800),
    );
    assert.deepEqual(progress, [0, 0.15, 0.3, 0.6, 0.2, 0]);
    near(dragTurnProgress(direction * 200, direction, 800), 0);
    near(dragTurnProgress(-direction * 1000, direction, 800), 1);
  }
});

test("100%, 200% and 300% views have identical progress for the same relative paper travel", async () => {
  const { dragTurnProgress } = await import("../lib/book3d-motion.ts");
  for (const zoom of [1, 2, 3]) {
    near(dragTurnProgress(-200 * zoom, 1, 800 * zoom), 0.25);
    near(dragTurnProgress(600 * zoom, -1, 800 * zoom), 0.75);
  }
});

test("click completes, short drag returns, deliberate turn lands and cancellation always returns", async () => {
  const { releaseTurn } = await import("../lib/book3d-motion.ts");
  assert.equal(releaseTurn(0, 0), 1);
  assert.equal(releaseTurn(0.2, 160), 0);
  assert.equal(releaseTurn(0.6, 480), 1);
  assert.equal(releaseTurn(0.1, 80), 0); // Pulled back before release.
  assert.equal(releaseTurn(0.95, 760, true), 0);
  assert.equal(releaseTurn(0, 0, true), 0);
});

test("zoomed turns remain reachable inside a narrow viewport", async () => {
  const { dragTurnProgress, dragTurnSpan, releaseTurn } = await import("../lib/book3d-motion.ts");
  for (const viewport of [390, 1200]) {
    for (const zoom of [1, 2, 3]) {
      const span = dragTurnSpan(viewport * 0.8 * zoom, viewport);
      const distance = viewport * 0.35;
      assert.equal(releaseTurn(dragTurnProgress(-distance, 1, span), distance), 1);
      assert.ok(span <= viewport);
    }
  }
});
