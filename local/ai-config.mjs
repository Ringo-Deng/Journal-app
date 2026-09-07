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
export function configIssue(config) {
  if (!config.model?.trim()) return '请填写模型名称。';
  if (!config.apiKey?.trim()) return '请填写服务商后台生成的 API 密钥。';
  if (config.apiKey.trim() === config.model.trim())
    return '密钥栏填的是模型名称。请到服务商后台复制真正的 API 密钥，再粘贴到密钥栏。';
  return '';
}
export function providerError(status) {
  const messages = {
    400: 'AI 服务不接受这次请求，请确认模型支持当前输入格式；有照片时需要支持图片的模型。',
    401: '密钥认证失败。请重新复制服务商后台生成的 API 密钥；模型名称不能当作密钥。',
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
  try {
    const normalized = normalizeBaseUrl(next.baseUrl || 'https://api.deepseek.com');
    if (normalized !== next.baseUrl) {
      next.baseUrl = normalized;
      changed = true;
    }
  } catch {}
  try {
    if (new URL(next.baseUrl).hostname === 'api.deepseek.com') {
      if (['deepseek-chat', 'deepseek-reasoner'].includes(String(next.model || '').trim())) {
        next.model = 'deepseek-v4-flash';
        changed = true;
      }
    }
  } catch {}
  return { config: next, changed };
}
