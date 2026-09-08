import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('AI runtime enables system trust and authorized environment proxy support', async () => {
  const [launch, pkg, mac] = await Promise.all([
    read('local/launch.mjs'),
    read('package.json'),
    read('启动拾光手帐.command'),
  ]);
  assert.match(launch, /REQUIRED_NODE = \[22, 21, 0\]/);
  assert.match(launch, /NODE_USE_SYSTEM_CA: process\.env\.NODE_USE_SYSTEM_CA \|\| '1'/);
  assert.match(launch, /NODE_USE_ENV_PROXY: process\.env\.NODE_USE_ENV_PROXY \|\| '1'/);
  assert.match(launch, /for \(const host of \['127\.0\.0\.1', 'localhost', '::1'\]\)/);
  assert.match(launch, /env: \{ \.\.\.networkEnv, JOURNAL_PORT:/);
  assert.match(launch, /env: \{ \.\.\.networkEnv, JOURNAL_API_PORT:/);
  assert.equal(JSON.parse(pkg).engines.node, '>=22.21.0');
  assert.equal(JSON.parse(pkg).version, '0.1.48');
  assert.match(mac, /Node\.js 22\.21\.0 或更高版本/);
});
