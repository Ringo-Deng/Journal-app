import test from "node:test";
import assert from "node:assert/strict";
import { getReadingJpg, readingJpgInput } from "../lib/reading-jpg.ts";

const asset = (id, src, extra = {}) => ({
  id, src, name: id, category: "decor", tags: [], sourceUrl: "", license: "", author: "", ...extra,
});
const piece = (id, extra = {}) => ({
  id, kind: "asset", assetId: id, src: `/fallback-${id}.png`,
  x: 10, y: 10, w: 20, rotation: 0, locked: false, ...extra,
});
const sheet = (id, elements = []) => ({ id, theme: "herbarium", days: [], elements });
const book = {
  id: "cache-dependencies", title: "旅行", month: "2026-09", cover: "linen-oat",
  spreads: [sheet("a", [piece("used")]), sheet("b")],
};
const assets = [asset("used", "/used.png"), asset("unused", "/unused.png")];
const input = (b = book, library = assets, index = 0) => readingJpgInput(b, library, index);

test("catalog classification, metadata, ordering and unrelated images retain every JPG", () => {
  const snapshot = structuredClone({ book, assets });
  const changed = assets.map((a) => ({
    ...a, name: "重新命名", group: "装饰贴纸", tags: ["旅行"],
    labels: { content: ["花"], style: ["复古"], color: ["绿色"] },
    manual: { group: true, labels: true }, sourceUrl: "https://example.com/source",
  }));
  changed[1].src = "/unrelated-replacement.png";
  changed.reverse();
  changed.push(asset("new-material", "/new.png"));
  for (const index of [null, 0, 1]) {
    assert.equal(input(book, changed, index), input(book, assets, index));
  }
  assert.deepEqual({ book, assets }, snapshot);
});

test("used image replacement and catalog removal invalidate only dependent pages", () => {
  const replaced = assets.map((a) => a.id === "used" ? { ...a, src: "/replaced.png" } : a);
  assert.notEqual(input(book, replaced), input());
  for (const index of [null, 1]) assert.equal(input(book, replaced, index), input(book, assets, index));
  const removed = assets.filter((a) => a.id !== "used");
  assert.notEqual(input(book, removed), input());
  assert.equal(input(book, removed), input(book, [asset("used", "/fallback-used.png")]));
  const restored = [...removed, asset("used", "/used.png")];
  assert.equal(input(book, restored), input());
});

test("custom covers follow their originalSrc mapping and direct-source fallback", () => {
  const custom = { ...book, coverAsset: "/original-cover.jpg" };
  const coverImage = asset("cover", "/processed-cover.png", { originalSrc: custom.coverAsset });
  const library = [...assets, coverImage];
  const renamed = library.map((a) => ({ ...a, name: "name", group: "纸张" }));
  assert.equal(input(custom, renamed, null), input(custom, library, null));
  const replaced = [...assets, { ...coverImage, src: "/new-cover.png" }];
  assert.notEqual(input(custom, replaced, null), input(custom, library, null));
  assert.equal(input(custom, replaced), input(custom, library));
  assert.notEqual(input(custom, assets, null), input(custom, library, null));
  assert.equal(
    input(custom, assets, null),
    input(custom, [...assets, { ...coverImage, src: custom.coverAsset }], null),
  );
  assert.notEqual(input({ ...custom, coverAsset: "/other-cover.jpg" }, assets, null), input(custom, assets, null));
});

test("photos, hidden assets and tape artwork do not depend on catalog image replacements", () => {
  const direct = {
    ...book,
    spreads: [sheet("a", [
      piece("photo", { kind: "photo", src: "/photo.jpg" }),
      piece("hidden", { hidden: true }),
      piece("tape", { material: "tape", color: "#aabbcc" }),
    ])],
  };
  const library = direct.spreads[0].elements.map((p) => asset(p.assetId, "/catalog.png"));
  assert.equal(input(direct, library), input(direct, library.map((a) => ({ ...a, src: "/replaced.png" }))));
  const visible = structuredClone(direct);
  visible.spreads[0].elements[1].hidden = false;
  assert.notEqual(input(visible, library), input(visible, library.map((a) => ({ ...a, src: "/replaced.png" }))));
});

