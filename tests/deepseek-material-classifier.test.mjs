import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMaterialFallbackInit,
  installMaterialClassifierFallback,
  isMaterialClassificationRequest,
} from '../local/deepseek-material-classifier.mjs';

const url = 'https://api.deepseek.com/chat/completions';
function init() {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'deepseek-v4-flash',
      messages: [
        { role: 'system', content: '你是手帐素材整理员。返回JSON。' },
        {
          role: 'user',
          content: [
            { type: 'text', text: JSON.stringify({ visual: true, items: [{ id: 'a' }] }) },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
          ],
        },
      ],
      max_tokens: 18000,
    }),
  };
}
function completion(content, status = 200) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('detects only material classifier chat calls', () => {
  assert.equal(isMaterialClassificationRequest(url, init()), true);
  const other = init();
  other.body = JSON.stringify({ model: 'x', messages: [{ role: 'system', content: '普通请求' }] });
  assert.equal(isMaterialClassificationRequest(url, other), false);
});

test('fallback strips images and marks visual false', () => {
  const next = JSON.parse(buildMaterialFallbackInit(init()).body);
  assert.equal(next.messages[1].content.includes('image_url'), false);
  assert.equal(next.messages[1].content.includes('"visual":false'), true);
  assert.equal(next.messages[1].content.includes('confident 必须为 false'), true);
  assert.equal(next.max_tokens, 6000);
});

test('keeps successful valid primary response', async () => {
  let calls = 0;
  const host = { fetch: async () => { calls++; return completion('{"items":[{"id":"a"}]}'); } };
  installMaterialClassifierFallback(host);
  const response = await host.fetch(url, init());
  assert.equal(response.status, 200);
  assert.equal(calls, 1);
  assert.equal(response.headers.get('x-shiguang-material-classifier'), null);
});

test('HTTP image failure falls back to metadata request', async () => {
  const bodies = [];
  const host = {
    fetch: async (_url, requestInit) => {
      bodies.push(JSON.parse(requestInit.body));
      return bodies.length === 1
        ? completion('{"error":"vision"}', 400)
        : completion('{"items":[{"id":"a"}]}');
    },
  };
  installMaterialClassifierFallback(host);
  const response = await host.fetch(url, init());
  assert.equal(response.status, 200);
  assert.equal(bodies.length, 2);
  assert.equal(Array.isArray(bodies[1].messages[1].content), false);
  assert.equal(response.headers.get('x-shiguang-material-classifier'), 'metadata-fallback');
});

test('invalid 200 completion also falls back instead of failing the batch', async () => {
  let calls = 0;
  const host = {
    fetch: async () => {
      calls++;
      return calls === 1
        ? completion('not json')
        : completion('{"items":[{"id":"a"}]}');
    },
  };
  installMaterialClassifierFallback(host);
  const response = await host.fetch(url, init());
  assert.equal(response.status, 200);
  assert.equal(calls, 2);
});
