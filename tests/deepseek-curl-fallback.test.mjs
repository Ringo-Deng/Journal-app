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

test('system curl response replaces Node 401 when curl succeeds', async () => {
  const host = { fetch: async () => new Response('node auth failed', { status: 401 }) };
  let curlCalls = 0;
  installDeepSeekCurlFallback(host, async () => {
    curlCalls++;
    return new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }), { status: 200 });
  });
  const response = await host.fetch(url, init);
  assert.equal(response.status, 200);
  assert.equal(curlCalls, 1);
});

test('successful Node response never invokes curl', async () => {
  const host = { fetch: async () => new Response('{}', { status: 200 }) };
  let curlCalls = 0;
  installDeepSeekCurlFallback(host, async () => { curlCalls++; return new Response('', { status: 200 }); });
  const response = await host.fetch(url, init);
  assert.equal(response.status, 200);
  assert.equal(curlCalls, 0);
});

test('curl 401 is returned with a non-secret diagnostic marker', async () => {
  const host = { fetch: async () => new Response('node auth failed', { status: 401 }) };
  installDeepSeekCurlFallback(host, async () =>
    new Response(JSON.stringify({ error: { message: 'Authentication Fails' } }), { status: 401 }),
  );
  const response = await host.fetch(url, init);
  assert.equal(response.status, 401);
  const text = await response.text();
  assert.match(text, /system curl also returned 401/);
  assert.doesNotMatch(text, /sk-test/);
});
