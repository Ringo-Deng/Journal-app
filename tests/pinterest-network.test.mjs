import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createPinterestDesktopFetch, pinterestFetch } from '../local/pinterest-network.mjs';

function fixture(respond) {
  const requests = [];
  const net = { request(options) {
    const request = new EventEmitter();
    Object.assign(request, { headers: {}, aborted: false,
      setHeader(key, value) { this.headers[key] = value; },
      abort() { this.aborted = true; this.emit('error', Error('aborted')); },
      end() { queueMicrotask(() => respond(request, options)); },
    });
    requests.push({ options, request });
    return request;
  } };
  return { fetch: createPinterestDesktopFetch(net), requests };
}
function reply(request, body, status = 200) {
  const incoming = new EventEmitter();
  Object.assign(incoming, { statusCode: status, headers: { 'content-type': ['text/html'], 'x-test': ['a', 'b'] } });
  request.emit('response', incoming);
  incoming.emit('data', Buffer.from(body));
  incoming.emit('end');
}

test('desktop Pinterest uses native networking, preserves headers and final URL through redirects', async () => {
  const f = fixture((request, { url }) => url.includes('pin.it')
    ? request.emit('redirect', 302, 'GET', 'https://www.pinterest.com/pin/123456/', {})
    : reply(request, '<meta>'));
  const response = await f.fetch('https://pin.it/abc', { headers: { 'User-Agent': 'test' } });
  assert.equal(await response.text(), '<meta>');
  assert.equal(response.url, 'https://www.pinterest.com/pin/123456/');
  assert.equal(f.requests.length, 2);
  assert.equal(f.requests[0].request.headers['user-agent'], 'test');
  assert.equal(f.requests[0].options.credentials, 'omit');
  assert.equal(f.requests[0].request.aborted, true);
});
test('manual sharing-link redirects expose location without following', async () => {
  const f = fixture(r => r.emit('redirect', 308, 'GET', 'https://api.pinterest.com/redirect/', {}));
  const response = await f.fetch('https://pin.it/abc', { redirect: 'manual' });
  assert.equal(response.status, 308);
  assert.equal(response.headers.get('location'), 'https://api.pinterest.com/redirect/');
  assert.equal(f.requests.length, 1);
});
test('desktop rejects foreign, insecure, credentialed and looping redirects before requesting them', async () => {
  for (const destination of ['https://example.org/', 'http://i.pinimg.com/a', 'file:///private/a', 'https://pinterest.com.evil.org/', 'https://user:pass@pinterest.com/', 'https://i.pinimg.com:444/a']) {
    const f = fixture(r => r.emit('redirect', 302, 'GET', destination, {}));
    await assert.rejects(f.fetch('https://pin.it/abc'), /非 Pinterest/);
    assert.equal(f.requests.length, 1);
  }
  const f = fixture(r => r.emit('redirect', 302, 'GET', 'https://pin.it/loop', {}));
  await assert.rejects(f.fetch('https://pin.it/loop'), /跳转次数/);
  assert.equal(f.requests.length, 6);
});
test('abort and oversized response stop the native request', async () => {
  const controller = new AbortController();
  const f = fixture(() => controller.abort());
  await assert.rejects(f.fetch('https://i.pinimg.com/a', { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(f.requests[0].request.aborted, true);
  const large = fixture(r => reply(r, Buffer.alloc(20 * 1024 * 1024 + 1)));
  await assert.rejects(large.fetch('https://i.pinimg.com/a'), { status: 413 });
  assert.equal(large.requests[0].request.aborted, true);
  const aborted = fixture(() => assert.fail('must not start'));
  await assert.rejects(aborted.fetch('https://pin.it/a', { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(aborted.requests.length, 0);
});
test('network failure and interrupted body reject instead of leaving preview pending', async () => {
  for (const body of [false, true]) {
    const f = fixture(r => {
      if (!body) return r.emit('error', Error('offline'));
      const incoming = new EventEmitter();
      r.emit('response', incoming);
      incoming.emit('aborted');
    });
    await assert.rejects(f.fetch('https://pin.it/a'), body ? /中断/ : /offline/);
  }
});
test('source edition retains its existing fetch', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('source'));
  assert.equal(await (await pinterestFetch('https://pin.it/abc')).text(), 'source');
});
