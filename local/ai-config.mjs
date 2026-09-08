export function normalizeBaseUrl(value) {
  const url = new URL(String(value).trim());
  if (url.hostname === 'platform.deepseek.com')
    return 'https://api.deepseek.com';
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    (url.protocol === 'http:' &&
      !['localhost', '127.0.0.1'].includes(url.hostname)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw Error('API 地址须使用 HTTPS，本地服务可使用 HTTP。');
  url.pathname = url.pathname
    .replace(/\/(chat\/completions|models)\/?$/, '')
    .replace(/\/$/, '');
  return url.toString().replace(/\/$/, '');
}

export function normalizeApiKey(value) {
  let key = String(value || '').trim();
  key = key.replace(/^`+|`+$/g, '').trim();
  key = key.replace(/^(?:export\s+)?DEEPSEEK_API_KEY\s*=\s*/i, '').trim();
  const quoted =
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"));
  if (quoted && key.length >= 2) key = key.slice(1, -1).trim();
  key = key.replace(/^Bearer\s+/i, '').trim();
  // API keys never contain whitespace or zero-width formatting characters.
  // Removing them makes keys copied from terminals/password managers robust.
  key = key.replace(/[\s\u200B-\u200D\uFEFF]+/g, '');
  return key;
}

export const DEEPSEEK_DEFAULT_MODEL = 'deepseek-v4-flash-vision-exp';
export const DEEPSEEK_MODELS = [
  { id: 'deepseek-v4-flash-vision-exp', label: 'Vision（默认）' },
  { id: 'deepseek-v4-flash', label: 'V4 Flash（快速）' },
  { id: 'deepseek-v4-pro', label: 'V4 Pro（高质量）' },
];

const LEGACY_DEEPSEEK_MODELS = ['deepseek-chat', 'deepseek-reasoner'];
const isModelName = (value) => {
  const key = String(value || '').trim();
  return (
    DEEPSEEK_MODELS.some((item) => item.id === key) ||
    LEGACY_DEEPSEEK_MODELS.includes(key)
  );
};

export const modelSupportsVision = (model) =>
  String(model || '').trim() === 'deepseek-v4-flash-vision-exp';

export function configIssue(config) {
  const model = String(config?.model || '').trim();
  const apiKey = normalizeApiKey(config?.apiKey);
  if (!model) return '请选择 DeepSeek 模型。';
  if (!apiKey) return '请填写服务商后台生成的 API 密钥。';
  if (isModelName(apiKey))
    return '密钥栏填的是模型名称。请到 DeepSeek 开放平台复制真正的 API Key，再粘贴到密钥栏。';
  if (/^https?:\/\//i.test(apiKey))
    return '密钥栏填的是网址。API 地址和 API Key 是两项不同的设置，请粘贴真正的 API Key。';
  return '';
}

export function providerError(status) {
  const messages = {
    400: 'AI 服务不接受这次请求，请确认模型支持当前输入格式；有照片时需要支持图片的模型。',
    401: 'DeepSeek 返回 401：当前 API Key 未通过认证。Pull 新代码不会替换本机已保存的密钥，请重新复制或重新生成有效 API Key，保存后再测试。',
    402: 'AI 账户余额不足，请在服务商后台检查余额。',
    403: '当前密钥没有调用权限，请检查服务商账户或模型权限。',
    404: '没有找到接口或模型，请检查 API 基础地址和模型名称。',
    429: 'AI 服务请求过于频繁或用量已达上限，请稍后重试。',
  };
  return messages[status] || `AI 服务暂时不可用（${status}），请稍后重试。`;
}

export function migrateLegacyConfig(config) {
  const next = { ...config };
  let changed = false;
  const apiKey = normalizeApiKey(next.apiKey);
  if (apiKey !== String(next.apiKey || '')) {
    next.apiKey = apiKey;
    changed = true;
  }
  try {
    const normalized = normalizeBaseUrl(next.baseUrl || 'https://api.deepseek.com');
    if (normalized !== next.baseUrl) {
      next.baseUrl = normalized;
      changed = true;
    }
  } catch {}
  try {
    if (new URL(next.baseUrl).hostname === 'api.deepseek.com') {
      if (LEGACY_DEEPSEEK_MODELS.includes(String(next.model || '').trim())) {
        next.model = 'deepseek-v4-flash';
        changed = true;
      }
      // Older builds could preserve vision=true after migrating to a text-only
      // model. That makes the final image stage of "保存并测试" fail even when
      // the key and text model are valid.
      if (next.vision !== false && !modelSupportsVision(next.model)) {
        next.vision = false;
        changed = true;
      }
    }
  } catch {}
  return { config: next, changed };
}

/**
 * Keep every direct DeepSeek Chat Completions request on the same predictable
 * non-thinking path used by the journal's production design requests.
 * DeepSeek V4 enables thinking by default; tiny health checks can otherwise
 * spend their whole output allowance on reasoning and return no final text.
 */
export function prepareDeepSeekPayload(payload) {
  const next = { ...(payload || {}) };
  if (next.thinking == null) next.thinking = { type: 'disabled' };
  if (
    Number.isFinite(Number(next.max_tokens)) &&
    Number(next.max_tokens) > 0 &&
    Number(next.max_tokens) < 256
  )
    next.max_tokens = 256;
  const prompt = Array.isArray(next.messages)
    ? next.messages
        .map((message) =>
          typeof message?.content === 'string'
            ? message.content
            : Array.isArray(message?.content)
              ? message.content
                  .filter((part) => part?.type === 'text')
                  .map((part) => part.text || '')
                  .join(' ')
              : '',
        )
        .join(' ')
    : '';
  if (!next.response_format && /\bjson\b/i.test(prompt))
    next.response_format = { type: 'json_object' };
  return next;
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const PATCH_FLAG = Symbol.for('shiguang.deepseek.fetch.compat.v0128');
const assistantText = (result) => {
  const content = result?.choices?.[0]?.message?.content;
  return typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content
          .filter((part) => part?.type === 'text')
          .map((part) => part.text || '')
          .join('\n')
      : '';
};
const retryDelay = (signal) =>
  new Promise((resolveDelay) => {
    if (signal?.aborted) return resolveDelay();
    const timer = setTimeout(resolveDelay, 250);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolveDelay();
      },
      { once: true },
    );
  });

function installDeepSeekFetchCompatibility() {
  const host = globalThis;
  if (host[PATCH_FLAG] || typeof host.fetch !== 'function') return;
  const nativeFetch = host.fetch.bind(host);
  host.fetch = async (input, init) => {
    let deepseek = false;
    let payload;
    try {
      const rawUrl =
        typeof input === 'string' || input instanceof URL
          ? String(input)
          : String(input?.url || '');
      const url = new URL(rawUrl);
      deepseek =
        url.hostname === 'api.deepseek.com' &&
        /\/chat\/completions\/?$/.test(url.pathname) &&
        typeof init?.body === 'string';
      if (deepseek) {
        payload = prepareDeepSeekPayload(JSON.parse(init.body));
        init = { ...init, body: JSON.stringify(payload) };
      }
    } catch {
      // Non-DeepSeek and non-JSON requests pass through untouched.
    }
    if (!deepseek) return nativeFetch(input, init);

    let response;
    for (let attempt = 0; attempt < 2; attempt++) {
      response = await nativeFetch(input, init);
      if (
        attempt === 0 &&
        !init?.signal?.aborted &&
        RETRYABLE_STATUS.has(response.status)
      ) {
        await retryDelay(init?.signal);
        continue;
      }
      if (
        attempt === 0 &&
        !init?.signal?.aborted &&
        response.ok &&
        payload?.response_format?.type === 'json_object'
      ) {
        try {
          const parsed = await response.clone().json();
          if (!assistantText(parsed).trim()) {
            await retryDelay(init?.signal);
            continue;
          }
        } catch {
          // Let the existing response parser report a malformed provider body.
        }
      }
      return response;
    }
    return response;
  };
  host[PATCH_FLAG] = true;
}

installDeepSeekFetchCompatibility();
