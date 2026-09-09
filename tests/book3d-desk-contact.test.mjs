import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Matrix4, Vector3 } from "three";
import {
  BOOK,
  bookGeometry,
  coverHeight,
  coverPose,
  exteriorSpineProfile,
} from "../lib/book3d-motion.ts";

test("book and desk remain flat while the camera owns the closed-cover presentation angle", async () => {
  const source = await readFile(
    new URL("../components/book3d/Book3DView.tsx", import.meta.url),
    "utf8",
  );
  const model = source.slice(
    source.indexOf("function BookModel("),
    source.indexOf("function WoodenDesk("),
  );
  assert.doesNotMatch(model, /root\.current\.rotation/);
  assert.doesNotMatch(model, /rotation=\{\[\(-tilt/);
  assert.doesNotMatch(source, /DeskScene|setTilt|书本视角|root\.current\.rotation/);
  assert.match(source, /presentationCamera\(presentationOpening\.current/);
});
test("both closed covers and open book stay above the desk plane at every viewing angle", () => {
  for (const book of [BOOK, bookGeometry(120, 1.43), bookGeometry(1, 2)]) {
    const deskZ = coverHeight("below", book) - book.cover / 2 - 0.006;
    for (const tilt of [0, 28, 50, 70]) {
      const matrix = new Matrix4().makeRotationX((-tilt * Math.PI) / 180);
      const normal = new Vector3(0, 0, 1).transformDirection(matrix);
      const origin = new Vector3(0, 0, deskZ).applyMatrix4(matrix);
      for (let i = 0; i <= 100; i++)
        for (const [front, back] of [
          [i / 100, 0],
          [1, i / 100],
        ]) {
          const points = [];
          for (const [progress, side] of [
            [front, "front"],
            [back, "back"],
          ]) {
            const pose = coverPose(progress, side, book);
            for (const x of [-0.06, book.width + 0.06])
              for (const y of [-book.height / 2 - 0.08, book.height / 2 + 0.08])
                for (const z of [-book.cover / 2, book.cover / 2]) {
                  points.push(
                    new Vector3(
                      x * Math.cos(pose.angle) + z * Math.sin(pose.angle),
                      y,
                      pose.z - x * Math.sin(pose.angle) + z * Math.cos(pose.angle),
                    ),
                  );
                }
          }
          for (const p of exteriorSpineProfile(front, back, book))
            for (const inset of [0, 0.009])
              points.push(new Vector3(p.x - p.nx * inset, 0, p.z - p.nz * inset));
          for (const point of points) {
            const clearance = point.applyMatrix4(matrix).sub(origin).dot(normal);
            assert.ok(
              clearance >= -1e-8,
              `table penetration ${clearance} at ${front}/${back}, tilt ${tilt}`,
            );
          }
        }
    }
  }
});
