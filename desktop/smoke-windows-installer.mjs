// Install into an isolated per-user directory, then exercise the real installed runtime.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import yaml from 'js-yaml';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
const run = promisify(execFile);
const root = resolve('build/desktop/installer');
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const info = yaml.load(await readFile(join(root, 'latest.yml'), 'utf8'));
assert.equal(info.version, pkg.version);
const entry = info.files.find(file => file.url.endsWith('.exe'));
assert.ok(entry && !entry.url.includes('/') && !entry.url.includes('\\'));
const setup = join(root, entry.url);
assert.equal(createHash('sha512').update(await readFile(setup)).digest('base64'), entry.sha512);
assert.ok((await stat(setup + '.blockmap')).size > 0);
// Exercise the actual updater against an isolated newer-version feed. Never publish this fixture.
const nextVersion = pkg.version.replace(/\d+$/, patch => String(Number(patch) + 1));
const feed = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (path === '/latest.yml') { res.end(yaml.dump({ ...info, version: nextVersion })); return; }
  const file = path === '/' + entry.url ? setup : path === '/' + entry.url + '.blockmap' ? setup + '.blockmap' : null;
  if (!file) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Length': (await stat(file)).size });
  createReadStream(file).pipe(res);
});
await new Promise(ok => feed.listen(0, '127.0.0.1', ok));
const feedURL = `http://127.0.0.1:${feed.address().port}`;
const target = join(await mkdtemp(join(tmpdir(), 'journal-install-')), '拾光手帐');
try {
  await run(setup, ['/S', `/D=${target}`], { timeout: 120000 });
  assert.equal(JSON.parse(await readFile(join(target, 'resources/app/package.json'), 'utf8')).version, pkg.version);
  const config = yaml.load(await readFile(join(target, 'resources/app-update.yml'), 'utf8'));
  assert.equal(config.provider, 'github');
  assert.equal(config.owner, 'Ringo-Deng');
  assert.equal(config.repo, 'Journal-app');
  // Resolve the updater from the actual packaged dependencies (not the build tree).
  await run(process.execPath, ['-e', 'require.resolve("electron-updater")'], { cwd: join(target, 'resources/app') });
  await run(process.execPath, ['desktop/smoke-windows.mjs', target], { timeout: 360000, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, SHIGUANG_SMOKE_UPDATE_URL: feedURL } }).then(result => console.log(result.stdout));
  console.log('NSIS installed runtime and update metadata verified.');
} finally {
  feed.close();
  // CI-only installation; no real user profile is used by smoke-windows.
  await run(join(target, 'Uninstall 拾光手帐.exe'), ['/S'], { timeout: 120000 }).catch(() => {});
}
