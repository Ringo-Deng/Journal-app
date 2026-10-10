import { readFile, mkdir, copyFile, writeFile, stat } from 'node:fs/promises';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const appFile = `shiguang-journal-v${version}-mac-arm64.zip`;
const materialSource = process.argv[2];
if (!materialSource) throw Error('请显式指定已经核对过的素材合集 ZIP 路径。');
const materialFile = 'shiguang-materials.zip';
const appSource = join(root, 'build/desktop', appFile);
const appInfo = await stat(appSource), materialInfo = await stat(materialSource);
if (!appInfo.isFile() || !materialInfo.isFile() || !materialSource.endsWith('.zip')) throw Error('下载文件必须为 ZIP 文件。');
const output = join(root, 'build', `shiguang-intro-v${version}`);
await mkdir(join(output, 'downloads'), { recursive: true });
await mkdir(join(output, 'assets'), { recursive: true });
await copyFile(appSource, join(output, 'downloads', appFile));
await copyFile(materialSource, join(output, 'downloads', materialFile));
for (const [source, target] of [['asset-088-cut.png', 'flower.png'], ['asset-077-cut.png', 'manuscript.png']])
  await copyFile(join(root, 'public/materials', source), join(output, 'assets', target));
const size = bytes => `${Math.round(bytes / 1024 / 1024)} MB`;
const values = { VERSION: version, APP_FILE: appFile, MATERIAL_FILE: materialFile, APP_SIZE: size(appInfo.size), MATERIAL_SIZE: size(materialInfo.size) };
let html = await readFile(join(root, 'website/index.template.html'), 'utf8');
for (const [key, value] of Object.entries(values)) html = html.replaceAll(`{{${key}}}`, value);
if (/\{\{[A-Z_]+\}\}/.test(html)) throw Error('页面存在未替换的字段。');
await writeFile(join(output, 'index.html'), html);
const hashes = [];
for (const name of [appFile, materialFile]) {
  const hash = createHash('sha256');
  for await (const part of createReadStream(join(output, 'downloads', name))) hash.update(part);
  hashes.push(`${hash.digest('hex')}  downloads/${name}`);
}
await writeFile(join(output, 'SHA256SUMS.txt'), hashes.join('\n') + '\n');
await writeFile(join(output, '使用说明.txt'), '解压后打开 index.html，即可查看功能介绍并使用两个下载按钮。\n请保留 assets 和 downloads 文件夹；分享时发送整个文件夹或完整 ZIP。\n此页面尚未发布到公网。部署时需保持相对路径，下载文件需要支持大文件的存储空间。\n');
console.log(`介绍页：${join(output, 'index.html')}\n分享目录：${basename(output)}`);
