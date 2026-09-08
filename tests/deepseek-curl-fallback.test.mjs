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

test('direct system curl response replaces Node 401 when direct request succeeds', async () => {
  const host = { fetch: async () => new Response('node auth failed', { status: 401 }) };
  const modes = [];
  installDeepSeekCurlFallback(host, async (_input, _init, options) => {
    modes.push(options?.direct === true ? 'direct' : 'proxy');
    return new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }), { status: 200 });
  });
  const response = await host.fetch(url, init);
  assert.equal(response.status, 200);
  assert.deepEqual(modes, ['direct']);
});

test('successful Node response never invokes curl', async () => {
  const host = { fetch: async () => new Response('{}', { status: 200 }) };
  let curlCalls = 0;
  installDeepSeekCurlFallback(host, async () => { curlCalls++; return new Response('', { status: 200 }); });
  const response = await host.fetch(url, init);
  assert.equal(response.status, 200);
  assert.equal(curlCalls, 0);
});

test('direct 401 is definitive and does not retry through the same proxy', async () => {
  const host = { fetch: async () => new Response('node auth failed', { status: 401 }) };
  const modes = [];
  installDeepSeekCurlFallback(host, async (_input, _init, options) => {
    modes.push(options?.direct === true ? 'direct' : 'proxy');
    return new Response(JSON.stringify({ error: { message: 'Authentication Fails' } }), { status: 401 });
  });
  const response = await host.fetch(url, init);
  assert.equal(response.status, 401);
  assert.deepEqual(modes, ['direct']);
  const text = await response.text();
  assert.match(text, /direct system curl also returned 401/);
  assert.doesNotMatch(text, /sk-test/);
  assert.equal(response.headers.get('x-shiguang-auth-transport'), 'system-curl-direct');
});

test('when direct networking is blocked, proxied system curl can still rescue Node 401', async () => {
  const host = { fetch: async () => new Response('node auth failed', { status: 401 }) };
  const modes = [];
  installDeepSeekCurlFallback(host, async (_input, _init, options) => {
    const mode = options?.direct === true ? 'direct' : 'proxy';
    modes.push(mode);
    if (mode === 'direct') throw Error('direct blocked');
    return new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }), { status: 200 });
  });
  const response = await host.fetch(url, init);
  assert.equal(response.status, 200);
  assert.deepEqual(modes, ['direct', 'proxy']);
});

test('when direct is blocked and proxied curl also gets 401, result says so without leaking key', async () => {
  const host = { fetch: async () => new Response('node auth failed', { status: 401 }) };
  installDeepSeekCurlFallback(host, async (_input, _init, options) => {
    if (options?.direct) throw Error('direct blocked');
    return new Response(JSON.stringify({ error: { message: 'Authentication Fails' } }), { status: 401 });
  });
  const response = await host.fetch(url, init);
  assert.equal(response.status, 401);
  const text = await response.text();
  assert.match(text, /direct connection unavailable; proxied system curl returned 401/);
  assert.doesNotMatch(text, /sk-test/);
});
