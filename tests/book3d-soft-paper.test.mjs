import test from "node:test";
import assert from "node:assert/strict";
import { BOOK, sampleSheet, stackTop, bookGeometry } from "../lib/book3d-motion.ts";
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
test("soft paper preserves length, keeps its hinge and stays above the hinge for the entire turn", () => {
  for (const geometry of [BOOK, bookGeometry(120, 1.43), bookGeometry(1, 2)]) {
    for (const leaf of [0, geometry.leaves - 1]) {
      for (let step = 0; step <= 100; step++) {
        const p = step / 100,
          points = sampleSheet(p, leaf, geometry, "soft");
        near(points[0].x, 0);
        near(
          points[0].z,
          stackTop(geometry.leaves - leaf, geometry) * (1 - p) +
            stackTop(leaf + 1, geometry) * p +
            0.008,
        );
        for (let i = 1; i < points.length; i++) {
          near(
            Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z),
            geometry.width / geometry.segments,
          );
          assert.ok(points[i].z >= points[0].z - 1e-8);
        }
        if (p === 0 || p === 1) {
          near(points.at(-1).x, geometry.width * (p === 0 ? 1 : -1));
          points.forEach((point) => near(point.z, points[0].z));
        }
      }
    }
  }
});
test("soft paper has continuous single-direction curvature, distinct from the original S curve", () => {
  const points = sampleSheet(0.5, 3, BOOK, "soft");
  const angles = points.slice(1).map((v, i) => Math.atan2(v.z - points[i].z, v.x - points[i].x));
  for (let i = 1; i < angles.length; i++) assert.ok(angles[i] < angles[i - 1]);
  assert.notDeepEqual(points, sampleSheet(0.5, 3));
  assert.deepEqual(sampleSheet(0.5, 3), sampleSheet(0.5, 3, BOOK, "original"));
});
