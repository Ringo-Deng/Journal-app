import http from 'node:http';

const PATCH_FLAG = Symbol.for('shiguang.runtime-health.v1');
const LEGACY_RUNTIME_ID = 'page-elements-v0.1.20';

export function runtimeHealthPayload(version, pid = process.pid) {
  const appVersion = String(version || '').trim();
  return {
    ok: true,
    runtimeId: LEGACY_RUNTIME_ID,
    appVersion,
    pid,
  };
}

export function runtimeMatches(info, expectedVersion) {
  const version = String(expectedVersion || '').trim();
  return Boolean(
    version &&
      info?.ok === true &&
      info?.runtimeId === LEGACY_RUNTIME_ID &&
      info?.appVersion === version,
  );
}

export function installRuntimeHealth({ version, httpModule = http } = {}) {
  const appVersion = String(version || '').trim();
  if (!appVersion) throw Error('无法安装运行时健康检查：缺少应用版本。');
  if (httpModule[PATCH_FLAG]) return false;

  const originalCreateServer = httpModule.createServer.bind(httpModule);
  httpModule.createServer = function createVersionedServer(...args) {
    const listenerIndex =
      typeof args[0] === 'function' ? 0 : typeof args[1] === 'function' ? 1 : -1;
    if (listenerIndex < 0) return originalCreateServer(...args);

    const listener = args[listenerIndex];
    args[listenerIndex] = function versionedListener(req, res) {
      let pathname = '';
      try {
        pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname;
      } catch {}
      if ((req.method || 'GET') === 'GET' && pathname === '/api/health') {
        const body = JSON.stringify(runtimeHealthPayload(appVersion));
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'Content-Length': Buffer.byteLength(body),
        });
        res.end(body);
        return;
      }
      return listener.call(this, req, res);
    };
    return originalCreateServer(...args);
  };
  httpModule[PATCH_FLAG] = { version: appVersion, originalCreateServer };
  return true;
}
