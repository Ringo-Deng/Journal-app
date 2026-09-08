import test from 'node:test';
import assert from 'node:assert/strict';
import { installDeepSeekCurlFallback, isDeepSeekChatRequest } from '../local/deepseek-curl-fallback.mjs';

const url = 'https://api.deepseek.com/chat/completions';
const init = {
  method: 'POST',
  headers: { Authorization: 'Bearer sk-test', 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: 'deepseek-v4-pro', messages: [{ role: 'user', content: 'hi' }] }),
};

test('recognizes DeepSeek chat requests only', () => {
  assert.equal(isDeepSeekChatRequest(url, init), true);
  assert.equal(isDeepSeekChatRequest('https://api.deepseek.com/models', init), false);
});

test('DeepSeek chat uses direct curl before Node fetch', async () => {
  let nativeCalls = 0;
  const host = { fetch: async () => { nativeCalls++; return new Response('node', { status: 401 }); } };
  const modes = [];
  installDeepSeekCurlFallback(host, async (_input, _init, options) => {
    modes.push(options?.direct === true ? 'direct' : 'proxy');
    return new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }), { status: 200 });
  });
  const response = await host.fetch(url, init);
  assert.equal(response.status, 200);
  assert.equal(nativeCalls, 0);
  assert.deepEqual(modes, ['direct']);
});

test('non-DeepSeek requests stay on native fetch', async () => {
  let nativeCalls = 0;
  let curlCalls = 0;
  const host = { fetch: async () => { nativeCalls++; return new Response('{}', { status: 200 }); } };
  installDeepSeekCurlFallback(host, async () => { curlCalls++; return new Response('', { status: 200 }); });
  const response = await host.fetch('https://example.com/api', init);
  assert.equal(response.status, 200);
  assert.equal(nativeCalls, 1);
  assert.equal(curlCalls, 0);
});

test('direct HTTP response is authoritative and does not invoke Node', async () => {
  let nativeCalls = 0;
  const host = { fetch: async () => { nativeCalls++; return new Response('node', { status: 200 }); } };
  installDeepSeekCurlFallback(host, async () =>
    new Response(JSON.stringify({ error: { message: 'Authentication Fails' } }), { status: 401 }),
  );
  const response = await host.fetch(url, init);
  assert.equal(response.status, 401);
  assert.equal(nativeCalls, 0);
});

test('blocked direct network falls back to proxied curl', async () => {
  let nativeCalls = 0;
  const host = { fetch: async () => { nativeCalls++; return new Response('node', { status: 500 }); } };
  const modes = [];
  installDeepSeekCurlFallback(host, async (_input, _init, options) => {
    const mode = options?.direct === true ? 'direct' : 'proxy';
    modes.push(mode);
    if (mode === 'direct') throw Error('direct blocked');
    return new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }), { status: 200 });
  });
  const response = await host.fetch(url, init);
  assert.equal(response.status, 200);
  assert.equal(nativeCalls, 0);
  assert.deepEqual(modes, ['direct', 'proxy']);
});

test('Node fetch is only used when both curl transports are unavailable', async () => {
  let nativeCalls = 0;
  const host = { fetch: async () => { nativeCalls++; return new Response('node fallback', { status: 200 }); } };
  let curlCalls = 0;
  installDeepSeekCurlFallback(host, async () => { curlCalls++; throw Error('curl missing'); });
  const response = await host.fetch(url, init);
  assert.equal(response.status, 200);
  assert.equal(nativeCalls, 1);
  assert.equal(curlCalls, 2);
});
