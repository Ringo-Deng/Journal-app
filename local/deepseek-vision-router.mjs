const PATCH_FLAG = Symbol.for('shiguang.deepseek.vision-router.v1');
export const DEEPSEEK_VISION_MODEL = 'deepseek-v4-flash-vision-exp';

function rawUrl(input) {
  return typeof input === 'string' || input instanceof URL
    ? String(input)
    : String(input?.url || '');
}

export function payloadHasImage(payload) {
  return Array.isArray(payload?.messages) && payload.messages.some((message) =>
    Array.isArray(message?.content) && message.content.some((part) =>
      part?.type === 'image_url' && typeof part?.image_url?.url === 'string' && part.image_url.url,
    ),
  );
}

export function routeDeepSeekVisionPayload(input, init = {}) {
  try {
    const url = new URL(rawUrl(input));
    if (
      url.hostname !== 'api.deepseek.com' ||
      !/\/chat\/completions\/?$/.test(url.pathname) ||
      typeof init?.body !== 'string'
    )
      return init;

    const payload = JSON.parse(init.body);
    if (!payloadHasImage(payload) || payload.model === DEEPSEEK_VISION_MODEL)
      return init;

    return {
      ...init,
      body: JSON.stringify({ ...payload, model: DEEPSEEK_VISION_MODEL }),
    };
  } catch {
    return init;
  }
}

export function installDeepSeekVisionRouter(host = globalThis) {
  if (host[PATCH_FLAG] || typeof host.fetch !== 'function') return false;
  const nativeFetch = host.fetch.bind(host);
  host.fetch = (input, init) => nativeFetch(input, routeDeepSeekVisionPayload(input, init));
  host[PATCH_FLAG] = true;
  return true;
}
