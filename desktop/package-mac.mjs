import { packager } from '@electron/packager';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cp, mkdir, mkdtemp, readFile, writeFile, access, readdir, rm } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { distributableSource } from './package-policy.mjs';
const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (process.platform !== 'darwin' || process.arch !== 'arm64') throw Error('首版打包需在 Apple 芯片 Mac 上运行。');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const stamp = (await readFile(join(root, 'dist/client/.shiguang-version'), 'utf8')).trim();
if (stamp !== pkg.version) throw Error('请先运行 npm run build。');
const output = join(root, 'build', 'desktop');
await mkdir(output, { recursive: true });
const stage = await mkdtemp(join(output, 'stage-'));
// Only tracked public/runtime files and the three explicit desktop entry files.
const { stdout } = await run('git', ['ls-files', '-z'], { cwd: root, maxBuffer: 16 * 1024 * 1024 });
const files = [...new Set([...stdout.split('\0').filter(distributableSource),
  'desktop/main.mjs', 'desktop/runtime.mjs', 'desktop/preload.cjs'])];
for (const file of files) {
  await mkdir(dirname(join(stage, file)), { recursive: true });
  await cp(join(root, file), join(stage, file), { dereference: true });
}
// Build-generated JS/CSS plus only version-controlled public assets.
await mkdir(join(stage, 'dist/client'), { recursive: true });
for (const file of (await readdir(join(root, 'dist/client'))).filter(name => /\.(html|rsc)$/.test(name) || ['.shiguang-version', 'vinext-client-entry-manifest.json'].includes(name))) await cp(join(root, 'dist/client', file), join(stage, 'dist/client', file));
await cp(join(root, 'dist/client/_next'), join(stage, 'dist/client/_next'), { recursive: true });
for (const file of files.filter(file => file.startsWith('public/'))) {
  const relative = file.slice(7);
  await mkdir(dirname(join(stage, 'dist/client', relative)), { recursive: true });
  await cp(join(root, 'dist/client', relative), join(stage, 'dist/client', relative));
}
// The backend's only npm runtime dependency is sharp. Copy its installed dependency
// closure, including native optional packages and licenses, never the project tree.
const copied = new Set();
async function copyDependency(name, from = root) {
  let base = from, source;
  while (true) {
    const candidate = join(base, 'node_modules', name);
    try { await access(join(candidate, 'package.json')); source = candidate; break; } catch {}
    const parent = dirname(base); if (parent === base) throw Error(`缺少依赖：${name}`); base = parent;
  }
  if (copied.has(name)) return;
  copied.add(name);
  await cp(source, join(stage, 'node_modules', name), { recursive: true, dereference: true });
  const dependency = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
  for (const child of Object.keys(dependency.dependencies || {})) await copyDependency(child, source);
  for (const child of Object.keys(dependency.optionalDependencies || {})) {
    // Optional native binaries for other platforms are intentionally absent.
    try { await access(join(root, 'node_modules', child, 'package.json')); } catch { continue; }
    await copyDependency(child, source);
  }
}
await copyDependency('sharp');
await writeFile(join(stage, 'package.json'), JSON.stringify({ name: pkg.name, productName: '拾光手帐',
  version: pkg.version, private: true, type: 'module', main: 'desktop/main.mjs', dependencies: { sharp: pkg.dependencies.sharp } }, null, 2));
const apps = await packager({ dir: stage, out: output, name: '拾光手帐', platform: 'darwin', arch: 'arm64',
  electronVersion: pkg.devDependencies.electron, appVersion: pkg.version, appBundleId: 'com.shiguang.journal',
  icon: join(root, 'public/app-icon.icns'),
  extendInfo: { LSMinimumSystemVersion: '26.0' }, asar: false, prune: false, overwrite: true, osxSign: false, osxNotarize: false });
const app = join(apps[0], '拾光手帐.app');
// Ad-hoc signature for local testing. This is NOT Developer ID signing/notarization.
await run('codesign', ['--force', '--deep', '--sign', '-', app], { maxBuffer: 4 * 1024 * 1024 });
const zip = join(output, `shiguang-journal-v${pkg.version}-mac-arm64.zip`);
await run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, zip]);
await rm(stage, { recursive: true, force: true });
console.log(`测试应用：${app}\n分享测试包（未公证）：${zip}`);
