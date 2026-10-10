// Run by Node on Windows after packaging. Instrument only an extracted test copy.
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
const source = resolve(process.argv[2]);
const temp = await mkdtemp(join(tmpdir(), 'shiguang-windows-'));
const install = join(temp, '中文 installation');
await cp(source, install, { recursive: true });
const root = join(install, 'resources/app');
const pkgPath = join(root, 'package.json');
const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
pkg.main = 'desktop/smoke-entry.mjs';
await writeFile(pkgPath, JSON.stringify(pkg));
await writeFile(join(root, pkg.main), `
import { app, BrowserWindow } from 'electron';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import sharp from 'sharp';
const timeout = setTimeout(() => app.exit(2), 90000);
app.on('browser-window-created', (_event, window) => {
  window.webContents.once('did-finish-load', () => { void (async () => {
    await sharp({ create: { width: 4, height: 4, channels: 4, background: '#fff' } }).png().toBuffer();
    let ready = false;
    for (let i = 0; i < 120; i++) {
      ready = await window.webContents.executeJavaScript("document.querySelectorAll('.build-version').length === 1 && document.querySelectorAll('button').length > 0");
      if (ready) break;
      await new Promise(r => setTimeout(r, 250));
    }
    assert.ok(ready, 'React editor did not mount');
    const origin = new URL(window.webContents.getURL()).origin;
    const health = await (await fetch(origin + '/api/health')).json();
    assert.equal(health.appVersion, app.getVersion());
    const state = await (await fetch(origin + '/api/state')).json();
    assert.equal(state.revision, Number(process.env.SMOKE_REVISION));
    const saved = await fetch(origin + '/api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state) });
    assert.equal(saved.status, 200);
    const result = await saved.json();
    assert.equal(result.revision, state.revision + 1);
    const reread = await (await fetch(origin + '/api/state')).json();
    assert.equal(reread.revision, result.revision);
    await writeFile(process.env.SMOKE_RESULT, JSON.stringify({ version: health.appVersion, revision: reread.revision, windows: BrowserWindow.getAllWindows().length }));
    window.close(); // Exercise the real renderer flush and utility-process shutdown.
  })().catch(error => { console.error(error); app.exit(1); }); });
});
app.on('will-quit', () => clearTimeout(timeout));
await import('./main.mjs');
`);
for (let revision = 0; revision < 2; revision++) {
  const resultPath = join(temp, `result-${revision}.json`);
  await new Promise((ok, fail) => {
    const child = spawn(join(install, '拾光手帐.exe'), [], { env: { ...process.env,
      SHIGUANG_DESKTOP_TEST_DIR: join(temp, 'profile'), SMOKE_REVISION: String(revision), SMOKE_RESULT: resultPath }, stdio: 'inherit' });
    const timer = setTimeout(() => { child.kill(); fail(Error('Windows desktop smoke timed out')); }, 120000);
    child.once('error', error => { clearTimeout(timer); fail(error); });
    child.once('exit', code => { clearTimeout(timer); if (code === 0) ok(); else fail(Error(`App exited ${code}`)); });
  });
  const result = JSON.parse(await readFile(resultPath, 'utf8'));
  assert.equal(result.version, pkg.version);
  assert.equal(result.revision, revision + 1);
  const disk = JSON.parse(await readFile(join(temp, 'profile/data/journal.json'), 'utf8'));
  assert.equal(disk.revision, revision + 1);
}
console.log('Windows packaged runtime: page, sharp, save/readback, restart and safe close passed.');
