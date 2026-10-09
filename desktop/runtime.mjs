import net from 'node:net';
import { resolve } from 'node:path';

export function desktopPaths(userData) {
  return { data: resolve(userData, 'data'), config: resolve(userData, 'config') };
}

export async function availablePort(preferred = 14329) {
  return new Promise((ok, fail) => {
    const server = net.createServer();
    server.once('error', fail);
    server.listen(preferred, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(error => error ? fail(error) : ok(port));
    });
  });
}

export function backendEnvironment(userData, port, env = process.env) {
  const paths = desktopPaths(userData);
  // Never inherit a developer's data directory or AI key into the installed app.
  const clean = Object.fromEntries(Object.entries(env).filter(([key]) =>
    !/^(JOURNAL_|SHIGUANG_|DEEPSEEK_API_KEY$|NODE_OPTIONS$|ELECTRON_RUN_AS_NODE$)/.test(key)));
  return { ...clean, JOURNAL_DATA_DIR: paths.data, JOURNAL_CONFIG_DIR: paths.config,
    JOURNAL_PORT: String(port), JOURNAL_WEB_PORT: String(port), JOURNAL_DESKTOP: '1' };
}

export function isInternalURL(value, origin) {
  try { return new URL(value).origin === origin; } catch { return false; }
}
