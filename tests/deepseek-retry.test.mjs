import test from 'node:test';
import assert from 'node:assert/strict';

test('DeepSeek compatibility retries empty JSON and transient provider failures once', async () => {
  const originalFetch = globalThis.fetch;
  let mode = 'empty-json';
  let calls = 0;
  const seenPayloads = [];

  globalThis.fetch = async (_input, init) => {
    calls += 1;
    const payload = JSON.parse(init.body);
    seenPayloads.push(payload);

    if (mode === 'empty-json' && calls === 1) {
      return new Response(
        JSON.stringify({ choices: [{ message: { content: '' } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (mode === 'transient' && calls === 1) {
      return new Response('temporarily unavailable', { status: 503 });
    }
    return new Response(
      JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };

  try {
    await import(`../local/ai-config.mjs?deepseek-retry-test=${Date.now()}`);
    const wrappedFetch = globalThis.fetch;
    const request = () =>
      wrappedFetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'deepseek-v4-flash-vision-exp',
          messages: [
            { role: 'user', content: 'Return only this JSON object: {"ok":true}' },
          ],
          max_tokens: 96,
        }),
      });

    const emptyRecovered = await request();
    assert.equal(emptyRecovered.status, 200);
    assert.equal(calls, 2);
    assert.deepEqual(seenPayloads[0].thinking, { type: 'disabled' });
    assert.equal(seenPayloads[0].max_tokens, 256);
    assert.deepEqual(seenPayloads[0].response_format, { type: 'json_object' });

    mode = 'transient';
    calls = 0;
    seenPayloads.length = 0;
    const transientRecovered = await request();
    assert.equal(transientRecovered.status, 200);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
