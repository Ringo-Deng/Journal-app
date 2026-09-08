import test from 'node:test';
import assert from 'node:assert/strict';

const patchFlag = Symbol.for('shiguang.deepseek.fetch.compat.v0133');

async function loadWithMock(mock, tag) {
  const originalFetch = globalThis.fetch;
  delete globalThis[patchFlag];
  globalThis.fetch = mock;
  const mod = await import(`../local/ai-config.mjs?auth-diagnostic=${tag}-${Date.now()}`);
  return { mod, originalFetch };
}

test('DeepSeek 401 diagnostic compares saved key with Authorization and redacts the key', async () => {
  const calls = [];
  const secret = 'sk-brand-new-secret-123456789';
  const mock = async (input, init = {}) => {
    const url = String(input);
    const auth = new Headers(init.headers || {}).get('authorization') || '';
    calls.push({ url, auth });
    return new Response(
      JSON.stringify({ error: { message: `Authentication Fails; auth=${auth}; key=${secret}` } }),
      {
        status: 401,
        headers: { server: 'edge-gateway', 'x-request-id': 'req-test' },
      },
    );
  };
  const { mod, originalFetch } = await loadWithMock(mock, 'same-key');
  try {
    mod.migrateLegacyConfig({
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      apiKey: secret,
      vision: false,
    });
    const response = await globalThis.fetch(
      'https://api.deepseek.com/chat/completions',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'deepseek-v4-flash',
          messages: [{ role: 'user', content: 'Reply OK' }],
        }),
      },
    );
    assert.equal(response.status, 401);
    const message = mod.providerError(401);
    assert.match(message, /Chat 401/);
    assert.match(message, /\/models 401/);
    assert.match(message, /保存值→请求头：一致/);
    assert.doesNotMatch(message, new RegExp(secret));
    assert.doesNotMatch(message, /Bearer sk-/);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].url, 'https://api.deepseek.com/models');
    assert.equal(calls[1].auth, `Bearer ${secret}`);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('DeepSeek /models 200 distinguishes a valid key from chat-layer failure', async () => {
  const secret = 'sk-valid-secret-abcdefghi';
  const mock = async (input) => {
    const url = String(input);
    if (/\/models$/.test(url))
      return new Response(JSON.stringify({ object: 'list', data: [] }), { status: 200 });
    return new Response(JSON.stringify({ error: { message: 'Unauthorized chat' } }), { status: 401 });
  };
  const { mod, originalFetch } = await loadWithMock(mock, 'models-ok');
  try {
    mod.migrateLegacyConfig({
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      apiKey: secret,
      vision: false,
    });
    await globalThis.fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ model: 'deepseek-v4-flash', messages: [] }),
    });
    const message = mod.providerError(401);
    assert.match(message, /\/models 200/);
    assert.match(message, /密钥本身有效/);
    assert.match(message, /保存值→请求头：一致/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('DeepSeek diagnostic detects a changed Authorization key', async () => {
  const mock = async () =>
    new Response(JSON.stringify({ error: { message: 'Authentication Fails' } }), { status: 401 });
  const { mod, originalFetch } = await loadWithMock(mock, 'different-key');
  try {
    mod.migrateLegacyConfig({
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      apiKey: 'sk-saved-key-123456',
      vision: false,
    });
    await globalThis.fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer sk-different-key-654321' },
      body: JSON.stringify({ model: 'deepseek-v4-flash', messages: [] }),
    });
    assert.match(mod.providerError(401), /保存值→请求头：不一致/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
