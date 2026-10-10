// Run by Node on Windows after packaging. Instrument only an extracted test copy.
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { probePageTurnAudio } from './audio-probe.mjs';
const source = resolve(process.argv[2]);
const temp = await mkdtemp(join(tmpdir(), 'shiguang-windows-'));
const install = join(temp, '中文 installation');
await cp(source, install, { recursive: true });
const root = join(install, 'resources/app');
const pkgPath = join(root, 'package.json');
const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
pkg.main = 'desktop/smoke-entry.mjs';
await writeFile(pkgPath, JSON.stringify(pkg));
// Trace the packaged lifecycle in the isolated copy without changing delivery code.
const mainPath = join(root, 'desktop/main.mjs');
let main = await readFile(mainPath, 'utf8');
main = "import { appendFileSync } from 'node:fs';\nconst trace = message => appendFileSync(process.env.SMOKE_TRACE, JSON.stringify({ time: Date.now(), pid: process.pid, message }) + '\\n');\n" + main;
for (const [needle, event] of [
  ['async function start() {', 'start'],
  ['async function closeSafely() {', 'close:begin'],
  ["const result = await backendRequest('desktop-shutdown');", 'close:backend-replied'],
  ['exiting = true;', 'close:exiting'],
  ['window.destroy();', 'close:destroyed'],
  ["backend.on('exit', () => {", 'backend:exit'],
]) main = main.replace(needle, needle + " trace({ event: '" + event + "', closing, exiting, window: !!window, destroyed: window?.isDestroyed() });");
await writeFile(mainPath, main);
await writeFile(join(root, pkg.main), `
import { app, BrowserWindow, dialog } from 'electron';
import { writeFile } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import sharp from 'sharp';
let phase = 'entry', failed = false;
function diagnostic(error) { if (failed) return; failed = true; writeFileSync(process.env.SMOKE_RESULT, JSON.stringify({ phase, error: String(error), windows: BrowserWindow.getAllWindows().map(w => ({ url: w.webContents.getURL(), loading: w.webContents.isLoading() })) })); }
dialog.showErrorBox = (title, message) => { diagnostic(title + ': ' + message); app.exit(3); };
dialog.showMessageBox = async (...args) => { const options = args.at(-1); diagnostic(options.message + ': ' + options.detail); app.exit(4); return { response: 0 }; };
const timeout = setTimeout(() => { diagnostic('smoke timeout'); app.exit(2); }, 90000);
app.on('browser-window-created', (_event, window) => {
  phase = 'window-created';
  window.webContents.once('did-finish-load', () => { void (async () => {
    phase = 'page-loaded';
    await sharp({ create: { width: 4, height: 4, channels: 4, background: '#fff' } }).png().toBuffer();
    let ready = false;
    for (let i = 0; i < 120; i++) {
      ready = window.isVisible() && await window.webContents.executeJavaScript("document.querySelectorAll('.build-version').length === 1 && document.querySelector('button[aria-label=备份与恢复]')?.disabled === false");
      if (ready) break;
      await new Promise(r => setTimeout(r, 250));
    }
    assert.ok(ready, 'React editor did not mount');
    phase = 'editor-mounted';
    phase = 'audio';
    const audio = await window.webContents.executeJavaScript(${JSON.stringify('(' + probePageTurnAudio.toString() + ')()')}, true);
    console.log('Packaged audio:', JSON.stringify(audio));
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
    await writeFile(process.env.SMOKE_RESULT, JSON.stringify({ version: health.appVersion, revision: reread.revision, audio, windows: BrowserWindow.getAllWindows().length }));
    phase = 'closing';
    window.close(); // Exercise the real renderer flush and utility-process shutdown.
  })().catch(error => { diagnostic(error.stack || error); app.exit(1); }); });
});
app.on('will-quit', () => clearTimeout(timeout));
await import('./main.mjs');
`);
for (let revision = 0; revision < 2; revision++) {
  const resultPath = join(temp, `result-${revision}.json`);
  await new Promise((ok, fail) => {
    const child = spawn(join(install, '拾光手帐.exe'), [], { env: { ...process.env,
      SHIGUANG_DESKTOP_TEST_DIR: join(temp, 'profile'), SMOKE_REVISION: String(revision), SMOKE_RESULT: resultPath, SMOKE_TRACE: join(temp, 'trace.jsonl') }, stdio: 'inherit' });
    const timer = setTimeout(() => { child.kill(); fail(Error('Windows desktop smoke timed out')); }, 120000);
    child.once('error', error => { clearTimeout(timer); fail(error); });
    child.once('exit', async code => {
      clearTimeout(timer);
      if (code === 0) { ok(); return; }
      const diagnostic = await readFile(resultPath, 'utf8').catch(() => 'no diagnostic file');
      const trace = await readFile(join(temp, 'trace.jsonl'), 'utf8').catch(() => 'no trace');
      fail(Error(`App exited ${code}: ${diagnostic}\n${trace}`));
    });
  });
  const result = JSON.parse(await readFile(resultPath, 'utf8'));
  assert.equal(result.version, pkg.version);
  assert.equal(result.revision, revision + 1);
  assert.equal(result.audio.length, 3);
  const disk = JSON.parse(await readFile(join(temp, 'profile/data/journal.json'), 'utf8'));
  assert.equal(disk.revision, revision + 1);
}
console.log('Windows packaged runtime: page, sharp, save/readback, restart and safe close passed.');
