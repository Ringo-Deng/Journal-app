import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeBaseUrl,
  normalizeApiKey,
  configIssue,
  providerError,
  migrateLegacyConfig,
  prepareDeepSeekPayload,
} from '../local/ai-config.mjs';

test('DeepSeek console URL and full endpoints normalize to API base', () => {
  assert.equal(
    normalizeBaseUrl('https://platform.deepseek.com/api_keys'),
    'https://api.deepseek.com',
  );
  assert.equal(
    normalizeBaseUrl('https://api.deepseek.com/chat/completions'),
    'https://api.deepseek.com',
  );
  assert.equal(
    normalizeBaseUrl('https://example.com/v1/chat/completions'),
    'https://example.com/v1',
  );
  assert.throws(() => normalizeBaseUrl('https://x.test/v1?key=secret'));
});

test('API keys copied with common wrappers are normalized safely', () => {
  assert.equal(normalizeApiKey('  Bearer sk-demo-key  '), 'sk-demo-key');
  assert.equal(normalizeApiKey('"sk-demo-key"'), 'sk-demo-key');
  assert.equal(normalizeApiKey("'sk-demo-key'"), 'sk-demo-key');
  assert.equal(normalizeApiKey('sk-demo-key'), 'sk-demo-key');
  assert.equal(normalizeApiKey('DEEPSEEK_API_KEY=sk-demo-key'), 'sk-demo-key');
  assert.equal(normalizeApiKey('export DEEPSEEK_API_KEY="sk-demo-key"'), 'sk-demo-key');
  assert.equal(normalizeApiKey('`sk-demo-key`'), 'sk-demo-key');
  assert.equal(normalizeApiKey('sk-demo-\u200bkey\n'), 'sk-demo-key');
});

test('model names and URLs cannot silently be saved as credentials', () => {
  assert.match(
    configIssue({
      model: 'deepseek-v4-pro',
      apiKey: 'deepseek-v4-flash-vision-exp',
    }),
    /模型名称/,
  );
  assert.match(
    configIssue({
      model: 'deepseek-v4-pro',
      apiKey: 'deepseek-chat',
    }),
    /模型名称/,
  );
  assert.match(
    configIssue({
      model: 'deepseek-v4-pro',
      apiKey: 'https://api.deepseek.com',
    }),
    /网址/,
  );
  assert.equal(configIssue({ model: 'model', apiKey: 'sk-test-key' }), '');
  assert.match(providerError(401), /401/);
  assert.match(providerError(401), /API Key/);
  assert.match(providerError(401), /本机已保存的密钥/);
  assert.match(providerError(402), /余额不足/);
});

test('legacy DeepSeek config migrates model names and pasted key wrappers', () => {
  const migrated = migrateLegacyConfig({
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    apiKey: 'Bearer sk-demo-key',
    vision: false,
  });
  assert.equal(migrated.config.model, 'deepseek-v4-flash');
  assert.equal(migrated.config.apiKey, 'sk-demo-key');
  assert.equal(migrated.changed, true);

  const current = migrateLegacyConfig({
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-v4-pro',
    apiKey: 'sk-demo-key',
    vision: false,
  });
  assert.equal(current.config.model, 'deepseek-v4-pro');
  assert.equal(current.config.apiKey, 'sk-demo-key');
  assert.equal(current.changed, false);
});

test('DeepSeek health checks use the same non-thinking JSON-safe request shape as production', () => {
  const text = prepareDeepSeekPayload({
    model: 'deepseek-v4-flash-vision-exp',
    messages: [{ role: 'user', content: 'Reply with OK only.' }],
    max_tokens: 96,
  });
  assert.deepEqual(text.thinking, { type: 'disabled' });
  assert.equal(text.max_tokens, 256);
  assert.equal(text.response_format, undefined);

  const json = prepareDeepSeekPayload({
    model: 'deepseek-v4-flash-vision-exp',
    messages: [{ role: 'user', content: 'Return only this JSON object: {"ok":true}' }],
    max_tokens: 96,
  });
  assert.deepEqual(json.thinking, { type: 'disabled' });
  assert.equal(json.max_tokens, 256);
  assert.deepEqual(json.response_format, { type: 'json_object' });
});
