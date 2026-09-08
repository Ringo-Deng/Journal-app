import { spawn } from 'node:child_process';
import { access, copyFile, mkdir, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const APP_VERSION = String(packageJson.version || '').trim();
// This is an internal API protocol marker, not the visible application version.
// Keep it paired with local/server.mjs until the server protocol itself changes.
const EXPECTED_RUNTIME = 'page-elements-v0.1.20';
const REQUIRED_NODE = [22, 13, 0];
const noOpen = process.env.SHIGUANG_NO_OPEN === '1';
const exitAfterHealth = process.env.SHIGUANG_EXIT_AFTER_HEALTH === '1';
const devMode = process.env.SHIGUANG_DEV === '1';

function nodeVersionOK(version = process.versions.node) {
  const parts = String(version).split('.').map((v) => Number(v) || 0);
  for (let i = 0; i < REQUIRED_NODE.length; i++) {
    if ((parts[i] || 0) > REQUIRED_NODE[i]) return true;
    if ((parts[i] || 0) < REQUIRED_NODE[i]) return false;
  }
  return true;
}
function configDir() {
  if (process.env.JOURNAL_CONFIG_DIR) return process.env.JOURNAL_CONFIG_DIR;
  if (platform() === 'win32') return resolve(process.env.APPDATA || resolve(homedir(), 'AppData', 'Roaming'), 'ShiguangJournal');
  if (platform() === 'darwin') return resolve(homedir(), 'Library', 'Application Support', 'ShiguangJournal');
  return resolve(process.env.XDG_CONFIG_HOME || resolve(homedir(), '.config'), 'ShiguangJournal');
}
async function exists(path) { try { await access(path, constants.F_OK); return true; } catch { return false; } }
async function ensureDevDependencies() {
  if (await exists(resolve(root, 'node_modules/vinext/dist/cli.js'))) return;
  console.log('最新源码需要本地开发依赖，正在安装一次…');
  const npm = platform() === 'win32' ? 'npm.cmd' : 'npm';
  await new Promise((ok, fail) => {
    const child = spawn(npm, ['install'], { cwd: root, stdio: 'inherit' });
    child.on('error', fail);
    child.on('exit', code => code === 0 ? ok() : fail(Error(`依赖安装失败（${code ?? 'unknown'}）`)));
  });
}
async function canListen(port) {
  return new Promise(resolveResult => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolveResult(false));
    server.listen(port, '127.0.0.1', () => server.close(() => resolveResult(true)));
  });
}
async function freePort(start = 4340) {
  for (let port = start; port <= 4499; port++) if (await canListen(port)) return port;
  throw Error('没有找到可用端口，请先关闭部分本地服务后重试。');
}
async function pairedPorts() {
  for (let port = 4340; port <= 4498; port += 2) if (await canListen(port) && await canListen(port + 1)) return [port, port + 1];
  throw Error('没有找到可用端口，请先关闭部分本地开发服务后重试。');
}
async function ensurePersistentSettings(dir) {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const persistent = resolve(dir, 'settings.json');
  const legacy = resolve(root, 'data', 'settings.json');
  if (!(await exists(persistent)) && await exists(legacy)) await copyFile(legacy, persistent);
}
async function productionBundleState() {
  const index = resolve(root, 'dist/client/index.html');
  if (!(await exists(index))) return { available: false, version: '' };
  try {
    const version = (await readFile(resolve(root, 'dist/client/.shiguang-version'), 'utf8')).trim();
    return { available: version === APP_VERSION, version };
  } catch {
    return { available: false, version: '' };
  }
}
function openBrowser(url) {
  if (noOpen) return;
  const spec = platform() === 'win32'
    ? ['cmd.exe', ['/c', 'start', '', url]]
    : platform() === 'darwin'
      ? ['open', [url]]
      : ['xdg-open', [url]];
  const child = spawn(spec[0], spec[1], { detached: true, stdio: 'ignore' });
  child.unref();
}
async function waitForHealth(url, child) {
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) throw Error('拾光启动进程已退出，请查看上面的报错。');
    try {
      const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(1000) });
      if (res.ok && (await res.json()).runtimeId === EXPECTED_RUNTIME) return;
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  throw Error('启动超时，请查看上面的提示。');
}

let child;
try {
  if (!APP_VERSION) throw Error('无法读取 package.json 中的应用版本。');
  if (!nodeVersionOK()) throw Error(`Node.js 版本过旧（当前 ${process.versions.node}）。拾光手帐 v${APP_VERSION} 需要 Node.js 22.13.0 或更高版本。`);
  const cfg = configDir();
  await ensurePersistentSettings(cfg);
  let url;
  const production = await productionBundleState();
  if (devMode) {
    await ensureDevDependencies();
    const [apiPort, webPort] = await pairedPorts();
    url = `http://127.0.0.1:${webPort}`;
    child = spawn(process.execPath, ['local/dev.mjs'], {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, JOURNAL_API_PORT: String(apiPort), JOURNAL_WEB_PORT: String(webPort), JOURNAL_CONFIG_DIR: cfg },
    });
  } else if (production.available) {
    const port = await freePort();
    url = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ['local/server-bootstrap.mjs'], {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, JOURNAL_PORT: String(port), JOURNAL_WEB_PORT: String(port), JOURNAL_CONFIG_DIR: cfg },
    });
  } else {
    if (await exists(resolve(root, 'dist/client/index.html'))) {
      console.log(`检测到旧 production 页面（${production.version || '未标记版本'}），当前源码为 v${APP_VERSION}。为避免新旧代码混用，已跳过旧页面。`);
    } else {
      console.log('当前目录未包含与源码匹配的 production 页面，改用最新源码启动。');
    }
    await ensureDevDependencies();
    const [apiPort, webPort] = await pairedPorts();
    url = `http://127.0.0.1:${webPort}`;
    child = spawn(process.execPath, ['local/dev.mjs'], {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, JOURNAL_API_PORT: String(apiPort), JOURNAL_WEB_PORT: String(webPort), JOURNAL_CONFIG_DIR: cfg },
    });
  }
  await waitForHealth(url, child);
  console.log(`拾光手帐 v${APP_VERSION} 已启动：${url}`);
  console.log(`AI 配置保存在：${cfg}`);
  openBrowser(`${url}/?build=${encodeURIComponent(APP_VERSION)}`);
  if (exitAfterHealth) { child.kill('SIGTERM'); process.exit(0); }
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child?.kill('SIGTERM'));
  await new Promise((ok, fail) => { child.on('exit', code => code === 0 || code === null ? ok() : fail(Error(`拾光已退出（${code}）`))); child.on('error', fail); });
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  child?.kill('SIGTERM');
  process.exitCode = 1;
}
