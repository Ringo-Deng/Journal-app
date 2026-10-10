// Merge only explicitly selected, validated finished-material packs. Originals stay untouched.
import { createReadStream, constants } from 'node:fs';
import { mkdtemp, mkdir, copyFile, stat, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readMaterialPack, MATERIAL_PACK_FORMAT, MATERIAL_PACK_MAX, MATERIAL_PACK_IMPORT_MAX_ITEMS } from '../local/material-pack.mjs';
import { writeArchive } from '../local/backup-archive.mjs';
const [output, ...inputs] = process.argv.slice(2);
if (!output?.endsWith('.shiguang-materials') || !inputs.length || inputs.some(p => !p.endsWith('.shiguang-materials')))
  throw Error('用法：node desktop/package-materials.mjs 输出.shiguang-materials 输入1.shiguang-materials 输入2.shiguang-materials ...');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const stage = await mkdtemp(join(tmpdir(), 'shiguang-material-merge-'));
try {
  const source = join(stage, 'source');
  await mkdir(join(source, 'uploads'), { recursive: true });
  const assets = [];
  for (const [index, path] of inputs.entries()) {
    const pack = await readMaterialPack(createReadStream(path), join(stage, `input-${index}`));
    assets.push(...pack.manifest.snapshot.assets);
    if (assets.length > MATERIAL_PACK_IMPORT_MAX_ITEMS) throw Error('合并后超过 500 条素材。');
    for (const file of pack.manifest.files) await copyFile(join(pack.directory, file.path), join(source, file.path));
  }
  const result = await writeArchive({ data: source, publicDir: source, directory: join(stage, 'merged'),
    snapshot: { format: MATERIAL_PACK_FORMAT, assets }, appVersion: version, scope: 'journals' });
  if ((await stat(result.archive)).size > MATERIAL_PACK_MAX) throw Error('合并后超过 256 MB。');
  // Read it back through the same validator used by the real importer.
  await readMaterialPack(createReadStream(result.archive), join(stage, 'verify'));
  await mkdir(dirname(resolve(output)), { recursive: true });
  await copyFile(result.archive, output, constants.COPYFILE_EXCL);
  console.log(`${output}: ${assets.length} 条素材，${result.manifest.files.length} 张不同图片；校验通过。`);
} finally {
  await rm(stage, { recursive: true, force: true });
}
