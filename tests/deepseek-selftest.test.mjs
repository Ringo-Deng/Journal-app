import test from 'node:test';
import assert from 'node:assert/strict';
import {
  installDeepSeekSelfTestProbe,
  isConnectionTestPayload,
} from '../local/deepseek-selftest.mjs';

const chatUrl = 'https://api.deepseek.com/chat/completions';
const textBody = JSON.stringify({
  model: 'deepseek-v4-flash',
  messages: [{ role: 'user', content: 'Reply with OK only.' }],
});
const productionBody = JSON.stringify({
  model: 'deepseek-v4-flash',
  messages: [{ role: 'user', content: 'Design my journal page.' }],
});

test('only the exact first connection-test prompt is recognized', () => {
  assert.equal(isConnectionTestPayload(JSON.parse(textBody)), true);
  assert.equal(isConnectionTestPayload(JSON.parse(productionBody)), false);
});

test('connection test probes /models before Chat and continues when auth passes', async () => {
  const calls = [];
  const host = {
    fetch: async (input, init) => {
      const url = String(input);
      calls.push([url, init?.method || 'GET']);
      if (url.endsWith('/models')) return new Response(JSON.stringify({ object: 'list', data: [] }), { status: 200 });
      return new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }), { status: 200 });
    },
  };
  installDeepSeekSelfTestProbe(host);
  const response = await host.fetch(chatUrl, {
    method: 'POST',
    headers: { Authorization: 'Bearer sk-test', 'Content-Type': 'application/json' },
    body: textBody,
  });
  assert.equal(response.status, 200);
  assert.deepEqual(calls.map(([url, method]) => [new URL(url).pathname, method]), [
    ['/models', 'GET'],
    ['/chat/completions', 'POST'],
  ]);
});

test('/models auth failure cannot block a working Chat request', async () => {
  const calls = [];
  const host = {
    fetch: async (input, init) => {
      const url = String(input);
      calls.push([url, init?.method || 'GET']);
      if (url.endsWith('/models')) return new Response(JSON.stringify({ error: { message: 'Authentication Fails' } }), { status: 401 });
      return new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }), { status: 200 });
    },
  };
  installDeepSeekSelfTestProbe(host);
  const response = await host.fetch(chatUrl, {
    method: 'POST',
    headers: { Authorization: 'Bearer sk-test', 'Content-Type': 'application/json' },
    body: textBody,
  });
  assert.equal(response.status, 200);
  assert.deepEqual(calls.map(([url, method]) => [new URL(url).pathname, method]), [
    ['/models', 'GET'],
    ['/chat/completions', 'POST'],
  ]);
});

test('real Chat auth failure remains the final result', async () => {
  const calls = [];
  const host = {
    fetch: async (input, init) => {
      const url = String(input);
      calls.push([url, init?.method || 'GET']);
      return new Response(JSON.stringify({ error: { message: 'Authentication Fails' } }), { status: 401 });
    },
  };
  installDeepSeekSelfTestProbe(host);
  const response = await host.fetch(chatUrl, {
    method: 'POST',
    headers: { Authorization: 'Bearer sk-test', 'Content-Type': 'application/json' },
    body: textBody,
  });
  assert.equal(response.status, 401);
  assert.deepEqual(calls.map(([url, method]) => [new URL(url).pathname, method]), [
    ['/models', 'GET'],
    ['/chat/completions', 'POST'],
  ]);
});

test('production AI calls never incur the extra /models probe', async () => {
  const calls = [];
  const host = {
    fetch: async (input, init) => {
      calls.push([String(input), init?.method || 'GET']);
      return new Response('{}', { status: 200 });
    },
  };
  installDeepSeekSelfTestProbe(host);
  await host.fetch(chatUrl, {
    method: 'POST',
    headers: { Authorization: 'Bearer sk-test', 'Content-Type': 'application/json' },
    body: productionBody,
  });
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0][0]).pathname, '/chat/completions');
});

test('transient /models failure falls through to existing Chat retry logic', async () => {
  const calls = [];
  const host = {
    fetch: async (input, init) => {
      const url = String(input);
      calls.push([url, init?.method || 'GET']);
      if (url.endsWith('/models')) return new Response('busy', { status: 503 });
      return new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }), { status: 200 });
    },
  };
  installDeepSeekSelfTestProbe(host);
  const response = await host.fetch(chatUrl, {
    method: 'POST',
    headers: { Authorization: 'Bearer sk-test', 'Content-Type': 'application/json' },
    body: textBody,
  });
  assert.equal(response.status, 200);
  assert.equal(calls.length, 2);
});
