import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readingBookPlan } from "../lib/reading-book-plan.ts";
import {
  bookGeometry,
  nextBookTurn,
  finishBookTurn,
  sampleSheet,
  stackTop,
  coverPose,
} from "../lib/book3d-motion.ts";
import { readingJpgInput, getReadingJpg } from "../lib/reading-jpg.ts";

test("physical sides preserve every spread and grid destination with and without a flyleaf", () => {
  for (const flyleaf of [false, true]) {
    for (const count of [1, 8, 30, 120]) {
      const plan = readingBookPlan(count, flyleaf);
      assert.equal(plan.leaves, count + 1);
      for (let i = 0; i < count; i++) {
        const index = i + Number(flyleaf);
        const leaf = plan.leafForReading(index);
        assert.deepEqual(plan.faces[2 * leaf - 1], { sheet: index, side: "left" });
        assert.deepEqual(plan.faces[2 * leaf], { sheet: index, side: "right" });
        assert.equal(plan.readingForLeaf(leaf), index);
      }
      assert.deepEqual(plan.faces[0], { sheet: flyleaf ? 0 : null, side: "right" });
      assert.equal(plan.faces.at(-1).sheet, null);
    }
  }
});
test("dynamic page counts reach the back cover and return without the demo eight-page limit", () => {
  for (const count of [2, 9, 31, 121]) {
    let position = { opened: false, turned: 0, backClosed: false };
    for (let i = 0; i < count + 2; i++)
      position = finishBookTurn(position, nextBookTurn(position, 1, count));
    assert.deepEqual(position, { opened: true, turned: count, backClosed: true });
    assert.equal(nextBookTurn(position, 1, count), null);
    for (let i = 0; i < count + 2; i++)
      position = finishBookTurn(position, nextBookTurn(position, -1, count));
    assert.deepEqual(position, { opened: false, turned: 0, backClosed: false });
  }
});
test("standard and tall books keep page proportions, bounded thickness and connected sheets", () => {
  for (const ratio of [1.43, 1.05])
    for (const leaves of [2, 9, 121]) {
      const g = bookGeometry(leaves, ratio);
      assert.ok(Math.abs((g.width * 2) / g.height - ratio) < 1e-10);
      assert.ok(g.sheet * leaves <= 0.32 + 1e-10);
      for (const leaf of [0, leaves - 1]) {
        assert.ok(
          Math.abs(sampleSheet(0, leaf, g)[0].z - stackTop(leaves - leaf, g) - 0.008) < 1e-10,
        );
        assert.ok(Math.abs(sampleSheet(1, leaf, g)[0].z - stackTop(leaf + 1, g) - 0.008) < 1e-10);
      }
      assert.ok(coverPose(0, "front", g).z - g.cover / 2 > stackTop(leaves, g));
    }
});
test("stationery editions keep their own physical spine colors without a bookmark or bottom hint", async () => {
  const reader = await readFile(
    new URL("../components/reading-book3d.tsx", import.meta.url),
    "utf8",
  );
  const view = await readFile(
    new URL("../components/book3d/Book3DView.tsx", import.meta.url),
    "utf8",
  );
  assert.match(reader, /linen-forest[\s\S]*#6c596b/);
  assert.match(reader, /linen-blue[\s\S]*#3c5b6a/);
  assert.match(view, /function RoundedCoverFace/);
  assert.doesNotMatch(view, /function Bookmark|<Bookmark|book3d-status/);
  assert.doesNotMatch(view, /function (?:Clasp|Snap|Closure)/);
});
const book = {
  id: "test-book",
  title: "记录",
  month: "2026-09",
  cover: "kraft",
  spreads: [
    { id: "a", elements: [] },
    { id: "b", elements: [] },
  ],
};
test("JPG freshness invalidates the edited page and paper style while reusing unchanged pages and cover", () => {
  const before = structuredClone(book);
  const after = structuredClone(book);
  after.spreads[1].elements.push({ id: "text", kind: "text", text: "changed" });
  assert.equal(readingJpgInput(before, [], 0), readingJpgInput(after, [], 0));
  assert.equal(readingJpgInput(before, [], null), readingJpgInput(after, [], null));
  assert.notEqual(readingJpgInput(before, [], 1), readingJpgInput(after, [], 1));
  after.paperColor = "#ffeecc";
  assert.notEqual(readingJpgInput(before, [], 0), readingJpgInput(after, [], 0));
  assert.deepEqual(book, before);
});
test("saved JPG is returned directly without importing or rendering any paper component", async () => {
  const input = readingJpgInput(book, [], 0);
  const hash = Buffer.from(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input)),
  ).toString("hex");
  const blob = new Blob(["saved-jpg"], { type: "image/jpeg" });
  const original = globalThis.indexedDB;
  globalThis.indexedDB = {
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = {
          transaction() {
            return {
              objectStore() {
                return {
                  get(key) {
                    assert.equal(key, "test-book/0");
                    const read = {};
                    queueMicrotask(() => {
                      read.result = { signature: hash, blob };
                      read.onsuccess();
                    });
                    return read;
                  },
                };
              },
            };
          },
        };
        request.onsuccess();
      });
      return request;
    },
  };
  try {
    const result = await getReadingJpg(book, [], 0);
    assert.equal(result, blob);
    assert.equal(result.type, "image/jpeg");
  } finally {
    globalThis.indexedDB = original;
  }
});
