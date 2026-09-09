import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function freeTestPort() {
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  return port;
}

export async function startTestServer(test) {
  const dir = await mkdtemp(join(tmpdir(), 'shiguang-http-test-'));
  const port = await freeTestPort();
  const webPort = await freeTestPort();
  const env = { ...process.env, JOURNAL_DATA_DIR: dir, JOURNAL_CONFIG_DIR: dir,
    JOURNAL_PORT: String(port), JOURNAL_WEB_PORT: String(webPort) };
  delete env.DEEPSEEK_API_KEY;
  delete env.SHIGUANG_DEEPSEEK_API_KEY;
  const child = spawn(process.execPath, ['local/server.mjs'], {
    cwd: new URL('..', import.meta.url), env, stdio: ['ignore', 'pipe', 'pipe'],
  });
  // Register cleanup before waiting for startup, including startup failures.
  test.after(async () => {
    if (child.pid && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }
    await rm(dir, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    let output = '';
    let errors = '';
    const timer = setTimeout(() => finish(Error('Isolated test server startup timed out.')), 10_000);
    const finish = error => {
      clearTimeout(timer);
      child.stdout.off('data', onData);
      child.off('error', onError);
      child.off('exit', onExit);
      if (error) reject(error);
      else resolve();
    };
    const onData = chunk => {
      output += chunk;
      if (output.includes(`http://127.0.0.1:${port}`)) finish();
    };
    const onError = error => finish(error);
    const onExit = code => finish(Error(`Isolated test server exited ${code}: ${errors}`));
    child.stdout.on('data', onData);
    child.stderr.on('data', chunk => { errors = (errors + chunk).slice(-4000); });
    child.once('error', onError);
    child.once('exit', onExit);
  });
  return { dir, port, webPort, base: `http://127.0.0.1:${port}` };
}
