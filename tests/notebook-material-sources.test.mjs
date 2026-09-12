import test from "node:test";
import assert from "node:assert/strict";
import { resolveNotebookAssetSources } from "../lib/notebook-material-sources.mjs";

test("export clones use current material images without mutating notebooks or photos", () => {
  const asset = (id, src) => ({ id, kind: "asset", assetId: id, src, x: 0, y: 0, w: 10 });
  const books = [
    {
      id: "book",
      spreads: [
        {
          elements: [
            asset("known", "/uploads/old.png"),
            asset("missing", "/uploads/missing-fallback.png"),
            { id: "photo", kind: "photo", assetId: "known", src: "/uploads/photo.png" },
          ],
        },
      ],
      flyleaf: { elements: [asset("known", "/uploads/flyleaf-old.png")] },
      collageTemplates: [{ id: "template", elements: [asset("known", "/uploads/template-old.png")] }],
    },
  ];
  const before = structuredClone(books),
    resolved = resolveNotebookAssetSources(books, [
      { id: "known", src: "/uploads/current.png" },
      { id: "ignored", src: 42 },
    ]);
  assert.deepEqual(books, before);
  assert.notEqual(resolved, books);
  assert.equal(resolved[0].spreads[0].elements[0].src, "/uploads/current.png");
  assert.equal(resolved[0].flyleaf.elements[0].src, "/uploads/current.png");
  assert.equal(resolved[0].collageTemplates[0].elements[0].src, "/uploads/current.png");
  assert.equal(resolved[0].spreads[0].elements[1].src, "/uploads/missing-fallback.png");
  assert.equal(resolved[0].spreads[0].elements[2].src, "/uploads/photo.png");
});
