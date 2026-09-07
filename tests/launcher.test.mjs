import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read = p => readFile(new URL('../'+p, import.meta.url), 'utf8');

test('v0.1.19 universal launchers share one cross-platform app launcher', async()=>{
  const [mac,win,launch,server,pkg]=await Promise.all([
    read('packaging/START-MAC.command'),
    read('packaging/START-WINDOWS.cmd'),
    read('local/launch.mjs'),
    read('local/server.mjs'),
    read('package.json')
  ]);
  assert.match(mac,/uname -m/);
  assert.match(mac,/runtime\/mac-arm64/);
  assert.match(mac,/runtime\/mac-x64/);
  assert.match(mac,/shasum -a 256/);
  assert.match(mac,/nodejs\.org\/download\/release/);
  assert.match(mac,/mirrors\.nju\.edu\.cn/);
  assert.match(mac,/app\/local\/launch\.mjs/);
  assert.match(mac,/右键 START-MAC\.command/);
  assert.doesNotMatch(mac,/xattr\s+-d|spctl\s+--disable/);
  assert.match(win,/runtime\\windows-x64\\node\.exe/);
  assert.match(win,/app\\local\\launch\.mjs/);
  assert.match(launch,/APP_VERSION = '0\.1\.18'/);
  assert.match(launch,/EXPECTED_RUNTIME = 'page-elements-v0\.1\.18'/);
  assert.match(launch,/platform\(\) === 'win32'/);
  assert.match(launch,/APPDATA/);
  assert.match(launch,/REQUIRED_NODE = \[22, 13, 0\]/);
  assert.match(launch,/dist\/client\/index\.html/);
  assert.match(server,/page-elements-v0\.1\.18/);
  assert.match(server,/process\.arch !== 'arm64'/);
  assert.equal(JSON.parse(pkg).version,'0.1.19');
});
