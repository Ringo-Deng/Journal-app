import test from "node:test";
import assert from "node:assert/strict";
import {
  clampSelectionMove,
  idsInSelectionRect,
  mergeSelection,
  rotatedSelectionBounds,
  selectionRect,
} from "../lib/selection-geometry.ts";

const items = [
  { id: "single", x: 10, y: 10, w: 20, h: 20 },
  { id: "group-a", groupId: "card", x: 40, y: 10, w: 10, h: 10 },
  { id: "group-b", groupId: "card", x: 52, y: 10, w: 10, h: 10 },
  { id: "locked", x: 70, y: 10, w: 10, h: 10, locked: true },
  { id: "hidden", x: 84, y: 10, w: 10, h: 10, hidden: true },
];

test("selection rectangle is direction independent", () => {
  assert.deepEqual(selectionRect({ x: 80, y: 60 }, { x: 10, y: 20 }), {
    left: 10,
    top: 20,
    right: 80,
    bottom: 60,
  });
});

test("marquee selects by center and expands a hit member to its whole group", () => {
  assert.deepEqual(idsInSelectionRect(items, { left: 0, top: 0, right: 46, bottom: 30 }), [
    "single",
    "group-a",
    "group-b",
  ]);
});

test("marquee skips locked and hidden items", () => {
  assert.deepEqual(idsInSelectionRect(items, { left: 65, top: 0, right: 100, bottom: 40 }), []);
});

test("group editing limits marquee selection to individual members in that group", () => {
  assert.deepEqual(idsInSelectionRect(items, { left: 38, top: 0, right: 51, bottom: 30 }, "card"), [
    "group-a",
  ]);
});

test("modifier marquee adds a new unit or removes an already selected unit", () => {
  assert.deepEqual(mergeSelection(["single"], ["group-a", "group-b"], true), [
    "single",
    "group-a",
    "group-b",
  ]);
  assert.deepEqual(mergeSelection(["single", "group-a", "group-b"], ["group-a", "group-b"], true), [
    "single",
  ]);
});

test("moving a selection permits bleed but keeps a grab area visible", () => {
  const moving = [{ id: "a", x: 20, y: 30, w: 80, h: 60 }];
  assert.deepEqual(
    clampSelectionMove(moving, { x: -200, y: 300 }, { width: 300, height: 200 }, 28),
    { x: -72, y: 142 },
  );
});

test("multi-selection bounds include the visible corners of rotated items", () => {
  const bounds = rotatedSelectionBounds(
    [{ id: "rotated", x: 20, y: 20, w: 20, h: 20, rotation: 45 }],
    2,
  );
  assert.ok(bounds);
  assert.ok(bounds.x < 20);
  assert.ok(bounds.y < 20);
  assert.ok(bounds.w > 20);
  assert.ok(bounds.h > 20);
});
