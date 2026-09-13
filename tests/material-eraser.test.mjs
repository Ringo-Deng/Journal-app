import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import {
  erasedMaterialSourceBounds,
  materialEraserSvg,
  normalizeMaterialEraserStrokes,
} from "../local/material-eraser.mjs";
import { startTestServer } from "./test-server.mjs";

const ui = await readFile(new URL("../components/material-studio.tsx", import.meta.url), "utf8");
const editor = await readFile(
  new URL("../components/material-eraser.tsx", import.meta.url),
  "utf8",
);
const styles = await readFile(
  new URL("../components/material-eraser.css", import.meta.url),
  "utf8",
);
const server = await readFile(new URL("../local/server.mjs", import.meta.url), "utf8");

test("eraser input is bounded and source placement follows transparent-edge trimming", () => {
  const strokes = normalizeMaterialEraserStrokes([
    {
      size: 0.05,
      points: [
        [0.2, 0.3],
        [0.4, 0.5],
      ],
    },
  ]);
  assert.deepEqual(strokes, [
    {
      size: 0.05,
      points: [
        [0.2, 0.3],
        [0.4, 0.5],
      ],
    },
  ]);
  assert.equal(normalizeMaterialEraserStrokes([]), null);
  assert.equal(normalizeMaterialEraserStrokes([{ size: 0.6, points: [[0.2, 0.3]] }]), null);
  assert.equal(normalizeMaterialEraserStrokes([{ size: 0.05, points: [[1.2, 0.3]] }]), null);
  assert.match(materialEraserSvg(strokes, 100, 200).toString(), /stroke-linecap="round"/);
  const mapped = erasedMaterialSourceBounds(
    { sourceBounds: [0.1, 0.2, 0.5, 0.4] },
    { sourceWidth: 10, sourceHeight: 10, left: 2, top: 3, width: 6, height: 5 },
  );
  assert.ok(mapped.every((value, index) => Math.abs(value - [0.2, 0.32, 0.3, 0.2][index]) < 1e-10));
});

test("studio exposes a per-result eraser with reversible local editing", () => {
  assert.match(ui, /className="material-eraser-trigger"/);
  assert.match(ui, /item\.erased\?'继续擦除':'擦除'/);
  assert.match(ui, /request<Job>\('\/erase'/);
  assert.match(ui, /item\.imported\?'已入库素材请从素材库再次编辑'/);
  for (const label of ["橡皮大小", "撤销", "重做", "重置本次", "保存擦除结果"])
    assert.match(editor, new RegExp(label));
  assert.match(editor, /strokesRef\.current/);
  assert.match(editor, /window\.confirm\(["']擦除草稿还没有保存/);
  assert.match(editor, /addEventListener\(["']beforeunload/);
  assert.match(styles, /touch-action: none/);
  assert.match(styles, /background-image: conic-gradient/);
  assert.match(server, /\/api\/materials\/erase/);
  assert.match(server, /blend:'dest-out'/);
});

const { dir, base } = await startTestServer(test);
async function call(path, data) {
  const response = await fetch(base + path, {
    method: data === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  return { status: response.status, data: await response.json() };
}

test("erasing updates one unimported result atomically and keeps its source image", async () => {
  const pixels = Buffer.alloc(10 * 10 * 4);
  for (let y = 3; y < 8; y++)
    for (let x = 2; x < 8; x++) {
      const at = (y * 10 + x) * 4;
      pixels[at] = 220;
      pixels[at + 1] = 80;
      pixels[at + 2] = 110;
      pixels[at + 3] = 255;
    }
  const sourceBytes = await sharp(pixels, { raw: { width: 10, height: 10, channels: 4 } })
      .png()
      .toBuffer(),
    data = "data:image/png;base64," + sourceBytes.toString("base64");
  const upload = await call("/api/upload", { data });
  assert.equal(upload.status, 200);
  const source = await call("/api/materials/source", { src: upload.data.src, name: "待擦除素材" });
  assert.equal(source.status, 200);
  const added = await call("/api/materials/add-item", {
    jobId: source.data.id,
    src: upload.data.src,
    width: 10,
    height: 10,
    name: "混入碎片的素材",
    sourceBounds: [0.1, 0.2, 0.5, 0.4],
  });
  assert.equal(added.status, 200);
  const item = added.data.items.at(-1),
    erased = await call("/api/materials/erase", {
      jobId: source.data.id,
      itemId: item.id,
      sourceSrc: item.src,
      strokes: [{ size: 0.05, points: [[0.5, 0.5]] }],
    });
  assert.equal(erased.status, 200);
  const updated = erased.data.items.find((entry) => entry.id === item.id);
  assert.equal(updated.id, item.id);
  assert.notEqual(updated.src, item.src);
  assert.equal(updated.erased, true);
  assert.equal(updated.width, 6);
  assert.equal(updated.height, 5);
  assert.ok(
    updated.sourceBounds.every(
      (value, index) => Math.abs(value - [0.2, 0.32, 0.3, 0.2][index]) < 1e-10,
    ),
  );
  assert.ok((await stat(join(dir, item.src.slice(1)))).isFile());
  assert.ok((await stat(join(dir, updated.src.slice(1)))).isFile());
  const output = await sharp(await readFile(join(dir, updated.src.slice(1)))).metadata();
  assert.equal(output.format, "png");
  assert.equal(output.width, 6);
  assert.equal(output.height, 5);
  const stale = await call("/api/materials/erase", {
    jobId: source.data.id,
    itemId: item.id,
    sourceSrc: item.src,
    strokes: [{ size: 0.05, points: [[0.5, 0.5]] }],
  });
  assert.equal(stale.status, 409);
  assert.equal(
    (
      await call("/api/materials/erase", {
        jobId: source.data.id,
        itemId: item.id,
        sourceSrc: updated.src,
        strokes: [],
      })
    ).status,
    400,
  );
  const eraseAll = await call("/api/materials/erase", {
    jobId: source.data.id,
    itemId: item.id,
    sourceSrc: updated.src,
    strokes: [0, 0.25, 0.5, 0.75, 1].map((y) => ({
      size: 0.5,
      points: [
        [0, y],
        [1, y],
      ],
    })),
  });
  assert.equal(eraseAll.status, 400);
  assert.match(eraseAll.data.error, /不能把整个素材擦空/);
  assert.equal(
    (await call("/api/materials/jobs")).data
      .find((job) => job.id === source.data.id)
      .items.find((entry) => entry.id === item.id).src,
    updated.src,
  );
  const imported = await call("/api/materials/import", {
    jobId: source.data.id,
    itemIds: [item.id],
  });
  assert.equal(imported.status, 200);
  assert.equal(
    (
      await call("/api/materials/erase", {
        jobId: source.data.id,
        itemId: item.id,
        sourceSrc: updated.src,
        strokes: [{ size: 0.05, points: [[0.5, 0.5]] }],
      })
    ).status,
    409,
  );
  const saved = JSON.parse(await readFile(join(dir, "material-jobs.json"), "utf8"));
  assert.equal(
    saved.find((job) => job.id === source.data.id).items.find((entry) => entry.id === item.id).src,
    updated.src,
  );
});
