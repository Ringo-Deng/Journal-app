import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";
import { spawn } from "node:child_process";
import sharp from "sharp";
import { defaultBook } from "../lib/journal.ts";
import { createPhotoLibrary } from "../local/photo-library.mjs";
import { createJournalHistory } from "../local/journal-history.mjs";
import { defaultTaxonomy } from "../local/material-catalog.mjs";
import { writeArchive, readArchive, digest, BACKUP_FORMAT } from "../local/backup-archive.mjs";
import { journalBackupSnapshot } from "../local/full-backup.mjs";
import {
  validateSnapshot,
  planRestore,
  commitRestore,
  recoverBackupTransaction,
} from "../local/backup-restore.mjs";
import { freeTestPort } from "./test-server.mjs";

const persisted = (value) => JSON.parse(JSON.stringify(value));
const validate = (s) => {
  assert.ok(Array.isArray(s.books));
  assert.ok(s.books.length <= 240);
};
const empty = () => ({
  state: { revision: 0, books: [] },
  assets: [],
  materialJobs: [],
  pinterestImports: [],
  catalog: {
    revision: 0,
    autoManaged: true,
    taxonomy: structuredClone(defaultTaxonomy),
    overrides: {},
  },
  classificationJobs: [],
  photos: [],
  fonts: [],
  histories: [],
  previous: null,
  trash: { entries: [], deletedSources: [] },
  imports: [],
});
async function folder(t) {
  const path = await mkdtemp(join(tmpdir(), "full-backup-test-"));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}
