import { createHash, randomUUID } from "node:crypto";
import { createReadStream, constants } from "node:fs";
import { open, mkdir, lstat, readdir, rm } from "node:fs/promises";
import { join, dirname } from "node:path";

export const BACKUP_FORMAT = "shiguang-backup-v1";
export const fail = (message, status = 400) => Object.assign(Error(message), { status });
export const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const MAX_MANIFEST = 64 * 1024 * 1024;
const MAX_FILES = 100000;
const MAX_TOTAL = 100 * 1024 ** 3;
const MAX_FILE = 128 * 1024 ** 2;
const directories = ["uploads", "photo-originals", "photo-thumbnails", "user-fonts"];
export function validResource(path) {
  return (
    typeof path === "string" &&
    /^(?:uploads\/[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp)|photo-originals\/[a-f0-9]{64}\.(?:jpg|png|webp|heic|heif)|photo-thumbnails\/[a-f0-9]{64}\.webp|user-fonts\/[a-f0-9]{24}\.(?:ttf|otf|woff|woff2)|materials\/[a-zA-Z0-9._-]+\.(?:jpg|jpeg|png|webp|svg))$/.test(
      path,
    ) &&
    !path.includes("..")
  );
}
export async function safeFile(root, path) {
  if (!validResource(path)) throw fail("备份包含不支持的文件路径。");
  const folder = join(root, dirname(path));
  if (!(await lstat(folder)).isDirectory()) throw fail("资料目录不是普通文件夹，已停止备份。");
  const file = await open(join(root, path), constants.O_RDONLY | constants.O_NOFOLLOW);
  const info = await file.stat();
  if (!info.isFile() || info.size > MAX_FILE) {
    await file.close();
    throw fail("备份中有无效或过大的文件。");
  }
  return file;
}
export async function fileHash(root, path) {
  const file = await safeFile(root, path);
  try {
    const hash = createHash("sha256");
    for await (const chunk of file.createReadStream({ autoClose: false })) hash.update(chunk);
    return hash.digest("hex");
  } finally {
    await file.close();
  }
}
export async function collectResources(data, snapshot) {
  const paths = new Set();
  for (const directory of directories) {
    let entries;
    try {
      if (!(await lstat(join(data, directory))).isDirectory()) throw fail("资料目录无效。");
      entries = await readdir(join(data, directory), { withFileTypes: true });
    } catch (e) {
      if (e.code === "ENOENT") continue;
      throw e;
    }
    for (const entry of entries) {
      const path = `${directory}/${entry.name}`;
      if (validResource(path)) {
        if (!entry.isFile()) throw fail("资料中包含文件链接，已停止备份。");
        paths.add(path);
      }
    }
  }
  for (const path of referencedResources(snapshot)) paths.add(path);
  return [...paths].sort();
}
// Only image-bearing fields are references; journal prose is never interpreted as a path.
const referenceKeys = new Set([
  "src",
  "source",
  "sourceImage",
  "sourceUrl",
  "originalSrc",
  "photoOriginal",
  "coverAsset",
  "resultSrc",
  "originalFile",
]);
export function referencedResources(value) {
  const paths = new Set();
  function walk(value, key = "") {
    if (typeof value === "string") {
      if (
        (referenceKeys.has(key) || key === "photos") &&
        /^(?:\/(?:uploads|materials)\/|photo-originals\/|uploads\/)/.test(value)
      ) {
        const path = value.replace(/^\//, "");
        if (!validResource(path)) throw fail("资料引用了不支持的本机图片路径。");
        paths.add(path);
      }
    } else if (Array.isArray(value)) value.forEach((item) => walk(item, key));
    else if (value && typeof value === "object")
      for (const [k, v] of Object.entries(value)) walk(v, k);
  }
  walk(value);
  for (const font of value.fonts || []) paths.add(`user-fonts/${font.id}${font.ext}`);
  for (const photo of value.photos || []) paths.add(`photo-thumbnails/${photo.id}.webp`);
  return paths;
}
export async function writeArchive({ data, publicDir, directory, snapshot, appVersion }) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const files = [];
  let total = 0;
  for (const path of await collectResources(data, snapshot)) {
    let input;
    try {
      input = await safeFile(path.startsWith("materials/") ? publicDir : data, path);
    } catch (e) {
      if (e.code === "ENOENT")
        throw fail("缺少备份需要的文件：" + path + "。请找回文件后再备份。", 409);
      throw e;
    }
    const target = join(directory, "files", path);
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    const output = await open(target, "wx", 0o600),
      hash = createHash("sha256");
    let size = 0;
    try {
      for await (const chunk of input.createReadStream({ autoClose: false })) {
        size += chunk.length;
        total += chunk.length;
        if (size > MAX_FILE || total > MAX_TOTAL) throw fail("资料超过备份大小上限。", 413);
        hash.update(chunk);
        await output.writeFile(chunk);
      }
      await output.sync();
    } finally {
      await input.close();
      await output.close();
    }
    files.push({ path, size, sha256: hash.digest("hex") });
    if (files.length > MAX_FILES) throw fail("资料文件数量超过备份上限。", 413);
  }
  const manifest = {
    format: BACKUP_FORMAT,
    createdAt: new Date().toISOString(),
    appVersion,
    snapshot,
    files,
  };
  const header = JSON.stringify(manifest);
  if (Buffer.byteLength(header) > MAX_MANIFEST) throw fail("备份清单过大。", 413);
  const archive = join(directory, "archive.shiguang-backup"),
    output = await open(archive, "wx", 0o600);
  try {
    await output.writeFile(header + "\n");
    for (const file of files)
      for await (const chunk of createReadStream(join(directory, "files", file.path)))
        await output.writeFile(chunk);
    await output.writeFile("\n" + JSON.stringify({ complete: digest(header) }) + "\n");
    await output.sync();
  } finally {
    await output.close();
  }
  await rm(join(directory, "files"), { recursive: true, force: true });
  return { manifest, id: digest(header), archive };
}
/** Bounded streaming reader: even large photo archives never become one in-memory JSON. */
export async function readArchive(input, directory) {
  const iterator = input[Symbol.asyncIterator]();
  let buffer = Buffer.alloc(0),
    ended = false;
  async function refill() {
    const next = await iterator.next();
    ended = !!next.done;
    buffer = next.done ? Buffer.alloc(0) : Buffer.from(next.value);
  }
  async function line(max) {
    const chunks = [];
    let size = 0;
    while (true) {
      if (!buffer.length) {
        if (ended) throw fail("备份不完整，尚未恢复任何资料。");
        await refill();
        continue;
      }
      const index = buffer.indexOf(10),
        take = index < 0 ? buffer.length : index;
      size += take;
      if (size > max) throw fail("备份清单或结束标记过大。", 413);
      chunks.push(buffer.subarray(0, take));
      buffer = buffer.subarray(take + (index >= 0 ? 1 : 0));
      if (index >= 0) return Buffer.concat(chunks).toString("utf8");
    }
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const header = await line(MAX_MANIFEST);
  let manifest;
  try {
    manifest = JSON.parse(header);
  } catch {
    throw fail("无法识别备份清单。");
  }
  if (
    manifest?.format !== BACKUP_FORMAT ||
    !Number.isFinite(Date.parse(manifest.createdAt)) ||
    typeof manifest.appVersion !== "string" ||
    !manifest.snapshot ||
    !Array.isArray(manifest.files) ||
    manifest.files.length > MAX_FILES
  )
    throw fail("不是支持的拾光完整备份。");
  const paths = new Set();
  let total = 0;
  for (const file of manifest.files) {
    if (
      !validResource(file.path) ||
      paths.has(file.path) ||
      !Number.isSafeInteger(file.size) ||
      file.size < 0 ||
      file.size > MAX_FILE ||
      !/^[a-f0-9]{64}$/.test(file.sha256)
    )
      throw fail("备份文件清单无效。");
    paths.add(file.path);
    total += file.size;
    if (total > MAX_TOTAL) throw fail("备份超过大小上限。", 413);
  }
  for (const file of manifest.files) {
    const target = join(directory, file.path);
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    const output = await open(target, "wx", 0o600),
      hash = createHash("sha256");
    let remaining = file.size;
    try {
      while (remaining) {
        if (!buffer.length) {
          if (ended) throw fail("备份文件被截断，尚未恢复任何资料。");
          await refill();
          continue;
        }
        const chunk = buffer.subarray(0, Math.min(remaining, buffer.length));
        buffer = buffer.subarray(chunk.length);
        remaining -= chunk.length;
        hash.update(chunk);
        await output.writeFile(chunk);
      }
      await output.sync();
    } finally {
      await output.close();
    }
    if (hash.digest("hex") !== file.sha256) throw fail("备份文件校验不通过，尚未恢复任何资料。");
  }
  if ((await line(1)) !== "") throw fail("备份结束标记无效。");
  let end;
  try {
    end = JSON.parse(await line(256));
  } catch {
    throw fail("备份缺少有效结束标记。");
  }
  if (end?.complete !== digest(header)) throw fail("备份清单校验不通过。");
  if (buffer.length) throw fail("备份末尾包含多余内容。");
  if (!ended) {
    await refill();
    if (!ended) throw fail("备份末尾包含多余内容。");
  }
  for (const path of referencedResources(manifest.snapshot))
    if (!paths.has(path)) throw fail("备份缺少被引用的图片或字体，尚未恢复任何资料。");
  return { manifest, id: digest(header), directory };
}
export const backupToken = () => randomUUID();
