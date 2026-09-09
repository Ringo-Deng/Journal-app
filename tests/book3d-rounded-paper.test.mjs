import test from "node:test";
import assert from "node:assert/strict";
import { Mesh, MeshBasicMaterial, Raycaster, Vector3 } from "three";
import { BOOK, bookGeometry, sampleSheet } from "../lib/book3d-motion.ts";
import { createPaperGeometry, createPaperStackGeometry, paperColumns, paperCurveSample } from "../components/book3d/paper-geometry.ts";

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

test("both page faces trim outer corners, keep square hinges and preserve rectangular artwork coordinates", () => {
  for (const book of [BOOK, bookGeometry(1, 2), bookGeometry(120, 1.43)]) {
    for (const side of [-1, 1]) {
      const geometry = createPaperGeometry(book, side);
      const positions = geometry.attributes.position;
      const uv = geometry.attributes.uv;
      near(positions.getX(0), 0);
      near(positions.getY(0), book.height / 2);
      const outer = paperColumns(book).length - 1;
      near(positions.getX(outer), side * book.width);
      assert.ok(positions.getY(outer) < book.height / 2 - 0.1);
      for (let i = 0; i < positions.count; i++) {
        near(uv.getY(i), positions.getY(i) / book.height + 0.5);
        near(uv.getX(i), side === 1 ? positions.getX(i) / book.width : 1 + positions.getX(i) / book.width);
        assert.ok(geometry.attributes.normal.getZ(i) > 0.99);
      }
      const material = new MeshBasicMaterial();
      const mesh = new Mesh(geometry, material);
      mesh.updateMatrixWorld();
      const hit = (x, y) => new Raycaster(new Vector3(side * x, y, 1), new Vector3(0, 0, -1)).intersectObject(mesh).length > 0;
      assert.ok(hit(book.width / 2, 0), "page remains clickable");
      assert.ok(hit(0.002, book.height / 2 - 0.002), "hinge corner remains intact");
      assert.ok(!hit(book.width - 0.002, book.height / 2 - 0.002), "trimmed corner does not capture gestures");
      geometry.dispose();
      material.dispose();
    }
  }
});

test("moving rounded pages land exactly on the stationary outline at both ends", () => {
  const flat = createPaperGeometry(BOOK);
  for (const style of ["original", "soft", "bound"]) {
    for (const p of [0, 0.25, 0.5, 0.75, 1]) {
      const points = sampleSheet(p, 0, BOOK, style, 0.6);
      for (let i = 0; i < flat.attributes.position.count; i++) {
        const u = flat.attributes.uv.getX(i);
        const point = paperCurveSample(points, u);
        assert.ok(Number.isFinite(point.x) && Number.isFinite(point.z));
        if (p === 0 || p === 1) {
          near(point.x, flat.attributes.position.getX(i) * (p === 0 ? 1 : -1));
          near(point.z, points[0].z);
        }
        if (u === 0) near(point.x, 0);
      }
    }
  }
  flat.dispose();
});

test("paper blocks and their sheet lines share the visible page outline for thin and thick books", () => {
  for (const book of [bookGeometry(1, 2), bookGeometry(120, 1.43)]) {
    for (const side of [-1, 1]) {
      const { body, edges } = createPaperStackGeometry(book, book.leaves, side);
      const columns = paperColumns(book);
      const outlineHas = (x, y) => columns.some(p => Math.abs(side * p.x - x) < 1e-6 && Math.abs(book.height / 2 - p.inset - Math.abs(y)) < 1e-6);
      for (const geometry of [body, edges]) {
        const positions = geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          assert.ok(outlineHas(positions.getX(i), positions.getY(i)), "stack never protrudes into clipped corners");
          assert.ok(positions.getZ(i) >= 0 && positions.getZ(i) <= book.leaves * book.sheet + 0.008 + 1e-6);
        }
        geometry.dispose();
      }
    }
  }
});

test("rounding preserves every original bend sample, interior row and twist at every turn progress", () => {
  const geometry = createPaperGeometry(BOOK);
  const columns = paperColumns(BOOK);
  const originalColumns = Array.from({ length: BOOK.segments + 1 }, (_, i) => {
    const x = i * BOOK.width / BOOK.segments;
    const column = columns.findIndex(p => Math.abs(p.x - x) < 1e-10);
    assert.ok(column >= 0, "no original strip may be removed or moved");
    return column;
  });
  for (const style of ["original", "soft", "bound"]) {
    for (const bias of [-1, 0, 1]) {
      for (let step = 0; step <= 100; step++) {
        for (let row = 0; row <= 8; row++) {
          const original = sampleSheet(step / 100, 0, BOOK, style, (1 - row / 4) * bias);
          for (let i = 0; i <= BOOK.segments; i++) {
            const vertex = row * columns.length + originalColumns[i];
            const sample = paperCurveSample(original, geometry.attributes.uv.getX(vertex));
            near(sample.x, original[i].x);
            near(sample.z, original[i].z);
            if (row > 0 && row < 8)
              near(geometry.attributes.position.getY(vertex), (1 - row / 4) * BOOK.height / 2);
          }
        }
      }
    }
  }
  geometry.dispose();
});
