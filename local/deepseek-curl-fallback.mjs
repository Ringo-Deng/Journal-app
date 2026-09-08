import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PATCH_FLAG = Symbol.for('shiguang.deepseek.curl-fallback.v2');
const AUTH_FAILURE = new Set([401, 403]);

export function isDeepSeekChatRequest(input, init) {
  try {
    const rawUrl =
      typeof input === 'string' || input instanceof URL
        ? String(input)
        : String(input?.url || '');
    const url = new URL(rawUrl);
    return (
      url.hostname === 'api.deepseek.com' &&
      /\/chat\/completions\/?$/.test(url.pathname) &&
      typeof init?.body === 'string'
    );
  } catch {
    return false;
  }
}

function safeRequestHeaders(init) {
  const lines = [];
  for (const [name, value] of new Headers(init?.headers || {})) {
    const lower = name.toLowerCase();
    if (['host', 'content-length', 'connection', 'proxy-authorization'].includes(lower)) continue;
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
  ]) delete env[name];
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
  try {
    await Promise.all([
      writeFile(bodyPath, String(init.body || ''), { mode: 0o600 }),
      writeFile(headerPath, safeRequestHeaders(init), { mode: 0o600 }),
    ]);
    const args = [
      '--silent',
      '--show-error',
      '--max-time',
      '25',
    ];
    if (direct) args.push('--noproxy', '*');
    args.push(
      '--request',
      String(init.method || 'POST'),
      '--url',
      rawUrl,
      '--header',
      `@${headerPath}`,
      '--data-binary',
      `@${bodyPath}`,
      '--dump-header',
      responseHeadersPath,
      '--output',
      responsePath,
      '--write-out',
      '%{http_code}',
    );
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.env.SHIGUANG_CURL_BIN || 'curl', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: curlEnvironment(direct),
      });
      const out = [];
      const err = [];
      child.stdout.on('data', (chunk) => out.push(chunk));
      child.stderr.on('data', (chunk) => err.push(chunk));
      const abort = () => child.kill('SIGTERM');
      init.signal?.addEventListener('abort', abort, { once: true });
      child.on('error', reject);
      child.on('exit', (code) => {
        init.signal?.removeEventListener('abort', abort);
        if (code === 0) resolve(Buffer.concat(out).toString());
        else reject(Error(Buffer.concat(err).toString().trim() || `curl exited ${code}`));
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
    headers.set('x-shiguang-auth-transport', direct ? 'system-curl-direct' : 'system-curl');
    return new Response(body, { status, headers });
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function diagnosticResponse(response, message, transport) {
  return response.clone().text().catch(() => '').then((body) => {
    const headers = new Headers(response.headers);
    headers.set('x-shiguang-auth-transport', transport);
    return new Response(`${body}${body ? '\n' : ''}[Shiguang diagnostic: ${message}]`, {
      status: response.status,
      headers,
    });
  });
}

export function installDeepSeekCurlFallback(host = globalThis, curlFetch = systemCurlFetch) {
  if (host[PATCH_FLAG] || typeof host.fetch !== 'function') return false;
  const nativeFetch = host.fetch.bind(host);
  host.fetch = async (input, init) => {
    const response = await nativeFetch(input, init);
    if (!isDeepSeekChatRequest(input, init) || !AUTH_FAILURE.has(response.status))
      return response;

    // First escape environment proxies entirely. This is the only fallback that
    // can distinguish a provider 401 from a proxy/gateway that rewrites auth.
    try {
      const direct = await curlFetch(input, init, { direct: true });
      if (!AUTH_FAILURE.has(direct.status)) return direct;
      return diagnosticResponse(
        direct,
        `direct system curl also returned ${direct.status}`,
        'system-curl-direct',
      );
    } catch {
      // Some managed networks require their proxy for all outbound HTTPS. In
      // that case still try system curl with the normal environment because it
      // can differ from Node TLS/proxy handling.
      try {
        const fallback = await curlFetch(input, init, { direct: false });
        if (!AUTH_FAILURE.has(fallback.status)) return fallback;
        return diagnosticResponse(
          fallback,
          `direct connection unavailable; proxied system curl returned ${fallback.status}`,
          'system-curl',
        );
      } catch {
        return response;
      }
    }
  };
  host[PATCH_FLAG] = true;
  return true;
}
