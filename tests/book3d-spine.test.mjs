import test from "node:test";
import assert from "node:assert/strict";
import {
  BOOK,
  bookGeometry,
  coverPose,
  coverHeight,
  exteriorSpineProfile,
} from "../lib/book3d-motion.ts";
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
test("exterior spine joins the actual front and back cover edges throughout opening and closing", () => {
  for (const book of [BOOK, bookGeometry(120, 1.43), bookGeometry(1, 2)]) {
    for (let i = 0; i <= 100; i++)
      for (const [front, back] of [
        [i / 100, 0],
        [1, i / 100],
      ]) {
        const points = exteriorSpineProfile(front, back, book);
        for (const [point, pose, face] of [
          [points[0], coverPose(back, "back", book), -book.cover / 2],
          [points.at(-1), coverPose(front, "front", book), book.cover / 2],
        ]) {
          near(point.x, -0.04 * Math.cos(pose.angle) + face * Math.sin(pose.angle));
          near(point.z, pose.z + 0.04 * Math.sin(pose.angle) + face * Math.cos(pose.angle));
        }
        points.forEach((p) => assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z)));
      }
  }
});
test("closed spines sit outside the paper block and open spine clears the wooden desk", () => {
  for (const book of [BOOK, bookGeometry(120, 1.43), bookGeometry(1, 2)]) {
    const closed = exteriorSpineProfile(0, 0, book);
    closed.forEach((p) => assert.ok(p.x <= -0.04 + 1e-8));
    assert.ok(Math.min(...closed.map((p) => p.x)) <= -0.33, "closed spine should read as a cover band");
    exteriorSpineProfile(1, 1, book).forEach((p) => assert.ok(p.x >= 0.04 - 1e-8));
    const floor = coverHeight("below", book) - book.cover / 2 - 0.006;
    exteriorSpineProfile(1, 0, book).forEach((p) => {
      assert.ok(p.z >= floor, `${p.z} below ${floor}`);
      assert.ok(p.z <= coverHeight("below", book) - book.cover / 2 + 1e-8);
    });
  }
});
