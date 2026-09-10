import { mkdir, readFile, writeFile, rename, rm, lstat, copyFile, open } from "node:fs/promises";
import { join, dirname, extname } from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { digest, fail, fileHash, referencedResources, validResource } from "./backup-archive.mjs";

const metadataFiles = new Set([
  "journal.json",
  "journal.previous.json",
  "materials.json",
  "material-jobs.json",
  "material-catalog.json",
  "material-classification-jobs.json",
  "pinterest-imports.json",
  "photo-library.json",
  "photo-trash.json",
  "fonts.json",
  "backup-imports.json",
]);
const historyPath = /^journal-history\/\d{13}-[a-f0-9-]{36}\.json$/;
const record = (value) => value && typeof value === "object" && !Array.isArray(value);
const uuid = (value) => {
  const hash = digest(value);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
};
const arrays = [
  "assets",
  "materialJobs",
  "pinterestImports",
  "classificationJobs",
  "photos",
  "fonts",
  "histories",
];

export function validateSnapshot(snapshot, validateState) {
  if (!record(snapshot) || !record(snapshot.state)) throw fail("备份缺少手帐数据。");
  validateState(snapshot.state);
  for (const key of arrays)
    if (!Array.isArray(snapshot[key]) || snapshot[key].length > 100000)
      throw fail("备份资料清单无效。");
  const unique = (items, check) => {
    const ids = new Set();
    for (const item of items) {
      if (
        !record(item) ||
        typeof item.id !== "string" ||
        !item.id ||
        ids.has(item.id) ||
        !check(item)
      )
        throw fail("备份中有无效或重复的资料记录。");
      ids.add(item.id);
    }
  };
  unique(
    snapshot.assets,
    (a) =>
      typeof a.name === "string" &&
      Array.isArray(a.tags) &&
      a.tags.every((t) => typeof t === "string") &&
      typeof a.src === "string",
  );
  unique(
    snapshot.materialJobs,
    (j) =>
      typeof j.source === "string" &&
      Array.isArray(j.items) &&
      j.items.every(
        (i) =>
          record(i) &&
          typeof i.id === "string" &&
          typeof i.src === "string" &&
          typeof i.name === "string",
      ),
  );
  unique(
    snapshot.photos,
    (p) =>
      /^[a-f0-9]{64}$/.test(p.id) &&
      p.sha256 === p.id &&
      typeof p.src === "string" &&
      typeof p.originalFile === "string" &&
      p.thumbnailSrc === `/api/photos/thumbnail/${p.id}` &&
      typeof p.originalName === "string" &&
      Number.isFinite(Date.parse(p.capturedAt)),
  );
  unique(
    snapshot.fonts,
    (f) =>
      /^[a-f0-9]{24}$/.test(f.id) &&
      [".ttf", ".otf", ".woff", ".woff2"].includes(f.ext) &&
      typeof f.name === "string" &&
      typeof f.sha === "string" &&
      f.sha.startsWith(f.id),
  );
  const fileReferences = referencedResources(snapshot);
  for (const photo of snapshot.photos)
    if (
      !/^uploads\/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/.test(photo.src?.slice(1) || "") ||
      !/^(?:photo-originals\/[a-f0-9]{64}\.(?:jpg|png|webp|heic|heif)|uploads\/[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp))$/.test(
        photo.originalFile,
      ) ||
      photo.originalName.length > 180
    )
      throw fail("备份照片路径或名称无效。");
  for (const asset of snapshot.assets)
    if (!/^\/(uploads|materials)\//.test(asset.src) || !fileReferences.has(asset.src.slice(1)))
      throw fail("备份素材缺少本机图片。");
  function fonts(v) {
    if (Array.isArray(v)) v.forEach(fonts);
    else if (record(v)) {
      if (typeof v.fontFamily === "string") {
        for (const match of v.fontFamily.matchAll(/Journal User ([a-f0-9]{24})/g))
          if (!snapshot.fonts.some((f) => f.id === match[1]))
            throw fail("手帐引用的自定义字体未包含在备份中。");
      }
      Object.values(v).forEach(fonts);
    }
  }
  // Check nesting before traversing font references below.
  const c = snapshot.catalog;
  if (
    !record(c) ||
    !record(c.overrides) ||
    !record(c.taxonomy) ||
    !Array.isArray(c.taxonomy.groups) ||
    !record(c.taxonomy.labels) ||
    ["content", "style", "color"].some((d) => !Array.isArray(c.taxonomy.labels[d]))
  )
    throw fail("备份中的素材分类无效。");
  for (const values of [c.taxonomy.groups, ...Object.values(c.taxonomy.labels)])
    if (values.some((v) => typeof v !== "string")) throw fail("备份标签无效。");
  for (const value of Object.values(c.overrides))
    if (
      !record(value) ||
      (value.labels &&
        ["content", "style", "color"].some(
          (d) =>
            value.labels[d] !== undefined &&
            (!Array.isArray(value.labels[d]) || value.labels[d].some((v) => typeof v !== "string")),
        ))
    )
      throw fail("备份素材标签无效。");
  if (
    !record(snapshot.trash) ||
    !Array.isArray(snapshot.trash.entries) ||
    !Array.isArray(snapshot.trash.deletedSources)
  )
    throw fail("备份中的照片回收站无效。");
  unique(
    snapshot.trash.entries,
    (e) => typeof e.src === "string" && typeof e.resultSrc === "string" && record(e.original),
  );
  for (const h of snapshot.histories) {
    if (
      h.format !== "shiguang-history-v1" ||
      !Number.isFinite(Date.parse(h.createdAt)) ||
      Date.parse(h.createdAt) < 0 ||
      Date.parse(h.createdAt) > 9999999999999 ||
      !["daily", "before-delete"].includes(h.reason) ||
      !Number.isSafeInteger(h.revision) ||
      h.revision < 0 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(h.day)
    )
      throw fail("备份中的历史记录无效。");
    validateState(h);
  }
  if (snapshot.previous) validateState(snapshot.previous);
  // Maps from untrusted archives must never influence object prototypes.
  function keys(v, depth = 0) {
    if (depth > 80) throw fail("备份资料嵌套过深。");
    if (v && typeof v === "object")
      for (const [k, x] of Object.entries(v)) {
        if (["__proto__", "constructor", "prototype"].includes(k)) throw fail("备份含有无效字段。");
        keys(x, depth + 1);
      }
  }
  keys(snapshot);
  fonts(snapshot);
}
export function summaryOf(snapshot, files) {
  return {
    books: snapshot.state.books.length,
    photos: snapshot.photos.length,
    materials: snapshot.assets.length,
    processing: snapshot.materialJobs.length,
    fonts: snapshot.fonts.length,
    histories: snapshot.histories.length + (snapshot.previous ? 1 : 0),
    trash: snapshot.trash.entries.length,
    files: files.length,
    bytes: files.reduce((n, f) => n + f.size, 0),
    titles: snapshot.state.books.map((b) => b.title),
  };
}
const idFields = new Set([
  "id",
  "bookId",
  "spreadId",
  "pieceId",
  "assetId",
  "dayId",
  "groupId",
  "replaceAssetId",
  "jobId",
  "sourceJobId",
]);
function remapper(paths, ids) {
  function remap(value, key = "") {
    if (typeof value === "string")
      return (
        (["text", "raw", "title", "name", "instruction"].includes(key)
          ? undefined
          : paths.get(value)) ||
        (idFields.has(key) ? ids.get(value) : undefined) ||
        value
      );
    if (Array.isArray(value)) return value.map((v) => remap(v, key));
    if (record(value))
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, remap(v, k)]));
    return value;
  }
  return remap;
}
async function exists(path) {
  try {
    return await lstat(path);
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
}
async function safeFolder(data, directory) {
  const path = join(data, directory),
    info = await exists(path);
  if (info && !info.isDirectory()) throw fail("恢复目标目录无效。");
  if (!info) await mkdir(path, { recursive: true, mode: 0o700 });
}

/** Build an additive restore completely in staging before the write-ahead transaction. */
export async function planRestore({ staged, current, data, validateState }) {
  const { manifest, id, directory } = staged,
    incoming = manifest.snapshot;
  validateSnapshot(incoming, validateState);
  const paths = new Map(),
    ids = new Map(),
    resources = new Map();
  const destination = join(directory, "commit");
  await mkdir(destination, { mode: 0o700 });
  for (const file of manifest.files) {
    let source = join(directory, file.path),
      hash = file.sha256,
      target = file.path;
    if (file.path.startsWith("materials/")) {
      if (extname(file.path) === ".svg") {
        const bytes = await sharp(source, { limitInputPixels: 50000000 }).png().toBuffer();
        hash = digest(bytes);
        source = join(directory, `${hash}.png`);
        await writeFile(source, bytes, { mode: 0o600 });
      }
      target = `uploads/${uuid(hash)}${extname(file.path) === ".svg" ? ".png" : extname(file.path) === ".jpeg" ? ".jpg" : extname(file.path)}`;
    } else if (file.path.startsWith("uploads/")) {
      const existing = await exists(join(data, file.path));
      if (!existing || (await fileHash(data, file.path)) !== hash)
        target = `uploads/${uuid(hash)}${extname(file.path) === ".jpeg" ? ".jpg" : extname(file.path)}`;
    }
    const existing = await exists(join(data, target));
    if (existing && (await fileHash(data, target)) !== hash)
      throw fail("恢复目标存在同名但内容不同的文件，已停止以保护现有资料。", 409);
    if (!existing && !resources.has(target)) {
      const path = join(destination, target);
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      await copyFile(source, path);
      resources.set(target, hash);
    }
    paths.set("/" + file.path, "/" + target);
    paths.set(file.path, target);
  }
  // Content-addressed photos are reused; page references follow the existing library image.
  for (const photo of incoming.photos) {
    const existing = current.photos.find((p) => p.id === photo.id);
    if (existing) paths.set(photo.src, existing.src);
  }
  const register = (value) => {
    if (value && typeof value === "object") {
      for (const [key, v] of Object.entries(value)) {
        if (idFields.has(key) && typeof v === "string") ids.set(v, uuid(id + ":" + v));
        else register(v);
      }
    }
  };
  register(incoming.state);
  register(incoming.histories);
  register(incoming.previous);
  register(incoming.materialJobs);
  register(incoming.assets);
  register(incoming.trash.entries);
  register(incoming.pinterestImports);
  register(incoming.classificationJobs);
  const remap = remapper(paths, ids),
    restored = remap(incoming);
  // Photo/font IDs are hashes, not journal identities.
  restored.photos = incoming.photos.map((p) => ({
    ...remap(p),
    id: p.id,
    sha256: p.sha256,
    thumbnailSrc: p.thumbnailSrc,
  }));
  restored.fonts = structuredClone(incoming.fonts);
  const books = [...current.state.books, ...restored.state.books];
  validateState({ books });
  const assets = [...current.assets, ...restored.assets];
  const catalog = structuredClone(current.catalog);
  catalog.revision = (catalog.revision || 0) + 1;
  catalog.autoManaged = true;
  catalog.taxonomy.groups = [
    ...new Set([...catalog.taxonomy.groups, ...restored.catalog.taxonomy.groups]),
  ];
  for (const d of ["content", "style", "color"])
    catalog.taxonomy.labels[d] = [
      ...new Set([...catalog.taxonomy.labels[d], ...restored.catalog.taxonomy.labels[d]]),
    ];
  // Imported metadata only affects the newly restored asset identities.
  for (const [key, value] of Object.entries(incoming.catalog.overrides))
    if (ids.has(key)) catalog.overrides[ids.get(key)] = remap(value);
  const photos = [
    ...current.photos,
    ...restored.photos.filter((p) => !current.photos.some((x) => x.id === p.id)),
  ];
  const fonts = [
    ...current.fonts,
    ...restored.fonts.filter((f) => !current.fonts.some((x) => x.id === f.id)),
  ];
  const trash = {
    entries: [...current.trash.entries, ...restored.trash.entries.filter((e) => !e.deleting)],
    deletedSources: current.trash.deletedSources,
  };
  // Do not carry deleted-source tombstones into another library. Restored originals are new/reused verified files.
  if (
    trash.deletedSources.some((src) => referencedResources({ state: { books } }).has(src.slice(1)))
  )
    throw fail("恢复图片与本机删除记录冲突，已停止恢复。", 409);
  const nextState = { revision: current.state.revision + 1, books };
  if (Buffer.byteLength(JSON.stringify(nextState)) > 18 * 1024 * 1024 - 1024)
    throw fail("恢复后的手帐内容超过当前保存容量，请先减少本机笔记本数量后再恢复。", 413);
  const updates = {
    "journal.previous.json": current.state,
    "materials.json": assets,
    "material-jobs.json": [...current.materialJobs, ...restored.materialJobs],
    "material-catalog.json": catalog,
    "material-classification-jobs.json": [
      ...current.classificationJobs,
      ...restored.classificationJobs.map((j) => ({
        ...j,
        applied: true,
        discarded: true,
        status: ["queued", "running"].includes(j.status) ? "interrupted" : j.status,
      })),
    ],
    "pinterest-imports.json": [...current.pinterestImports, ...restored.pinterestImports],
    "photo-library.json": photos,
    "photo-trash.json": trash,
    "fonts.json": fonts,
    "backup-imports.json": [
      ...current.imports,
      { id, restoredAt: new Date().toISOString(), summary: summaryOf(incoming, manifest.files) },
    ],
    "journal.json": nextState,
  };
  const histories = [...restored.histories];
  if (restored.previous)
    histories.push({
      format: "shiguang-history-v1",
      createdAt: manifest.createdAt,
      day: manifest.createdAt.slice(0, 10),
      reason: "daily",
      revision: restored.previous.revision || 0,
      books: restored.previous.books,
    });
  // Preserve the current previous snapshot as history before replacing the previous slot.
  if (current.previous)
    histories.push({
      format: "shiguang-history-v1",
      createdAt: new Date().toISOString(),
      day: new Date().toISOString().slice(0, 10),
      reason: "before-delete",
      revision: current.previous.revision || 0,
      books: current.previous.books,
    });
  for (const h of histories) {
    const historyId = `${String(Date.parse(h.createdAt)).padStart(13, "0")}-${randomUUID()}`;
    updates[`journal-history/${historyId}.json`] = { ...h, id: historyId, restored: true };
  }
  for (const [path, value] of Object.entries(updates)) {
    await mkdir(dirname(join(destination, path)), { recursive: true, mode: 0o700 });
    await writeFile(join(destination, path), JSON.stringify(value), { mode: 0o600 });
  }
  return {
    directory: destination,
    files: [
      ...resources.keys(),
      ...Object.keys(updates).filter((path) => path !== "journal.json"),
      "journal.json",
    ],
    state: nextState,
  };
}

function validTarget(path) {
  return (
    (validResource(path) && !path.startsWith("materials/")) ||
    metadataFiles.has(path) ||
    historyPath.test(path)
  );
}
async function syncFile(path) {
  const file = await open(path, "r");
  try {
    await file.sync();
  } finally {
    await file.close();
  }
}
/** After ready.json is durable, a failed/interrupted commit is rolled forward before any server reads. */
export async function recoverBackupTransaction(data) {
  const directory = join(data, ".backup-transaction");
  if (!(await exists(directory))) return false;
  if (!(await lstat(directory)).isDirectory()) throw fail("恢复事务目录无效。", 500);
  const plan = JSON.parse(await readFile(join(directory, "ready.json"), "utf8"));
  if (
    !Array.isArray(plan.files) ||
    plan.files.some((f) => !validTarget(f)) ||
    !plan.files.includes("journal.json")
  )
    throw fail("恢复事务清单无效，已停止启动。", 500);
  for (const path of plan.files) {
    if (dirname(path) !== ".") await safeFolder(data, dirname(path));
    const source = join(directory, path);
    if (!(await lstat(source)).isFile()) throw fail("恢复事务文件不完整。", 500);
    const target = join(data, path),
      temporary = target + "." + randomUUID() + ".tmp";
    await copyFile(source, temporary);
    await syncFile(temporary);
    await rename(temporary, target);
  }
  // Rename first: a crash during cleanup must not leave a half-deleted replay log.
  const completed = join(data, ".backup-completed-" + randomUUID());
  await rename(directory, completed);
  await rm(completed, { recursive: true, force: true }).catch(() => {});
  return true;
}
export async function commitRestore(data, plan) {
  if (await exists(join(data, ".backup-transaction")))
    throw fail("尚有恢复事务待完成，请重新启动手帐。", 503);
  for (const path of plan.files) await syncFile(join(plan.directory, path));
  await writeFile(join(plan.directory, "ready.json"), JSON.stringify({ files: plan.files }), {
    mode: 0o600,
  });
  await syncFile(join(plan.directory, "ready.json"));
  await rename(plan.directory, join(data, ".backup-transaction"));
  await recoverBackupTransaction(data);
}
