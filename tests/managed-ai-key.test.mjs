import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MANAGED_KEY_FILENAME,
  readManagedDeepSeekKey,
  syncManagedDeepSeekKey,
} from '../local/managed-ai-key.mjs';

async function withTempDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'shiguang-managed-ai-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('persistent secret file is copied into settings without changing model choices', async () => {
  await withTempDir(async (dir) => {
    await writeFile(join(dir, MANAGED_KEY_FILENAME), '  sk-local-secret\n', { mode: 0o600 });
    await writeFile(
      join(dir, 'settings.json'),
      JSON.stringify({
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-v4-pro',
        vision: false,
        apiKey: 'old-key',
      }),
    );

    const result = await syncManagedDeepSeekKey({ configDir: dir, env: {} });
    assert.equal(result.managed, true);
    assert.equal(result.changed, true);
    assert.equal(result.source, MANAGED_KEY_FILENAME);

    const settings = JSON.parse(await readFile(join(dir, 'settings.json'), 'utf8'));
    assert.equal(settings.apiKey, 'sk-local-secret');
    assert.equal(settings.model, 'deepseek-v4-pro');
    assert.equal(settings.vision, false);
  });
});

test('environment key takes precedence over persistent secret file', async () => {
  await withTempDir(async (dir) => {
    await writeFile(join(dir, MANAGED_KEY_FILENAME), 'sk-file-key');
    const managed = await readManagedDeepSeekKey({
      configDir: dir,
      env: { DEEPSEEK_API_KEY: 'Bearer sk-env-key' },
    });
    assert.deepEqual(managed, { key: 'sk-env-key', source: 'environment' });
  });
});

test('no managed key leaves settings untouched', async () => {
  await withTempDir(async (dir) => {
    const current = { model: 'deepseek-v4-flash', apiKey: 'manual-key', vision: false };
    await writeFile(join(dir, 'settings.json'), JSON.stringify(current));
    const result = await syncManagedDeepSeekKey({ configDir: dir, env: {} });
    assert.equal(result.managed, false);
    const after = JSON.parse(await readFile(join(dir, 'settings.json'), 'utf8'));
    assert.deepEqual(after, current);
  });
});
