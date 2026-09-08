import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PATCH_FLAG = Symbol.for('shiguang.deepseek.curl-primary.v4');
const DEEPSEEK_PATHS = new Set(['/models', '/chat/completions']);

export function isDeepSeekRequest(input) {
  try {
    const rawUrl =
      typeof input === 'string' || input instanceof URL
        ? String(input)
        : String(input?.url || '');
    const url = new URL(rawUrl);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    return url.hostname === 'api.deepseek.com' && DEEPSEEK_PATHS.has(path);
  } catch {
    return false;
  }
}

export function isDeepSeekChatRequest(input, init) {
  if (!isDeepSeekRequest(input)) return false;
  try {
    const rawUrl =
      typeof input === 'string' || input instanceof URL
        ? String(input)
        : String(input?.url || '');
    const path = new URL(rawUrl).pathname.replace(/\/+$/, '');
    return path === '/chat/completions' && typeof init?.body === 'string';
  } catch {
    return false;
  }
}

function safeRequestHeaders(init) {
  const lines = [];
  for (const [name, value] of new Headers(init?.headers || {})) {
    const lower = name.toLowerCase();
    if (['host', 'content-length', 'connection', 'proxy-authorization'].includes(lower))
      continue;
    lines.push(`${name}: ${value}`);
  }
  return lines.join('\n') + '\n';
}

function parseHeaders(raw) {
  const blocks = String(raw || '')
    .split(/\r?\n\r?\n/)
    .map((block) => block.trim())
    .filter((block) => /^HTTP\//i.test(block));
  const block = blocks.at(-1) || '';
  const headers = new Headers();
  for (const line of block.split(/\r?\n/).slice(1)) {
    const at = line.indexOf(':');
    if (at <= 0) continue;
    headers.append(line.slice(0, at).trim(), line.slice(at + 1).trim());
  }
  return headers;
}

function curlEnvironment(direct) {
  const env = { ...process.env };
  if (!direct) return env;
  for (const name of [
    'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY',
    'http_proxy', 'https_proxy', 'all_proxy',
    'PROXY', 'proxy',
  ])
    delete env[name];
  env.NO_PROXY = '*';
  env.no_proxy = '*';
  return env;
}

export async function systemCurlFetch(input, init = {}, options = {}) {
  const direct = options?.direct === true;
  const rawUrl =
    typeof input === 'string' || input instanceof URL
      ? String(input)
      : String(input?.url || '');
  const dir = await mkdtemp(join(tmpdir(), 'shiguang-deepseek-'));
  const bodyPath = join(dir, 'request.json');
  const headerPath = join(dir, 'request.headers');
  const responsePath = join(dir, 'response.body');
  const responseHeadersPath = join(dir, 'response.headers');
  const hasBody = typeof init.body === 'string' && init.body.length > 0;

  try {
    const writes = [
      writeFile(headerPath, safeRequestHeaders(init), { mode: 0o600 }),
    ];
    if (hasBody)
      writes.push(writeFile(bodyPath, init.body, { mode: 0o600 }));
    await Promise.all(writes);

    const args = [
      '--silent',
      '--show-error',
      '--connect-timeout',
      '8',
      '--max-time',
      '25',
    ];
    if (direct) args.push('--noproxy', '*');
    args.push(
      '--request',
      String(init.method || (hasBody ? 'POST' : 'GET')),
      '--url',
      rawUrl,
      '--header',
      `@${headerPath}`,
    );
    if (hasBody) args.push('--data-binary', `@${bodyPath}`);
    args.push(
      '--dump-header',
      responseHeadersPath,
      '--output',
      responsePath,
      '--write-out',
      '%{http_code}',
    );

    const result = await new Promise((resolveRun, rejectRun) => {
      const child = spawn(process.env.SHIGUANG_CURL_BIN || 'curl', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: curlEnvironment(direct),
      });
      const out = [];
      const err = [];
      child.stdout.on('data', (chunk) => out.push(chunk));
      child.stderr.on('data', (chunk) => err.push(chunk));

      let settled = false;
      const abort = () => {
        if (!settled) child.kill('SIGTERM');
      };
      if (init.signal?.aborted) abort();
      else init.signal?.addEventListener('abort', abort, { once: true });

      child.on('error', rejectRun);
      child.on('exit', (code) => {
        settled = true;
        init.signal?.removeEventListener('abort', abort);
        if (init.signal?.aborted)
          return rejectRun(init.signal.reason || Error('request aborted'));
        if (code === 0) return resolveRun(Buffer.concat(out).toString());
        rejectRun(Error(Buffer.concat(err).toString().trim() || `curl exited ${code}`));
      });
    });

    const status = Number.parseInt(String(result).trim().slice(-3), 10);
    if (!Number.isInteger(status) || status < 100 || status > 599)
      throw Error('curl did not return an HTTP status');

    const [body, rawHeaders] = await Promise.all([
      readFile(responsePath),
      readFile(responseHeadersPath, 'utf8').catch(() => ''),
    ]);
    const headers = parseHeaders(rawHeaders);
    headers.set(
      'x-shiguang-auth-transport',
      direct ? 'system-curl-direct' : 'system-curl',
    );
    return new Response(body, { status, headers });
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export function installDeepSeekCurlFallback(
  host = globalThis,
  curlFetch = systemCurlFetch,
) {
  if (host[PATCH_FLAG] || typeof host.fetch !== 'function') return false;

  const nativeFetch = host.fetch.bind(host);
  let preferredMode = 'direct';

  host.fetch = async (input, init) => {
    if (!isDeepSeekRequest(input)) return nativeFetch(input, init);

    const order =
      preferredMode === 'proxy'
        ? [
            { direct: false, name: 'proxy' },
            { direct: true, name: 'direct' },
          ]
        : [
            { direct: true, name: 'direct' },
            { direct: false, name: 'proxy' },
          ];

    for (const mode of order) {
      try {
        const response = await curlFetch(input, init, { direct: mode.direct });
        preferredMode = mode.name;
        return response;
      } catch {
        // Only transport/network failures try the alternate curl path.
      }
    }

    // Curl is unavailable or both curl network paths are blocked.
    return nativeFetch(input, init);
  };

  host[PATCH_FLAG] = true;
  return true;
}
