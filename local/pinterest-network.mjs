import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const MAX_RESPONSE_BYTES = 20 * 1024 * 1024;

function allowedURL(value) {
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password &&
    (!url.port || url.port === '443') &&
    /^(?:pin\.it|(?:[^.]+\.)*(?:pinterest\.com|pinterest\.jp|pinimg\.com))$/i.test(url.hostname);
}

// net.fetch does not expose reliable final URLs. Handle redirects explicitly so
// the existing Pinterest host restrictions also apply before each desktop hop.
export function createPinterestDesktopFetch(net) {
  async function once(url, options) {
    options.signal?.throwIfAborted();
    return new Promise((resolve, reject) => {
      const request = net.request({ url, method: 'GET', redirect: 'manual', credentials: 'omit' });
      let settled = false;
      const finish = (error, response) => {
        if (settled) return;
        settled = true;
        options.signal?.removeEventListener('abort', onAbort);
        if (error) reject(error); else resolve(response);
      };
      const onAbort = () => {
        finish(options.signal.reason || new Error('Pinterest 请求已取消。'));
        request.abort();
      };
      const responseFor = (status, headers, body = null) => {
        const response = new Response(body, { status, headers });
        Object.defineProperty(response, 'url', { value: url });
        return response;
      };
      request.on('error', error => finish(error));
      request.on('redirect', (status, _method, next, headers) => {
        finish(null, responseFor(status, { ...headers, location: next }));
        request.abort();
      });
      request.on('response', incoming => {
        const chunks = [];
        let size = 0;
        incoming.on('error', error => finish(error));
        incoming.on('aborted', () => finish(new Error('Pinterest 响应中断。')));
        incoming.on('data', chunk => {
          size += chunk.length;
          if (size > MAX_RESPONSE_BYTES) {
            finish(Object.assign(new Error('Pinterest 响应超过 20 MB。'), { status: 413 }));
            request.abort();
          } else if (!settled) chunks.push(Buffer.from(chunk));
        });
        incoming.on('end', () => {
          if (settled) return;
          const headers = new Headers();
          for (const [key, values] of Object.entries(incoming.headers))
            for (const value of Array.isArray(values) ? values : [values]) headers.append(key, String(value));
          const body = [204, 205, 304].includes(incoming.statusCode) ? null : Buffer.concat(chunks);
          finish(null, responseFor(incoming.statusCode, headers, body));
        });
      });
      options.signal?.addEventListener('abort', onAbort, { once: true });
      for (const [key, value] of new Headers(options.headers)) request.setHeader(key, value);
      request.end();
    });
  }
  return async (input, options = {}) => {
    let url = String(input);
    for (let hops = 0; hops <= 5; hops++) {
      if (!allowedURL(url)) throw new Error('已停止读取非 Pinterest HTTPS 地址。');
      const response = await once(url, options);
      const location = response.headers.get('location');
      if (response.status < 300 || response.status >= 400 || !location || options.redirect === 'manual') return response;
      if (options.redirect === 'error') throw new Error('Pinterest 请求不允许跳转。');
      url = new URL(location, url).href;
    }
    throw new Error('Pinterest 网页跳转次数过多。');
  };
}

let desktopFetch;
export function pinterestFetch(input, options) {
  // Only the installed Windows utility process needs this transport. Source
  // editions and Mac retain their existing fetch and test injection behavior.
  if (process.platform !== 'win32' || process.type !== 'utility' || !process.versions.electron)
    return globalThis.fetch(input, options);
  desktopFetch ||= createPinterestDesktopFetch(require('electron').net);
  return desktopFetch(input, options);
}
