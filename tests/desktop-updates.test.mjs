import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createDesktopUpdates } from '../desktop/updates.mjs';

class Updater extends EventEmitter {
  checks = 0; downloads = 0; installs = [];
  async checkForUpdates() { this.checks++; return { isUpdateAvailable: true }; }
  async downloadUpdate() { this.downloads++; this.emit('download-progress', { percent: 51.8 }); this.emit('update-downloaded', { version: '0.1.278' }); }
  quitAndInstall(...args) { this.installs.push(args); }
}
test('one background download serves repeated checks and never installs on its own', async () => {
  const updater = new Updater(), states = [];
  const control = createDesktopUpdates(updater, s => states.push(s));
  assert.equal(updater.autoInstallOnAppQuit, false);
  assert.equal(updater.autoDownload, false);
  assert.equal(updater.allowDowngrade, false);
  assert.equal(updater.allowPrerelease, false);
  assert.equal(control.install(), false);
  await Promise.all([control.check(), control.check()]);
  assert.equal(updater.checks, 1); assert.equal(updater.downloads, 1);
  assert.ok(states.some(s => s.percent === 51));
  assert.deepEqual(control.state, { status: 'ready', version: '0.1.278' });
  assert.deepEqual(updater.installs, []);
  await control.check(); assert.equal(updater.checks, 1);
  assert.equal(control.install(true), true); assert.deepEqual(updater.installs, [[true, true]]);
});
test('offline, synchronous check and corrupt download failures remain retryable', async () => {
  for (const stage of ['check', 'download']) {
    const updater = new Updater();
    const method = stage === 'check' ? 'checkForUpdates' : 'downloadUpdate';
    const original = updater[method];
    updater[method] = () => { throw Error('network or checksum failure'); };
    const control = createDesktopUpdates(updater);
    assert.equal((await control.check()).status, 'error');
    assert.equal(control.install(), false);
    updater[method] = original;
    assert.equal((await control.check()).status, 'ready');
  }
});
test('no newer release avoids any download or install', async () => {
  const updater = new Updater(); updater.checkForUpdates = async () => ({ isUpdateAvailable: false });
  const control = createDesktopUpdates(updater);
  assert.equal((await control.check()).status, 'current');
  assert.equal(updater.downloads, 0); assert.equal(control.install(), false);
});
const source = readFileSync(new URL('../desktop/main.mjs', import.meta.url), 'utf8');
const close = source.slice(source.indexOf('async function closeSafely('), source.indexOf("ipcMain.on('journal:close-result'"));
for (const failure of [null, 'renderer', 'backend']) test(`update shutdown uses the real save gate: ${failure || 'success'}`, async () => {
  const events = [], replies = new Map();
  const context = {
    closing: false, exiting: false, randomUUID: () => 'close-id', closeReplies: replies,
    setTimeout: () => 1, clearTimeout: () => {},
    window: { webContents: {
      executeJavaScript: async () => {},
      send: () => { events.push('flush'); replies.get('close-id')(failure !== 'renderer'); },
    }, destroy: () => events.push('destroy'), isDestroyed: () => false },
    backendRequest: async () => { events.push('shutdown'); return { ok: failure !== 'backend' }; },
    updates: { install: restart => events.push(restart ? 'install-restart' : 'install-exit') },
    app: { quit: () => events.push('quit') }, dialog: { showMessageBox: async () => events.push('blocked') },
  };
  await vm.runInNewContext(close + '\ncloseSafely(true)', context);
  assert.deepEqual(events, failure === 'renderer' ? ['flush', 'blocked'] : failure === 'backend'
    ? ['flush', 'shutdown', 'blocked'] : ['flush', 'shutdown', 'install-restart', 'destroy', 'quit']);
});