test("paper, format and cover appearance stay fresh without including saved template lists", () => {
  const changes = [
    { cover: "linen-forest" }, { format: "tn-regular" },
    { paperStyle: "grid" }, { paperColor: "#112233" }, { paperRulingSize: "small" },
    { paperFeel: { texture: 30, spine: 40, edge: 50 } },
    { paperBg: { src: "/paper.png", x: 1, y: 2, scale: 100 } },
    { header: { enabled: true, text: "{页码}", fontSize: 14, dateFormat: "dot", align: "left", height: 7, margin: 6 } },
  ];
  for (const patch of changes) assert.notEqual(input({ ...book, ...patch }), input(), JSON.stringify(patch));
  for (const patch of changes.slice(2)) assert.equal(input({ ...book, ...patch }, assets, null), input(book, assets, null));
  assert.notEqual(input({ ...book, format: "tn-regular" }, assets, null), input(book, assets, null));
  const managed = {
    ...book, month: "2026-10",
    paperTemplates: [{ id: "template", name: "收藏纸张", src: "/template.png", x: 0, y: 0, scale: 100 }],
    collageTemplates: [{ id: "collage", name: "收藏拼贴", elements: [], ratio: 1.43 }],
  };
  for (const index of [null, 0, 1]) assert.equal(input(managed, assets, index), input(book, assets, index));
  assert.equal(input({ ...book, title: "新书名" }), input());
  assert.notEqual(input({ ...book, title: "新书名" }, assets, null), input(book, assets, null));
});

test("per-side paper backgrounds, dates, headers and all piece rendering properties invalidate their page", () => {
  const changed = (edit) => {
    const next = structuredClone(book);
    edit(next.spreads[0]);
    assert.notEqual(input(next), input());
    assert.equal(input(next, assets, 1), input(book, assets, 1));
  };
  for (const side of ["left", "right"]) {
    for (const paperBg of [null, { src: "/side.png", x: 12, y: 4, scale: 120 }]) {
      changed((s) => { s.pages = { [side]: { paperBg } }; });
    }
    changed((s) => { s.pages = { [side]: { paperColor: "#223344", paperStyle: "dots", date: "2026-09-10", header: { enabled: true, text: "页码：{页码}" } } }; });
  }
  changed((s) => { s.paperBg = { src: "/spread.png", x: 5, y: 6, scale: 130 }; });
  changed((s) => { s.days = [{ id: "day", date: "2026-09-10", text: "", title: "", raw: "", photos: [] }]; });
  for (const patch of [
    { fontFamily: "user:custom", colorRuns: [{ start: 0, end: 1, color: "#abcdef" }] },
    { highlightRuns: [{ start: 0, end: 1, color: "#f2d45c" }] },
    { cropY: 12, cropZoom: 1.5, flipX: true },
    { drawing: [{ path: "M0 0L10 10", stroke: "#123456", width: 2 }] },
    { hidden: true }, { stackOrder: 35 }, { x: 42, h: 20, rotation: 60 },
  ]) changed((s) => { Object.assign(s.elements[0], patch); });
});

test("flyleaf presence changes the paper role and printed page-number offset", () => {
  const repeated = { ...book, spreads: [book.spreads[0], book.spreads[0]] };
  const withLeaf = { ...repeated, flyleaf: repeated.spreads[0] };
  assert.notEqual(input(withLeaf), input(repeated));
  assert.notEqual(input(withLeaf, assets, 1), input(repeated, assets, 1));
  assert.equal(input(withLeaf, assets, null), input(repeated, assets, null));
});

test("catalog-only changes return the saved JPG without requesting a new render", async () => {
  const hash = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input()))).toString("hex");
  const blob = new Blob(["cached-page"], { type: "image/jpeg" });
  const original = globalThis.indexedDB;
  globalThis.indexedDB = {
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = {
          transaction() {
            return { objectStore() { return { get(key) {
              assert.equal(key, `${book.id}/0`);
              const read = {};
              queueMicrotask(() => { read.result = { signature: hash, blob }; read.onsuccess(); });
              return read;
            } }; } };
          },
        };
        request.onsuccess();
      });
      return request;
    },
  };
  try {
    const relabeled = assets.map((a) => ({ ...a, group: "装饰贴纸", labels: { color: ["绿色"] } }));
    assert.equal(await getReadingJpg(book, relabeled, 0), blob);
  } finally {
    globalThis.indexedDB = original;
  }
});
