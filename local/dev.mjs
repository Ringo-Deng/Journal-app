import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cwd = fileURLToPath(new URL('../', import.meta.url));
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  process.exitCode = code;
}
const apiPort = String(process.env.JOURNAL_API_PORT || '4329');
const api = spawn(process.execPath, ['local/server-bootstrap.mjs'], { cwd, stdio: ['inherit', 'pipe', 'inherit'], env: { ...process.env, JOURNAL_PORT: apiPort } });
children.push(api);
let started = false;
api.stdout.on('data', chunk => {
  process.stdout.write(chunk);
  if (started || !chunk.toString().includes(apiPort)) return;
  started = true;
  const web = spawn(process.execPath, ['node_modules/vinext/dist/cli.js', 'dev'], { cwd, stdio: 'inherit' });
  children.push(web);
  web.on('exit', code => stop(code ?? 1));
});
api.on('exit', code => stop(code ?? 1));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop());
