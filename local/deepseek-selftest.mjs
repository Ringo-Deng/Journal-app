const PATCH_FLAG = Symbol.for('shiguang.deepseek.selftest.v1');
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

export function isConnectionTestPayload(payload) {
  if (!payload || !Array.isArray(payload.messages) || payload.messages.length !== 1)
    return false;
  const message = payload.messages[0];
  return (
    message?.role === 'user' &&
    typeof message.content === 'string' &&
    message.content.trim().toLowerCase() === 'reply with ok only.'
  );
}

function authHeader(init) {
  try {
    return new Headers(init?.headers || {}).get('authorization') || '';
  } catch {
    const headers = init?.headers || {};
    return String(headers.Authorization || headers.authorization || '');
  }
}

export function installDeepSeekSelfTestProbe(host = globalThis) {
  if (host[PATCH_FLAG] || typeof host.fetch !== 'function') return false;
  const nativeFetch = host.fetch.bind(host);
  host.fetch = async (input, init) => {
    if (!isDeepSeekChatRequest(input, init)) return nativeFetch(input, init);

    let payload;
    try {
      payload = JSON.parse(init.body);
    } catch {
      return nativeFetch(input, init);
    }
    if (!isConnectionTestPayload(payload)) return nativeFetch(input, init);

    const authorization = authHeader(init);
    if (!authorization) return nativeFetch(input, init);

    try {
      const chatUrl = new URL(
        typeof input === 'string' || input instanceof URL ? String(input) : input.url,
      );
      const probeUrl = new URL(chatUrl.toString());
      probeUrl.pathname = probeUrl.pathname.replace(/\/chat\/completions\/?$/, '/models');
      probeUrl.search = '';
      probeUrl.hash = '';
      const probeResponse = await nativeFetch(probeUrl, {
        method: 'GET',
        headers: { Authorization: authorization },
        signal: AbortSignal.timeout(10_000),
      });
      if (AUTH_FAILURE.has(probeResponse.status)) return probeResponse;
      // A transient /models failure must not make a working Chat endpoint look broken.
      // The existing Chat retry/diagnostic layer remains the source of truth.
    } catch {
      // Network-specific /models probing is diagnostic only; continue to Chat.
    }
    return nativeFetch(input, init);
  };
  host[PATCH_FLAG] = true;
  return true;
}
