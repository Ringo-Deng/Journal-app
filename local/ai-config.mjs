import { createHash } from 'node:crypto';

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
  key = key.replace(/[\s\u200B-\u200D\uFEFF]+/g, '');
  return key;
}

export function apiKeyIdentity(value) {
  const key = normalizeApiKey(value);
  return {
    fingerprint: key
      ? createHash('sha256').update(key).digest('hex').slice(0, 12)
      : '',
    length: key.length,
  };
}

export function sanitizeProviderDiagnosticText(value, apiKey = '') {
  let text = String(value || '').replace(/\s+/g, ' ').trim();
  const key = normalizeApiKey(apiKey);
  if (key) text = text.split(key).join('[REDACTED]');
  text = text
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/(?:sk|key)[-_][A-Za-z0-9._~+/=-]{8,}/gi, '[REDACTED]');
  return text.slice(0, 280);
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

let lastConfigIdentity = { fingerprint: '', length: 0 };
let lastProviderDiagnostic = null;

const diagnosticFresh = () =>
  lastProviderDiagnostic &&
  Date.now() - Number(lastProviderDiagnostic.at || 0) < 60_000;

export function configIssue(config) {
  const model = String(config?.model || '').trim();
  const apiKey = normalizeApiKey(config?.apiKey);
  if (!model) return '请选择 DeepSeek 模型。';
  if (!apiKey) return '请填写服务商后台生成的 API 密钥。';
  if (apiKey === model || isModelName(apiKey))
    return '密钥栏填的是模型名称。请到 DeepSeek 开放平台复制真正的 API Key，再粘贴到密钥栏。';
  if (/^https?:\/\//i.test(apiKey))
    return '密钥栏填的是网址。API 地址和 API Key 是两项不同的设置，请粘贴真正的 API Key。';
  return '';
}

function authDiagnosticMessage() {
  if (!diagnosticFresh()) return '';
  const diagnostic = lastProviderDiagnostic;
  const sent = diagnostic.sentIdentity || { fingerprint: '', length: 0 };
  const saved = diagnostic.savedIdentity || { fingerprint: '', length: 0 };
  const same =
    !!saved.fingerprint &&
    saved.fingerprint === sent.fingerprint &&
    saved.length === sent.length;
  const source = [
    diagnostic.server && `server=${diagnostic.server}`,
    diagnostic.via && `via=${diagnostic.via}`,
    diagnostic.requestId && `request-id=${diagnostic.requestId}`,
  ]
    .filter(Boolean)
    .join('，');
  const probe =
    diagnostic.probeStatus == null
      ? '认证探针未完成'
      : `/models ${diagnostic.probeStatus}`;
  const parts = [
    `诊断：Chat ${diagnostic.status}，${probe}`,
    `本机保存密钥指纹 ${saved.fingerprint || '无'} / 长度 ${saved.length}`,
    `请求头密钥指纹 ${sent.fingerprint || '无'} / 长度 ${sent.length}`,
    `保存值→请求头：${same ? '一致' : '不一致'}`,
  ];
  if (source) parts.push(`响应来源：${source}`);
  if (diagnostic.body) parts.push(`Chat 返回：${diagnostic.body}`);
  if (diagnostic.probeBody)
    parts.push(`/models 返回：${diagnostic.probeBody}`);

  if (diagnostic.probeStatus === 200)
    parts.push(
      '同一密钥能通过 /models 认证，说明密钥本身有效；问题更可能在 Chat 接口、请求路径或中间网络层。',
    );
  else if (diagnostic.status === 401 && diagnostic.probeStatus === 401)
    parts.push(
      '同一密钥在 Chat 与 /models 都被拒绝。如果这是刚生成的新 Key，优先排查公司网络/代理是否改写 Authorization，或 DeepSeek 账户侧 API 权限。',
    );

  return parts.join('；') + '。';
}

export function providerError(status) {
  const messages = {
    400: 'AI 服务不接受这次请求，请确认模型支持当前输入格式；有照片时需要支持图片的模型。',
    401: 'DeepSeek 返回 401：认证未通过。',
    402: 'AI 账户余额不足，请在服务商后台检查余额。',
    403: '当前密钥没有调用权限，请检查服务商账户或模型权限。',
    404: '没有找到接口或模型，请检查 API 基础地址和模型名称。',
    429: 'AI 服务请求过于频繁或用量已达上限，请稍后重试。',
  };
  const base =
    messages[status] || `AI 服务暂时不可用（${status}），请稍后重试。`;
  return [base, status === 401 || status === 403 ? authDiagnosticMessage() : '']
    .filter(Boolean)
    .join(' ');
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
    const normalized = normalizeBaseUrl(
      next.baseUrl || 'https://api.deepseek.com',
    );
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
      if (next.vision !== false && !modelSupportsVision(next.model)) {
        next.vision = false;
        changed = true;
      }
    }
  } catch {}
  lastConfigIdentity = apiKeyIdentity(next.apiKey);
  return { config: next, changed };
}

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
const PATCH_FLAG = Symbol.for('shiguang.deepseek.fetch.compat.v0133');

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

