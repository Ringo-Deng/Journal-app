import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  installRuntimeHealth,
  runtimeHealthPayload,
  runtimeMatches,
} from '../local/runtime-health.mjs';

test('runtime health includes the exact app version and rejects stale versions', () => {
  const payload = runtimeHealthPayload('0.1.46', 1234);
  assert.deepEqual(payload, {
    ok: true,
    runtimeId: 'page-elements-v0.1.20',
    appVersion: '0.1.46',
    pid: 1234,
  });
  assert.equal(runtimeMatches(payload, '0.1.46'), true);
  assert.equal(runtimeMatches(payload, '0.1.45'), false);
  assert.equal(runtimeMatches({ ok: true, runtimeId: 'page-elements-v0.1.20' }, '0.1.46'), false);
});

test('health interceptor handles /api/health but preserves all other routes', async () => {
  const fakeHttp = Object.create(http);
  fakeHttp.createServer = http.createServer.bind(http);
  installRuntimeHealth({ version: '0.1.46', httpModule: fakeHttp });
  const server = fakeHttp.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('normal:' + req.url);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  try {
    const health = await fetch(`http://127.0.0.1:${port}/api/health`).then(r => r.json());
    assert.equal(health.appVersion, '0.1.46');
    assert.equal(runtimeMatches(health, '0.1.46'), true);
    assert.equal(await fetch(`http://127.0.0.1:${port}/api/state`).then(r => r.text()), 'normal:/api/state');
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('health interceptor supports createServer(options, listener)', async () => {
  const fakeHttp = Object.create(http);
  fakeHttp.createServer = http.createServer.bind(http);
  installRuntimeHealth({ version: '0.1.46', httpModule: fakeHttp });
  const server = fakeHttp.createServer({ keepAlive: true }, (_req, res) => res.end('fallback'));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  try {
    const health = await fetch(`http://127.0.0.1:${port}/api/health`).then(r => r.json());
    assert.equal(health.appVersion, '0.1.46');
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('launcher validates the full health version and preserves requested-path startup', async () => {
  const root = resolve(new URL('..', import.meta.url).pathname);
  const source = await readFile(resolve(root, 'local/launch.mjs'), 'utf8');
  assert.match(source, /runtimeMatches\(health, APP_VERSION\)/);
  assert.doesNotMatch(source, /\.runtimeId === EXPECTED_RUNTIME/);
  assert.match(source, /SHIGUANG_OPEN_PATH/);
  assert.match(source, /openBrowser\(openUrl\)/);
});

test('the page blocks new editing when its build is newer than the running local API', async () => {
  const root = resolve(new URL('..', import.meta.url).pathname);
  const [layout, compatibility, styles] = await Promise.all([
    readFile(resolve(root, 'app/layout.tsx'), 'utf8'),
    readFile(resolve(root, 'components/runtime-compatibility.tsx'), 'utf8'),
    readFile(resolve(root, 'components/runtime-compatibility.css'), 'utf8'),
  ]);
  assert.match(layout, /<RuntimeCompatibility appVersion={packageJson\.version} \/>/);
  assert.match(compatibility, /fetch\(['"]\/api\/health['"], { cache: ['"]no-store['"] }\)/);
  assert.match(compatibility, /health\.appVersion === appVersion/);
  assert.match(compatibility, /window\.setInterval\(\(\) => void checkRuntime\(\), 3000\)/);
  assert.match(compatibility, /新旧版本混用可能导致保存失败/);
  assert.match(compatibility, /如果正在编辑，不要刷新/);
  assert.match(styles, /\.runtime-mismatch/);
  assert.match(styles, /z-index: 10000/);
});
