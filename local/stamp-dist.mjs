import { access, readFile, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const version = String(pkg.version || '').trim();
const index = resolve(root, 'dist/client/index.html');

if (!version) throw Error('package.json 缺少 version。');
await access(index, constants.F_OK);
const intro = resolve(root, 'dist/client/intro/index.html');
const introHtml = await readFile(intro, 'utf8');
await writeFile(intro, introHtml.replace('<!--SHIGUANG_VERSION-->', `v${version}`), 'utf8');
await writeFile(resolve(root, 'dist/client/.shiguang-version'), `${version}\n`, 'utf8');
console.log(`production bundle stamped: v${version}`);
