import { packager } from '@electron/packager';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cp, mkdir, mkdtemp, readFile, writeFile, access, readdir, rm } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { distributableWindowsSource } from './package-policy.mjs';
const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (process.platform !== 'win32' || process.arch !== 'x64') throw Error('请在 Windows x64 上运行打包，确保图片依赖与目标系统一致。');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const stamp = (await readFile(join(root, 'dist/client/.shiguang-version'), 'utf8')).trim();
if (stamp !== pkg.version) throw Error('请先运行 npm run build。');
const output = join(root, 'build', 'desktop');
await mkdir(output, { recursive: true });
const stage = await mkdtemp(join(output, 'stage-'));
// Only tracked public/runtime files and the three explicit desktop entry files.
const { stdout } = await run('git', ['ls-files', '-z'], { cwd: root, maxBuffer: 16 * 1024 * 1024 });
const files = [...new Set([...stdout.split('\0').filter(distributableWindowsSource),
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
// Fail before packaging if the installed native dependency cannot process images.
const { default: sharp } = await import('sharp');
await sharp({ create: { width: 2, height: 2, channels: 4, background: '#ffffff' } }).png().toBuffer();
const apps = await packager({ dir: stage, out: output, name: '拾光手帐', platform: 'win32', arch: 'x64',
  electronVersion: pkg.devDependencies.electron, appVersion: pkg.version,
  asar: false, prune: false, overwrite: true,
  win32metadata: { CompanyName: '拾光手帐', FileDescription: '拾光手帐', ProductName: '拾光手帐' } });
await cp(join(root, 'docs/windows-desktop.md'), join(apps[0], '使用说明.md'));
await rm(stage, { recursive: true, force: true });
console.log(`Windows 测试应用：${apps[0]}`);
