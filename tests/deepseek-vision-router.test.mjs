import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEEPSEEK_VISION_MODEL,
  installDeepSeekVisionRouter,
  payloadHasImage,
  routeDeepSeekVisionPayload,
} from '../local/deepseek-vision-router.mjs';

const url = 'https://api.deepseek.com/chat/completions';

const imagePayload = {
  model: 'deepseek-v4-flash',
  messages: [
    { role: 'system', content: 'Return JSON.' },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'classify this' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,AA==' } },
      ],
    },
  ],
};

test('detects image-bearing chat payloads', () => {
  assert.equal(payloadHasImage(imagePayload), true);
  assert.equal(payloadHasImage({ messages: [{ role: 'user', content: 'hello' }] }), false);
});

test('text-selected model is automatically routed to DeepSeek vision for image input', () => {
  const init = {
    method: 'POST',
    headers: { Authorization: 'Bearer sk-test', 'Content-Type': 'application/json' },
    body: JSON.stringify(imagePayload),
  };
  const routed = routeDeepSeekVisionPayload(url, init);
  const payload = JSON.parse(routed.body);
  assert.equal(payload.model, DEEPSEEK_VISION_MODEL);
  assert.equal(payload.messages[1].content[1].type, 'image_url');
});

test('ordinary text requests keep the selected Flash/Pro model', () => {
  const init = {
    method: 'POST',
    body: JSON.stringify({
      model: 'deepseek-v4-pro',
      messages: [{ role: 'user', content: 'hello' }],
    }),
  };
  assert.equal(routeDeepSeekVisionPayload(url, init), init);
});

test('already-vision requests are left unchanged', () => {
  const init = {
    method: 'POST',
    body: JSON.stringify({ ...imagePayload, model: DEEPSEEK_VISION_MODEL }),
  };
  assert.equal(routeDeepSeekVisionPayload(url, init), init);
});

test('installed router rewrites before the underlying transport is called', async () => {
  let received;
  const host = {
    fetch: async (_input, init) => {
      received = JSON.parse(init.body);
      return new Response('{}', { status: 200 });
    },
  };
  installDeepSeekVisionRouter(host);
  await host.fetch(url, { method: 'POST', body: JSON.stringify(imagePayload) });
  assert.equal(received.model, DEEPSEEK_VISION_MODEL);
});