function authHeader(init) {
  try {
    return new Headers(init?.headers || {}).get('authorization') || '';
  } catch {
    const headers = init?.headers || {};
    return String(headers.Authorization || headers.authorization || '');
  }
}

function responseMeta(response) {
  return {
    server: response.headers.get('server') || '',
    via: response.headers.get('via') || '',
    requestId:
      response.headers.get('x-request-id') ||
      response.headers.get('request-id') ||
      response.headers.get('cf-ray') ||
      '',
  };
}

async function responseBodyForDiagnostic(response, apiKey) {
  try {
    return sanitizeProviderDiagnosticText(
      await response.clone().text(),
      apiKey,
    );
  } catch {
    return '';
  }
}

async function captureAuthDiagnostic(response, url, init, nativeFetch) {
  const authorization = authHeader(init);
  const apiKey = authorization.replace(/^Bearer\s+/i, '');
  const sentIdentity = apiKeyIdentity(apiKey);
  const diagnostic = {
    at: Date.now(),
    status: response.status,
    endpoint: url.pathname,
    sentIdentity,
    savedIdentity: { ...lastConfigIdentity },
    body: await responseBodyForDiagnostic(response, apiKey),
    ...responseMeta(response),
    probeStatus: null,
    probeBody: '',
  };

  if ([401, 403].includes(response.status)) {
    try {
      const probeUrl = new URL(url.toString());
      probeUrl.pathname = probeUrl.pathname.replace(
        /\/chat\/completions\/?$/,
        '/models',
      );
      probeUrl.search = '';
      probeUrl.hash = '';
      const probeResponse = await nativeFetch(probeUrl, {
        method: 'GET',
        headers: { Authorization: authorization },
        signal: AbortSignal.timeout(10_000),
      });
      diagnostic.probeStatus = probeResponse.status;
      diagnostic.probeBody = await responseBodyForDiagnostic(
        probeResponse,
        apiKey,
      );
    } catch (error) {
      diagnostic.probeBody = sanitizeProviderDiagnosticText(
        `探针连接失败：${error?.message || error}`,
        apiKey,
      );
    }
  }

  lastProviderDiagnostic = diagnostic;
}

function installDeepSeekFetchCompatibility() {
  const host = globalThis;
  if (host[PATCH_FLAG] || typeof host.fetch !== 'function') return;
  const nativeFetch = host.fetch.bind(host);
  host.fetch = async (input, init) => {
    let deepseek = false;
    let payload;
    let url;
    try {
      const rawUrl =
        typeof input === 'string' || input instanceof URL
          ? String(input)
          : String(input?.url || '');
      url = new URL(rawUrl);
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
      if ([401, 403].includes(response.status))
        await captureAuthDiagnostic(response, url, init, nativeFetch);
      return response;
    }
    return response;
  };
  host[PATCH_FLAG] = true;
}

installDeepSeekFetchCompatibility();
