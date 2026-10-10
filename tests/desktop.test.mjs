import test from 'node:test';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { backendEnvironment, desktopPaths, isInternalURL } from '../desktop/runtime.mjs';
import { distributableSource, distributableWindowsSource } from '../desktop/package-policy.mjs';
import { prepareDesktopClose } from '../lib/desktop-close.ts';

test('desktop keeps data outside the installed bundle and strips inherited private settings', () => {
  const env = backendEnvironment('/tmp/test-profile', 1234, { PATH: '/usr/bin', JOURNAL_DATA_DIR: '/private/live',
    JOURNAL_CONFIG_DIR: '/private/config', DEEPSEEK_API_KEY: 'private', SHIGUANG_DEEPSEEK_API_KEY: 'private', NODE_OPTIONS: '--inspect' });
  assert.equal(env.JOURNAL_DATA_DIR, resolve('/tmp/test-profile', 'data'));
  assert.equal(env.JOURNAL_CONFIG_DIR, resolve('/tmp/test-profile', 'config'));
  assert.equal(env.DEEPSEEK_API_KEY, undefined);
  assert.equal(env.SHIGUANG_DEEPSEEK_API_KEY, undefined);
  assert.equal(env.NODE_OPTIONS, undefined);
  assert.deepEqual(desktopPaths('/tmp/test-profile'), { data: resolve('/tmp/test-profile', 'data'), config: resolve('/tmp/test-profile', 'config') });
});
test('packaging excludes data, secrets, repo metadata and development files', () => {
  for (const path of ['data/journal.json', 'data/uploads/photo.png', '.env', '.git/config', 'local/.env', 'desktop/private.json', 'README.md'])
    assert.equal(distributableSource(path), false, path);
  for (const path of ['local/segment', 'local/server.mjs', 'lib/photo-mask.mjs', 'public/favicon.svg', 'desktop/main.mjs'])
    assert.equal(distributableSource(path), true, path);
});
test('window navigation cannot escape the local app origin', () => {
  assert.equal(isInternalURL('http://127.0.0.1:1234/?build=1', 'http://127.0.0.1:1234'), true);
  for (const url of ['file:///tmp/private', 'https://example.org', 'http://127.0.0.1:1235', 'javascript:alert(1)'])
    assert.equal(isInternalURL(url, 'http://127.0.0.1:1234'), false);
});
test('closing drains the same pending save after an existing write', async () => {
  let writing = true, pending = true, flushed = 0;
  setTimeout(() => { writing = false; }, 10);
  await prepareDesktopClose({ flush: async () => { flushed++; pending = false; }, isWriting: () => writing,
    hasPending: () => pending, isBlocked: () => false });
  assert.equal(flushed, 1); assert.equal(pending, false);
});
test('closing fails safely for conflict, failed write and a stalled write', async () => {
  for (const kind of ['conflict', 'failure', 'stalled']) {
    let pending = true;
    await assert.rejects(prepareDesktopClose({ flush: async () => { if (kind !== 'failure') pending = false; },
      isWriting: () => kind === 'stalled', hasPending: () => pending, isBlocked: () => kind === 'conflict', timeout: 1 }));
  }
});

test('Windows packages keep the portable engine and exclude Mac executables', () => {
  for (const path of ['local/segment', 'local/cutout', 'local/clean-paper', 'local/material-palette'])
    assert.equal(distributableWindowsSource(path), false, path);
  for (const path of ['local/portable-image-tools.mjs', 'local/portable-sips.mjs', 'desktop/main.mjs', 'desktop/audio-probe.mjs'])
    assert.equal(distributableWindowsSource(path), true, path);
});
