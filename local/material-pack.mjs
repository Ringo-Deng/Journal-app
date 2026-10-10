import { randomUUID } from 'node:crypto';
import { writeFile, mkdir, unlink } from 'node:fs/promises';
import { join, extname } from 'node:path';
import sharp from 'sharp';
import { safeFile, digest, writeArchive, readArchive, fail } from './backup-archive.mjs';

export const MATERIAL_PACK_FORMAT = 'shiguang-materials-v1';
export const MATERIAL_PACK_MAX = 256 * 1024 * 1024;
export const MATERIAL_PACK_IMPORT_MAX_ITEMS = 500;
const MAX_ITEMS = 200, MAX_IMAGE = 16 * 1024 * 1024;
const imagePath = /^\/(uploads|materials)\/[a-zA-Z0-9_-][a-zA-Z0-9._-]*\.(png|jpg|jpeg|webp)$/;
const text = (value, limit) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
function strings(value, limit = 40) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(v => typeof v === 'string').map(v => text(v, limit)).filter(Boolean))].slice(0, 40);
}
export function materialPackMetadata(asset) {
  return { name: text(asset.name, 80) || '导入素材', category: text(asset.category, 40) || '我的素材',
    tags: strings(asset.tags), group: text(asset.group, 40),
    labels: Object.fromEntries(['content', 'style', 'color'].map(key => [key, strings(asset.labels?.[key], 12)])),
    author: text(asset.author, 120), license: text(asset.license, 200) };
}
async function bytesOf(src, data, publicDir) {
  if (!imagePath.test(src || '') || src.includes('..')) throw fail('请选择已入库的 PNG、JPG 或 WebP 素材。');
  const file = await safeFile(src.startsWith('/materials/') ? publicDir : data, src.slice(1));
  try {
    if ((await file.stat()).size > MAX_IMAGE) throw fail('单件素材不能超过 16 MB。', 413);
    return await file.readFile();
  } finally { await file.close(); }
}
async function validateImage(bytes, src) {
  const image = sharp(bytes, { limitInputPixels: 40_000_000, failOn: 'warning' });
  const meta = await image.metadata();
  if (!['png', 'jpeg', 'webp'].includes(meta.format) || (meta.pages || 1) !== 1) throw fail('素材包包含不支持的图片。');
  const expected = extname(src).toLowerCase();
  if (!(meta.format === 'jpeg' ? ['.jpg', '.jpeg'] : ['.' + meta.format]).includes(expected)) throw fail('素材图片格式与文件名不一致。');
  // Fully decode before committing, so truncated image data cannot enter the library.
  await image.stats();
}
export async function exportMaterialPack({ ids, assets, data, publicDir, directory, appVersion }) {
  if (!Array.isArray(ids) || !ids.length || ids.length > MAX_ITEMS || ids.some(id => typeof id !== 'string'))
    throw fail('每个素材包请选择 1–200 件素材。');
  const selected = [...new Set(ids)].map(id => assets.find(asset => asset.id === id));
  if (selected.some(asset => !asset)) throw fail('所选素材已变化，请刷新后重新选择。', 409);
  let size = 0;
  const packed = [];
  // A private staging directory contains only finished images, never source sheets.
  const source = join(directory, 'source');
  await mkdir(join(source, 'uploads'), { recursive: true, mode: 0o700 });
  for (const asset of selected) {
    const bytes = await bytesOf(asset.src, data, publicDir);
    size += bytes.length;
    if (size > MATERIAL_PACK_MAX - 1024 * 1024) throw fail('素材包超过 256 MB，请分批导出。', 413);
    await validateImage(bytes, asset.src);
    const src = '/uploads/' + digest(bytes) + extname(asset.src).toLowerCase();
    await writeFile(join(source, src.slice(1)), bytes, { mode: 0o600 });
    packed.push({ ...materialPackMetadata(asset), src });
  }
  return writeArchive({ data: source, publicDir, directory: join(directory, 'archive'),
    snapshot: { format: MATERIAL_PACK_FORMAT, assets: packed }, appVersion, scope: 'journals' });
}
export async function readMaterialPack(input, directory) {
  async function* bounded() {
    let size = 0;
    for await (const chunk of input) {
      size += chunk.length;
      if (size > MATERIAL_PACK_MAX) throw fail('素材包不能超过 256 MB。', 413);
      yield chunk;
    }
  }
  const staged = await readArchive(bounded(), directory);
  const snapshot = staged.manifest.snapshot;
  if (snapshot.format !== MATERIAL_PACK_FORMAT || Object.keys(snapshot).some(k => !['format', 'assets'].includes(k)) ||
      !Array.isArray(snapshot.assets) || !snapshot.assets.length)
    throw fail('请选择拾光素材包，完整资料备份请从备份入口恢复。');
  if (snapshot.assets.length > MATERIAL_PACK_IMPORT_MAX_ITEMS)
    throw fail('每次最多导入 500 件素材，请选择较小的素材包。', 413);
  const paths = new Set();
  for (const asset of snapshot.assets) {
    if (!asset || typeof asset !== 'object' || !/^\/uploads\/[a-f0-9]{64}\.(png|jpg|jpeg|webp)$/.test(asset.src)) throw fail('素材包图片路径无效。');
    if (Object.keys(asset).some(k => !['name', 'category', 'tags', 'group', 'labels', 'author', 'license', 'src'].includes(k))) throw fail('素材包包含不支持的字段。');
    const bytes = await bytesOf(asset.src, directory, directory);
    if (!asset.src.includes(digest(bytes))) throw fail('素材图片内容校验失败。');
    await validateImage(bytes, asset.src);
    paths.add(asset.src.slice(1));
  }
  if (staged.manifest.files.some(file => !paths.has(file.path)) || paths.size !== staged.manifest.files.length)
    throw fail('素材包包含未声明的文件。');
  return staged;
}

/** Called inside the existing materialWrite queue. Images precede one atomic index write. */
export async function importMaterialPack({ staged, existing, allAssets, data, publicDir, writeAssets, registerTaxonomy }) {
  const seen = new Set();
  for (const asset of allAssets) {
    try { seen.add(digest(await bytesOf(asset.src, data, publicDir))); }
    catch (error) { if (!['ENOENT'].includes(error.code) && error.status !== 400 && error.status !== 413) throw error; }
  }
  const added = [], files = [];
  let skipped = 0;
  try {
    for (const asset of staged.manifest.snapshot.assets) {
      const bytes = await bytesOf(asset.src, staged.directory, staged.directory);
      const hash = digest(bytes);
      if (seen.has(hash)) { skipped++; continue; }
      const src = '/uploads/' + randomUUID() + extname(asset.src);
      await mkdir(join(data, 'uploads'), { recursive: true, mode: 0o700 });
      const file = join(data, src.slice(1));
      await writeFile(file, bytes, { flag: 'wx', mode: 0o600 }); files.push(file);
      added.push({ ...materialPackMetadata(asset), id: randomUUID(), src, sourceUrl: src, sourceImage: src });
      seen.add(hash);
    }
    if (added.length) {
      // Taxonomy additions are harmless if the later index write fails; old assets remain unchanged.
      await registerTaxonomy(added);
      await writeAssets([...existing, ...added]);
    }
    return { added: added.length, skipped };
  } catch (error) {
    await Promise.all(files.map(file => unlink(file).catch(() => {})));
    throw error;
  }
}
