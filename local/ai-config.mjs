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
  const quoted =
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"));
  if (quoted && key.length >= 2) key = key.slice(1, -1).trim();
  key = key.replace(/^Bearer\s+/i, '').trim();
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
    401: 'DeepSeek 返回 401：当前 API Key 未通过认证。请在 DeepSeek 开放平台重新复制或重新生成 API Key，然后保存并重新测试。',
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
    }
  } catch {}
  return { config: next, changed };
}
