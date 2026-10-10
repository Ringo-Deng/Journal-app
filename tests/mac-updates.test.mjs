import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createMacUpdates, macUpdateFromManifest } from '../desktop/mac-updates.mjs';

test('Mac manifest compares numeric versions and only links the matching Mac release', () => {
  const result = macUpdateFromManifest({ version: '0.1.280', arch: 'arm64', url: 'file:///private' }, '0.1.99', 'arm64');
  assert.deepEqual(result, { status: 'available', version: '0.1.280',
    url: 'https://github.com/Ringo-Deng/Journal-app/releases/download/v0.1.280/shiguang-journal-v0.1.280-mac-arm64.zip' });
  for (const version of ['0.1.99', '0.1.98', '0.0.999'])
    assert.deepEqual(macUpdateFromManifest({ version, arch: 'arm64' }, '0.1.99', 'arm64'), { status: 'current' });
  assert.equal(macUpdateFromManifest({ version: '1.0.0', arch: 'arm64' }, '0.99.999', 'arm64').status, 'available');
  for (const manifest of [null, {}, { version: '0.2.0', arch: 'x64' },
    ...['../../bad', '0.2.0-beta', '01.2.0', '9007199254740992.0.0'].map(version => ({ version, arch: 'arm64' }))])
    assert.throws(() => macUpdateFromManifest(manifest, '0.1.99', 'arm64'));
});

test('Mac checks are deduplicated, bounded, retryable and do not install anything', async () => {
  let calls = 0, failed = true;
  const states = [];
  const control = createMacUpdates('0.1.278', 'arm64', state => states.push(state), async (url, options) => {
    calls++;
    assert.equal(url, 'https://ringo-deng.github.io/Journal-app/mac-update.json');
    assert.equal(options.cache, 'no-store'); assert.ok(options.signal instanceof AbortSignal);
    if (failed) throw Error('offline');
    return { ok: true, json: async () => ({ version: '0.1.279', arch: 'arm64' }) };
  });
  await Promise.all([control.check(), control.check()]);
  assert.equal(calls, 1); assert.equal(control.state.status, 'error');
  failed = false;
  assert.equal((await control.check()).status, 'available');
  assert.equal(calls, 2); assert.equal(control.install, undefined);
  assert.deepEqual(states.map(s => s.status), ['checking', 'error', 'checking', 'available']);
});

test('missing or invalid feed is an error, never a false latest-version result', async () => {
  for (const response of [{ ok: false }, { ok: true, json: async () => { throw Error('invalid JSON'); } },
    { ok: true, json: async () => ({ version: '0.1.279', arch: 'win32' }) }]) {
    const control = createMacUpdates('0.1.278', 'arm64', () => {}, async () => response);
    assert.equal((await control.check()).status, 'error');
  }
});

const source = readFileSync(new URL('../desktop/main.mjs', import.meta.url), 'utf8');
const offer = source.slice(source.indexOf('async function offerUpdate()'), source.indexOf('async function checkUpdates()'));
for (const response of [0, 1]) test(`Mac update prompt ${response === 0 ? 'opens download' : 'defers'} without quitting`, async () => {
  const opened = [], prompts = [];
  const context = { updatePromptOpen: false, closing: false, exiting: false,
    window: { isDestroyed: () => false }, updates: { state: { status: 'available', version: '0.1.279', url: 'https://example.test/download' } },
    dialog: { showMessageBox: async (_window, options) => { prompts.push(options); return { response }; } },
    shell: { openExternal: async url => opened.push(url) }, closeSafely: () => assert.fail('Mac must not quit or install'),
  };
  await vm.runInNewContext(offer + '\nPromise.all([offerUpdate(), offerUpdate()])', context);
  assert.equal(prompts.length, 1);
  assert.equal(prompts[0].buttons[0], '下载新版');
  assert.equal(prompts[0].cancelId, 1);
  assert.equal(opened.length, response === 0 ? 1 : 0);
  assert.equal(context.updatePromptOpen, false);
});
