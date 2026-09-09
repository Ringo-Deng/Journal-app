import test from "node:test";
import assert from "node:assert/strict";
import {
  BOOK,
  bookGeometry,
  coverPose,
  coverHeight,
  exteriorSpineProfile,
} from "../lib/book3d-motion.ts";
import { coverOutline } from "../components/book3d/cover-geometry.ts";
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
    const width = -0.04 - Math.min(...closed.map((p) => p.x));
    assert.ok(width > 0.015 && width < 0.1, "closed binding stays narrow and visibly rounded");
    exteriorSpineProfile(1, 1, book).forEach((p) => assert.ok(p.x >= 0.04 - 1e-8));
    const floor = coverHeight("below", book) - book.cover / 2 - 0.006;
    exteriorSpineProfile(1, 0, book).forEach((p) => {
      assert.ok(p.z >= floor, `${p.z} below ${floor}`);
      assert.ok(p.z <= coverHeight("below", book) - book.cover / 2 + 1e-8);
    });
  }
});

test("rounded spine scales down for thin notebooks and joins covers without a flared lip", () => {
  const thin = exteriorSpineProfile(0, 0, bookGeometry(1, 2));
  const thick = exteriorSpineProfile(0, 0, bookGeometry(120, 1.43));
  assert.ok(thin[16].x > thick[16].x, "thin notebooks have a smaller binding radius");
  for (const points of [thin, thick]) {
    const first = points[0], next = points[1];
    assert.ok(Math.abs((next.z - first.z) / (next.x - first.x)) < 0.2,
      "the rounded shell meets the cover nearly tangentially");
    for (let i = 1; i < points.length; i++)
      assert.ok(points[i].z >= points[i - 1].z, "no folded or reversed shell faces");
  }
});

test("cover boards and mirrored faces keep square binding corners and rounded outer corners", () => {
  for (const [width, height, radius] of [[3.84, 5.2, 0.16], [3.82, 5.18, 0.15], [3.64, 4.96, 0.11]]) {
    for (const side of ["left", "right"]) {
      const points = coverOutline(width, height, radius, side).getPoints(10);
      const bindingX = (side === "left" ? -1 : 1) * width / 2;
      for (const y of [-height / 2, height / 2]) {
        assert.ok(points.some(p => Math.abs(p.x - bindingX) < 1e-8 && Math.abs(p.y - y) < 1e-8),
          "binding reaches both square corners");
        assert.ok(!points.some(p => Math.abs(p.x + bindingX) < 1e-8 && Math.abs(p.y - y) < 1e-8),
          "fore-edge corners remain rounded");
      }
      assert.ok(points.every(p => Math.abs(p.x) <= width / 2 + 1e-8 && Math.abs(p.y) <= height / 2 + 1e-8));
    }
  }
});
