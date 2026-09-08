import test from 'node:test';
import assert from 'node:assert/strict';
import {
  installDeepSeekCurlFallback,
  isDeepSeekChatRequest,
  isDeepSeekRequest,
} from '../local/deepseek-curl-fallback.mjs';

const chatUrl = 'https://api.deepseek.com/chat/completions';
const modelsUrl = 'https://api.deepseek.com/models';
const init = {
  method: 'POST',
  headers: {
    Authorization: 'Bearer sk-test',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'deepseek-v4-pro',
    messages: [{ role: 'user', content: 'hi' }],
  }),
};

test('recognizes both official DeepSeek endpoints', () => {
  assert.equal(isDeepSeekRequest(chatUrl), true);
  assert.equal(isDeepSeekRequest(modelsUrl), true);
  assert.equal(isDeepSeekRequest('https://api.deepseek.com/other'), false);
  assert.equal(isDeepSeekRequest('https://example.com/models'), false);
  assert.equal(isDeepSeekChatRequest(chatUrl, init), true);
  assert.equal(isDeepSeekChatRequest(modelsUrl, init), false);
});

test('DeepSeek chat uses direct curl before Node fetch', async () => {
  let nativeCalls = 0;
  const host = {
    fetch: async () => {
      nativeCalls++;
      return new Response('node', { status: 401 });
    },
  };
  const modes = [];
  installDeepSeekCurlFallback(host, async (_input, _init, options) => {
    modes.push(options?.direct === true ? 'direct' : 'proxy');
    return new Response(
      JSON.stringify({ choices: [{ message: { content: 'OK' } }] }),
      { status: 200 },
    );
  });
  const response = await host.fetch(chatUrl, init);
  assert.equal(response.status, 200);
  assert.equal(nativeCalls, 0);
  assert.deepEqual(modes, ['direct']);
});

test('/models uses the exact same curl transport as chat', async () => {
  let nativeCalls = 0;
  const host = {
    fetch: async () => {
      nativeCalls++;
      return new Response('node', { status: 401 });
    },
  };
  const calls = [];
  installDeepSeekCurlFallback(host, async (input, request, options) => {
    calls.push({
      url: String(input),
      method: request?.method || 'GET',
      direct: options?.direct === true,
    });
    return new Response(JSON.stringify({ object: 'list', data: [] }), {
      status: 200,
    });
  });
  const response = await host.fetch(modelsUrl, {
    method: 'GET',
    headers: { Authorization: 'Bearer sk-test' },
  });
  assert.equal(response.status, 200);
  assert.equal(nativeCalls, 0);
  assert.deepEqual(calls, [
    { url: modelsUrl, method: 'GET', direct: true },
  ]);
});

test('non-DeepSeek requests stay on native fetch', async () => {
  let nativeCalls = 0;
  let curlCalls = 0;
  const host = {
    fetch: async () => {
      nativeCalls++;
      return new Response('{}', { status: 200 });
    },
  };
  installDeepSeekCurlFallback(host, async () => {
    curlCalls++;
    return new Response('', { status: 200 });
  });
  const response = await host.fetch('https://example.com/api', init);
  assert.equal(response.status, 200);
  assert.equal(nativeCalls, 1);
  assert.equal(curlCalls, 0);
});

test('provider HTTP errors are authoritative and do not switch transports', async () => {
  let nativeCalls = 0;
  const modes = [];
  const host = {
    fetch: async () => {
      nativeCalls++;
      return new Response('node', { status: 200 });
    },
  };
  installDeepSeekCurlFallback(host, async (_input, _init, options) => {
    modes.push(options?.direct === true ? 'direct' : 'proxy');
    return new Response(
      JSON.stringify({ error: { message: 'Authentication Fails' } }),
      { status: 401 },
    );
  });
  const response = await host.fetch(chatUrl, init);
  assert.equal(response.status, 401);
  assert.equal(nativeCalls, 0);
  assert.deepEqual(modes, ['direct']);
});

test('blocked direct network falls back to proxied curl and remembers it', async () => {
  let nativeCalls = 0;
  const host = {
    fetch: async () => {
      nativeCalls++;
      return new Response('node', { status: 500 });
    },
  };
  const modes = [];
  installDeepSeekCurlFallback(host, async (_input, _init, options) => {
    const mode = options?.direct === true ? 'direct' : 'proxy';
    modes.push(mode);
    if (mode === 'direct') throw Error('direct blocked');
    return new Response(
      JSON.stringify({ choices: [{ message: { content: 'OK' } }] }),
      { status: 200 },
    );
  });

  assert.equal((await host.fetch(chatUrl, init)).status, 200);
  assert.equal((await host.fetch(chatUrl, init)).status, 200);
  assert.equal(nativeCalls, 0);
  assert.deepEqual(modes, ['direct', 'proxy', 'proxy']);
});

test('Node fetch is only used when both curl transports are unavailable', async () => {
  let nativeCalls = 0;
  const host = {
    fetch: async () => {
      nativeCalls++;
      return new Response('node fallback', { status: 200 });
    },
  };
  let curlCalls = 0;
  installDeepSeekCurlFallback(host, async () => {
    curlCalls++;
    throw Error('curl missing');
  });
  const response = await host.fetch(chatUrl, init);
  assert.equal(response.status, 200);
  assert.equal(nativeCalls, 1);
  assert.equal(curlCalls, 2);
});
