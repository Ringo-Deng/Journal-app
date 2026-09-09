import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read = p => readFile(new URL('../'+p, import.meta.url), 'utf8');

test('repository launcher uses the shared runtime and package version for production freshness', async()=>{
  const [mac,launch,server,pkg]=await Promise.all([
    read('启动拾光手帐.command'),
    read('local/launch.mjs'),
    read('local/server.mjs'),
    read('package.json')
  ]);
  const version=JSON.parse(pkg).version;
  assert.match(mac,/exec node local\/launch\.mjs/);
  assert.doesNotMatch(mac,/xattr\s+-d|spctl\s+--disable/);
  assert.match(launch,/package\.json/);
  assert.match(launch,/const APP_VERSION = String\(packageJson\.version/);
  assert.doesNotMatch(launch,/APP_VERSION\s*=\s*['"]0\.1\./);
  assert.match(launch,/dist\/client\/\.shiguang-version/);
  assert.match(launch,/version === APP_VERSION/);
  assert.match(launch,/已跳过旧页面/);
  assert.match(launch,/ensureDevDependencies\(\)/);
  assert.match(launch,/platform\(\) === 'win32'/);
  assert.match(launch,/APPDATA/);
  assert.match(launch,/REQUIRED_NODE = \[22, 21, 0\]/);
  assert.match(server,/process\.arch !== 'arm64'/);
  assert.match(pkg,/vinext build && node local\/stamp-dist\.mjs/);
  assert.match(version,/^\d+\.\d+\.\d+$/);
});
