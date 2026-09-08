const PATCH_FLAG = Symbol.for('shiguang.deepseek.material-classifier.v1');

function rawUrl(input) {
  return typeof input === 'string' || input instanceof URL
    ? String(input)
    : String(input?.url || '');
}

export function isMaterialClassificationRequest(input, init = {}) {
  try {
    const url = new URL(rawUrl(input));
    if (
      url.hostname !== 'api.deepseek.com' ||
      !/\/chat\/completions\/?$/.test(url.pathname) ||
      typeof init.body !== 'string'
    ) return false;
    const payload = JSON.parse(init.body);
    return Array.isArray(payload?.messages) && payload.messages.some(
      (message) =>
        message?.role === 'system' &&
        typeof message.content === 'string' &&
        message.content.includes('你是手帐素材整理员'),
    );
  } catch {
    return false;
  }
}

function parseCompletionJson(result) {
  const content = result?.choices?.[0]?.message?.content;
  const text = typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content.filter((part) => part?.type === 'text').map((part) => part.text || '').join('\n')
      : '';
  if (!text.trim()) return null;
  const clean = text
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
  try {
    const value = JSON.parse(clean);
    return value && !Array.isArray(value) && Array.isArray(value.items) ? value : null;
  } catch {
    try {
      const start = clean.indexOf('{');
      const end = clean.lastIndexOf('}');
      if (start < 0 || end <= start) return null;
      const value = JSON.parse(clean.slice(start, end + 1));
      return value && !Array.isArray(value) && Array.isArray(value.items) ? value : null;
    } catch {
      return null;
    }
  }
}

async function usableClassificationResponse(response) {
  if (!response?.ok) return false;
  try {
    const result = await response.clone().json();
    return !!parseCompletionJson(result);
  } catch {
    return false;
  }
}

function metadataOnlyMessages(messages) {
  return messages.map((message) => {
    if (message?.role !== 'user' || !Array.isArray(message.content)) return message;
    const texts = message.content
      .filter((part) => part?.type === 'text' && typeof part.text === 'string')
      .map((part, index) => {
        if (index !== 0) return part.text;
        try {
          const payload = JSON.parse(part.text);
          if (payload && typeof payload === 'object') {
            payload.visual = false;
            return JSON.stringify(payload);
          }
        } catch {}
        return part.text;
      });
    return {
      ...message,
      content:
        texts.join('\n') +
        '\n图片暂不可用。请只根据素材名称、已有分类和标签保守判断；所有 confident 必须为 false。',
    };
  });
}

export function buildMaterialFallbackInit(init = {}) {
  const payload = JSON.parse(init.body);
  const fallback = {
    ...payload,
    messages: metadataOnlyMessages(payload.messages || []),
    response_format: { type: 'json_object' },
    thinking: { type: 'disabled' },
    temperature: 0.2,
    max_tokens: Math.min(Number(payload.max_tokens) || 6000, 6000),
  };
  return { ...init, body: JSON.stringify(fallback) };
}

export function installMaterialClassifierFallback(host = globalThis) {
  if (host[PATCH_FLAG] || typeof host.fetch !== 'function') return false;
  const nativeFetch = host.fetch.bind(host);

  host.fetch = async (input, init) => {
    if (!isMaterialClassificationRequest(input, init)) return nativeFetch(input, init);

    let primary;
    try {
      primary = await nativeFetch(input, init);
      if (await usableClassificationResponse(primary)) return primary;
    } catch {
      // Image transport/model failures should not make the whole material batch unusable.
    }

    try {
      const fallback = await nativeFetch(input, buildMaterialFallbackInit(init));
      const headers = new Headers(fallback.headers);
      headers.set('x-shiguang-material-classifier', 'metadata-fallback');
      const body = await fallback.arrayBuffer();
      return new Response(body, {
        status: fallback.status,
        statusText: fallback.statusText,
        headers,
      });
    } catch {
      if (primary) return primary;
      throw Error('素材分类的图片与文字备用通道都不可用。');
    }
  };

  host[PATCH_FLAG] = true;
  return true;
}