async function fixture(t) {
  const data = await folder(t),
    publicDir = await folder(t);
  await mkdir(join(data, "uploads"));
  await mkdir(join(publicDir, "materials"));
  const atomic = async (path, value) => writeFile(join(data, path), JSON.stringify(value));
  const photo = await sharp({
    create: { width: 24, height: 16, channels: 3, background: "#cca977" },
  })
    .png()
    .toBuffer();
  const library = createPhotoLibrary({ data, atomic }),
    item = (
      await library.import(photo, { name: "旅途原片.png", capturedAt: "2024-04-05T12:34:56" })
    ).item;
  const src = "/uploads/aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa.png";
  await writeFile(join(data, src.slice(1)), photo);
  const asset = { id: "custom", name: "旅行贴纸", src, tags: ["旅行"], sourceImage: src };
  const builtin = { id: "builtin", name: "旧版内置贴纸", src: "/materials/demo.svg", tags: [] };
  await writeFile(
    join(publicDir, "materials/demo.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="red"/></svg>',
  );
  const fontBytes = Buffer.concat([Buffer.from([0, 1, 0, 0]), Buffer.from("test-font")]),
    sha = digest(fontBytes),
    font = {
      id: sha.slice(0, 24),
      sha,
      ext: ".ttf",
      name: "我的字体",
      size: fontBytes.length,
      originalName: "font.ttf",
    };
  await mkdir(join(data, "user-fonts"));
  await writeFile(join(data, "user-fonts", font.id + font.ext), fontBytes);
  const b = defaultBook();
  b.id = "book";
  b.title = "旅途";
  b.spreads[0].id = "spread";
  b.spreads[0].elements = [
    {
      id: "photo",
      kind: "photo",
      src: item.src,
      photoOriginal: item.src,
      x: 5,
      y: 5,
      w: 25,
      rotation: 0,
      locked: false,
    },
    {
      id: "sticker",
      kind: "asset",
      assetId: asset.id,
      src,
      x: 40,
      y: 5,
      w: 20,
      rotation: 0,
      locked: false,
    },
    {
      id: "text",
      kind: "text",
      text: "保留我的排版",
      fontFamily: `Journal User ${font.id}`,
      x: 5,
      y: 50,
      w: 35,
      rotation: 0,
      locked: false,
    },
    {
      id: "builtin-piece",
      kind: "asset",
      assetId: builtin.id,
      src: builtin.src,
      x: 60,
      y: 5,
      w: 20,
      rotation: 0,
      locked: false,
    },
  ];
  const snapshot = empty();
  snapshot.state = { revision: 3, books: [b] };
  snapshot.assets = [asset, builtin];
  snapshot.photos = [item];
  snapshot.fonts = [font];
  snapshot.catalog.overrides.custom = {
    group: "装饰贴纸",
    labels: { content: ["植物"], style: [], color: ["红"] },
    manual: { group: true, labels: true },
  };
  snapshot.materialJobs = [
    {
      id: "job",
      source: src,
      name: "原素材",
      engine: "auto",
      items: [{ id: asset.id, src, name: asset.name, imported: true, width: 24, height: 16 }],
    },
  ];
  const history = {
    format: "shiguang-history-v1",
    id: "1720000000000-aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
    createdAt: "2024-07-03T09:46:40.000Z",
    day: "2024-07-03",
    reason: "daily",
    revision: 2,
    books: [b],
  };
  snapshot.histories = [history];
  snapshot.previous = { revision: 2, books: [b] };
  snapshot.trash.entries = [
    {
      id: "trash",
      src,
      resultSrc: item.src,
      bookId: b.id,
      spreadId: "spread",
      pieceId: "photo",
      original: b.spreads[0].elements[0],
      applied: b.spreads[0].elements[0],
    },
  ];
  return { data, publicDir, snapshot, photo };
}
test("complete backup restores into another library with originals, catalog, jobs, fonts, historical references and SVGs", async (t) => {
  const f = await fixture(t),
    archiveDir = await folder(t),
    restoreDir = await folder(t),
    data = await folder(t);
  const exported = await writeArchive({ ...f, directory: archiveDir, appVersion: "0.1.188" });
  const staged = await readArchive(
    createReadStream(exported.archive, { highWaterMark: 19 }),
    restoreDir,
  );
  validateSnapshot(staged.manifest.snapshot, validate);
  assert.deepEqual(staged.manifest.snapshot, persisted(f.snapshot));
  const current = empty(),
    existing = defaultBook();
  existing.id = "existing";
  existing.title = "原来的手帐";
  current.state = { revision: 10, books: [existing] };
  current.previous = { revision: 9, books: [existing] };
  await writeFile(join(data, "journal.json"), JSON.stringify(current.state));
  const plan = await planRestore({ staged, current, data, validateState: validate });
  await commitRestore(data, plan);
  const state = JSON.parse(await readFile(join(data, "journal.json")));
  assert.equal(state.revision, 11);
  assert.deepEqual(state.books[0], persisted(existing));
  assert.equal(state.books[1].title, "旅途");
  assert.notEqual(state.books[1].id, "book");
  const assets = JSON.parse(await readFile(join(data, "materials.json"))),
    jobs = JSON.parse(await readFile(join(data, "material-jobs.json"))),
    catalog = JSON.parse(await readFile(join(data, "material-catalog.json")));
  const sticker = state.books[1].spreads[0].elements[1];
  assert.equal(assets[0].id, sticker.assetId);
  assert.equal(jobs[0].items[0].id, assets[0].id);
  assert.ok(catalog.overrides[sticker.assetId].manual.labels);
  assert.match(assets[1].src, /^\/uploads\/[a-f0-9-]+\.png$/);
  assert.equal(
    (await sharp(await readFile(join(data, assets[1].src.slice(1)))).metadata()).format,
    "png",
  );
  const photos = JSON.parse(await readFile(join(data, "photo-library.json")));
  assert.deepEqual(await readFile(join(data, photos[0].originalFile)), f.photo);
  assert.equal(photos[0].capturedAt, "2024-04-05T12:34:56");
  const lib = createPhotoLibrary({ data, atomic: async () => {} });
  assert.equal((await lib.list()).total, 1);
  assert.ok((await lib.thumbnail(photos[0].id)).length);
  const fonts = JSON.parse(await readFile(join(data, "fonts.json")));
  assert.equal(
    digest(await readFile(join(data, "user-fonts", fonts[0].id + fonts[0].ext))),
    fonts[0].sha,
  );
  const history = createJournalHistory({ data, atomicAt: async () => {}, validate });
  assert.equal((await history.list()).entries.length, 3);
  let day = 0;
  const pruning = createJournalHistory({
    data,
    limit: 1,
    now: () => new Date(Date.UTC(2026, 8, 10 + day++)),
    atomicAt: async (dir, name, value) => writeFile(join(dir, name), JSON.stringify(value)),
    validate,
  });
  await pruning.captureBeforeSave(state, state);
  await pruning.captureBeforeSave({ ...state, revision: 12 }, state);
  const retained = (await pruning.list()).entries;
  assert.equal(retained.length, 4);
  assert.equal(
    retained.filter((h) => h.restored).length,
    3,
    "imported history survives routine retention",
  );
  const trash = JSON.parse(await readFile(join(data, "photo-trash.json")));
  assert.equal(trash.entries[0].bookId, state.books[1].id);
  assert.equal(trash.entries[0].pieceId, state.books[1].spreads[0].elements[0].id);
  assert.equal(JSON.parse(await readFile(join(data, "backup-imports.json")))[0].id, staged.id);
});
test("journal-only backup keeps notebooks and their referenced files without the surrounding libraries", async (t) => {
  const f = await fixture(t),
    unrelated = "/uploads/bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb.png",
    currentMaterial = "/uploads/cccccccc-cccc-4ccc-cccc-cccccccccccc.png",
    currentMaterialBytes = await sharp({
      create: { width: 13, height: 9, channels: 4, background: "#315fd6" },
    })
      .png()
      .toBuffer();
  assert.notEqual(digest(currentMaterialBytes), digest(f.photo));
  await writeFile(join(f.data, unrelated.slice(1)), f.photo);
  await writeFile(join(f.data, currentMaterial.slice(1)), currentMaterialBytes);
  const sourceBefore = structuredClone(f.snapshot.state),
    assets = structuredClone(f.snapshot.assets);
  assets[0].src = currentMaterial;
  const snapshot = journalBackupSnapshot(f.snapshot.state, f.snapshot.fonts, assets),
    exported = await writeArchive({
      ...f,
      snapshot,
      scope: "journals",
      directory: await folder(t),
      appVersion: "test",
    }),
    staged = await readArchive(createReadStream(exported.archive), await folder(t)),
    paths = staged.manifest.files.map((file) => file.path);
  validateSnapshot(staged.manifest.snapshot, validate);
  assert.equal(staged.manifest.scope, "journals");
  assert.deepEqual(f.snapshot.state, sourceBefore);
  assert.equal(staged.manifest.snapshot.state.books[0].spreads[0].elements[1].src, currentMaterial);
  assert.deepEqual(staged.manifest.snapshot.assets, []);
  assert.deepEqual(staged.manifest.snapshot.photos, []);
  assert.deepEqual(staged.manifest.snapshot.materialJobs, []);
  assert.deepEqual(staged.manifest.snapshot.histories, []);
  assert.equal(staged.manifest.snapshot.previous, null);
  assert.deepEqual(staged.manifest.snapshot.trash, { entries: [], deletedSources: [] });
  assert.deepEqual(staged.manifest.snapshot.fonts, persisted(f.snapshot.fonts));
  assert.ok(paths.includes(f.snapshot.photos[0].src.slice(1)));
  assert.ok(paths.includes(currentMaterial.slice(1)));
  assert.equal(paths.includes(f.snapshot.assets[0].src.slice(1)), false);
  assert.equal(
    staged.manifest.files.find((file) => file.path === currentMaterial.slice(1))?.sha256,
    digest(currentMaterialBytes),
  );
  assert.deepEqual(
    await readFile(join(staged.directory, currentMaterial.slice(1))),
    currentMaterialBytes,
  );
  assert.ok(paths.includes(f.snapshot.assets[1].src.slice(1)));
  assert.ok(paths.includes(`user-fonts/${f.snapshot.fonts[0].id}${f.snapshot.fonts[0].ext}`));
  assert.equal(paths.includes(f.snapshot.photos[0].originalFile), false);
  assert.equal(paths.includes(`photo-thumbnails/${f.snapshot.photos[0].id}.webp`), false);
  assert.equal(paths.includes(unrelated.slice(1)), false);

  const target = await folder(t),
    current = empty(),
    existing = { ...defaultBook(), id: "existing", title: "原来的手帐" };
  current.state = { revision: 10, books: [existing] };
  await writeFile(join(target, "journal.json"), JSON.stringify(current.state));
  const plan = await planRestore({ staged, current, data: target, validateState: validate });
  await commitRestore(target, plan);
  const restoredState = JSON.parse(await readFile(join(target, "journal.json"))),
    restoredBook = restoredState.books[1];
  assert.equal(restoredState.revision, 11);
  assert.deepEqual(restoredState.books[0], persisted(existing));
  assert.equal(restoredBook.title, "旅途");
  assert.equal(JSON.parse(await readFile(join(target, "materials.json"))).length, 0);
  assert.equal(JSON.parse(await readFile(join(target, "photo-library.json"))).length, 0);
  assert.equal(JSON.parse(await readFile(join(target, "fonts.json"))).length, 1);
  const restoredMaterial = await readFile(
    join(target, restoredBook.spreads[0].elements[1].src.slice(1)),
  );
  assert.equal(digest(restoredMaterial), digest(currentMaterialBytes));
  assert.notEqual(digest(restoredMaterial), digest(f.photo));
  for (const path of [
    restoredBook.spreads[0].elements[0].src,
    restoredBook.spreads[0].elements[1].src,
    restoredBook.spreads[0].elements[3].src,
  ])
    assert.equal((await readFile(join(target, path.slice(1)))).length > 0, true);
});
test("truncated, tampered, extra-data, duplicate-path and traversal archives never reach commit", async (t) => {
  const f = await fixture(t),
    directory = await folder(t),
    exported = await writeArchive({ ...f, directory, appVersion: "test" }),
    bytes = await readFile(exported.archive);
  const altered = Buffer.from(bytes);
  altered[bytes.indexOf(10) + 20] ^= 1;
  for (const invalid of [
    bytes.subarray(0, bytes.length - 15),
    altered,
    Buffer.concat([bytes, Buffer.from("extra")]),
  ])
    await assert.rejects(readArchive(Readable.from([invalid]), await folder(t)));
  for (const files of [
    [{ path: "uploads/../settings.json", size: 0, sha256: digest("") }],
    [
      { path: "uploads/a.png", size: 0, sha256: digest("") },
      { path: "uploads/a.png", size: 0, sha256: digest("") },
    ],
  ]) {
    const header = JSON.stringify({
      format: BACKUP_FORMAT,
      createdAt: new Date().toISOString(),
      appVersion: "test",
      snapshot: empty(),
      files,
    });
    await assert.rejects(
      readArchive(
        Readable.from([
          Buffer.from(header + "\n\n" + JSON.stringify({ complete: digest(header) }) + "\n"),
        ]),
        await folder(t),
      ),
    );
  }
});
test("export rejects missing references and linked files; secrets are not part of archive", async (t) => {
  const f = await fixture(t);
  await writeFile(join(f.data, "settings.json"), "SECRET_DO_NOT_EXPORT");
  const out = await writeArchive({ ...f, directory: await folder(t), appVersion: "test" });
  assert.equal((await readFile(out.archive)).includes(Buffer.from("SECRET_DO_NOT_EXPORT")), false);
  await rm(join(f.data, f.snapshot.assets[0].src.slice(1)));
  await assert.rejects(writeArchive({ ...f, directory: await folder(t), appVersion: "test" }));
  await symlink(join(f.data, "settings.json"), join(f.data, f.snapshot.assets[0].src.slice(1)));
  await assert.rejects(writeArchive({ ...f, directory: await folder(t), appVersion: "test" }));
});
test("a failed commit is replayed before startup reads and preserves the prior notebook", async (t) => {
  const f = await fixture(t),
    out = await writeArchive({ ...f, directory: await folder(t), appVersion: "test" }),
    staged = await readArchive(createReadStream(out.archive), await folder(t)),
    data = await folder(t),
    current = empty();
  current.state = { revision: 1, books: [{ ...defaultBook(), id: "existing" }] };
  await writeFile(join(data, "journal.json"), JSON.stringify(current.state));
  const plan = await planRestore({ staged, current, data, validateState: validate });
  await writeFile(join(data, "journal-history"), "blocked");
  await assert.rejects(commitRestore(data, plan));
  assert.deepEqual(
    JSON.parse(await readFile(join(data, "journal.json"))),
    persisted(current.state),
  );
  await rm(join(data, "journal-history"));
  assert.equal(await recoverBackupTransaction(data), true);
  assert.equal(await recoverBackupTransaction(data), false);
  const state = JSON.parse(await readFile(join(data, "journal.json")));
  assert.equal(state.books[0].id, "existing");
  assert.equal(state.books.length, 2);
});

async function server(t, data) {
  const port = await freeTestPort();
  let child;
  async function start() {
    child = spawn(process.execPath, ["local/server.mjs"], {
      env: {
        ...process.env,
        JOURNAL_DATA_DIR: data,
        JOURNAL_CONFIG_DIR: data,
        JOURNAL_PORT: String(port),
        JOURNAL_WEB_PORT: String(port),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    await new Promise((resolve, reject) => {
      let errors = "";
      child.stderr.on("data", (c) => (errors += c));
      child.stdout.once("data", resolve);
      child.once("error", reject);
      child.once("exit", (code) => reject(Error(`Server ${code}: ${errors}`)));
    });
  }
  async function stop() {
    if (child?.exitCode === null) {
      const done = new Promise((resolve) => child.once("exit", resolve));
      child.kill();
      await done;
    }
  }
  t.after(stop);
  await start();
  const call = async (path, method = "GET", value) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      ...(value !== undefined
        ? {
            headers: {
              "Content-Type": Buffer.isBuffer(value)
                ? "application/octet-stream"
                : "application/json",
            },
            body: Buffer.isBuffer(value) ? value : JSON.stringify(value),
          }
        : {}),
    });
    return { status: response.status, value: await response.json() };
  };
  return { call, port, start, stop };
}
test("real API previews, rejects stale revision, restores once, reloads caches and survives restart", async (t) => {
  const f = await fixture(t),
    out = await writeArchive({ ...f, directory: await folder(t), appVersion: "test" }),
    bytes = await readFile(out.archive),
    data = await folder(t),
    s = await server(t, data);
  const old = { ...defaultBook(), id: "existing", title: "原有手帐" };
  assert.equal((await s.call("/api/state", "PUT", { revision: 0, books: [old] })).status, 200);
  const preview = await s.call("/api/backup/preview", "POST", bytes);
  assert.equal(preview.status, 200, JSON.stringify(preview.value));
  assert.equal(preview.value.summary.books, 1);
  assert.equal((await s.call("/api/state")).value.books.length, 1);
  const path = "/api/backup/restore/" + preview.value.token;
  assert.equal((await s.call(path, "POST", { revision: 0 })).status, 409);
  const restored = await s.call(path, "POST", { revision: 1 });
  assert.equal(restored.status, 200, JSON.stringify(restored.value));
  const state = (await s.call("/api/state")).value;
  assert.equal(state.books.length, 2);
  assert.deepEqual(state.books[0], persisted(old));
  assert.equal((await s.call("/api/photos")).value.total, 1);
  assert.equal((await s.call("/api/fonts")).value.fonts.length, 1);
  assert.equal((await s.call("/api/materials/jobs")).value.length, 1);
  assert.ok(
    (await s.call("/api/materials")).value.some(
      (a) => a.name === "旅行贴纸" && a.group === "装饰贴纸",
    ),
  );
  assert.equal((await s.call("/api/photo-trash")).value.entries.length, 1);
  const again = await s.call("/api/backup/preview", "POST", bytes);
  assert.equal(again.value.alreadyImported, true);
  assert.equal(
    (await s.call("/api/backup/restore/" + again.value.token, "POST", { revision: state.revision }))
      .value.alreadyImported,
    true,
  );
  assert.deepEqual((await s.call("/api/state")).value, state);
  assert.equal(
    (await s.call("/api/state", "PUT", { revision: 1, books: [old] })).status,
    409,
    "an old window cannot overwrite restored content",
  );
  state.books[0].title = "恢复后继续编辑";
  const saved = await s.call("/api/state", "PUT", state);
  assert.equal(saved.status, 200);
  state.revision = saved.value.revision;
  await s.stop();
  await s.start();
  assert.deepEqual((await s.call("/api/state")).value, state);
  const exportResult = await s.call("/api/backup/export", "POST", { revision: state.revision });
  assert.equal(exportResult.status, 200, JSON.stringify(exportResult.value));
  const download = await fetch(`http://127.0.0.1:${s.port}${exportResult.value.url}`);
  assert.equal(download.status, 200);
  const reexported = await readArchive(Readable.fromWeb(download.body), await folder(t));
  assert.equal(reexported.manifest.snapshot.state.books.length, 2);
  assert.equal(reexported.manifest.scope, "all");
  const journalExport = await s.call("/api/backup/export", "POST", {
    revision: state.revision,
    scope: "journals",
  });
  assert.equal(journalExport.status, 200, JSON.stringify(journalExport.value));
  assert.equal(journalExport.value.scope, "journals");
  const journalDownload = await fetch(`http://127.0.0.1:${s.port}${journalExport.value.url}`);
  assert.equal(journalDownload.status, 200);
  assert.match(journalDownload.headers.get("content-disposition"), /shiguang-journals-/);
  const journalArchive = await readArchive(Readable.fromWeb(journalDownload.body), await folder(t));
  assert.equal(journalArchive.manifest.scope, "journals");
  assert.deepEqual(journalArchive.manifest.snapshot.assets, []);
  assert.deepEqual(journalArchive.manifest.snapshot.photos, []);
  assert.equal(
    (
      await s.call("/api/backup/export", "POST", {
        revision: state.revision,
        scope: "unknown",
      })
    ).status,
    400,
  );
});
