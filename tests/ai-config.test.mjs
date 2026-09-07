import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeBaseUrl,
  configIssue,
  providerError,
  migrateLegacyConfig,
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
test('model names cannot silently be saved as credentials', () => {
  assert.match(
    configIssue({
      model: 'deepseek-v4-flash-vision-exp',
      apiKey: 'deepseek-v4-flash-vision-exp',
    }),
    /模型名称/,
  );
  assert.equal(configIssue({ model: 'model', apiKey: 'test-key' }), '');
  assert.match(providerError(401), /认证失败/);
  assert.match(providerError(402), /余额不足/);
});

test('legacy DeepSeek model names migrate to the current default', () => {
  const migrated=migrateLegacyConfig({baseUrl:'https://api.deepseek.com',model:'deepseek-chat',apiKey:'k',vision:false});
  assert.equal(migrated.config.model,'deepseek-v4-flash');
  assert.equal(migrated.changed,true);
  const current=migrateLegacyConfig({baseUrl:'https://api.deepseek.com',model:'deepseek-v4-pro',apiKey:'k',vision:false});
  assert.equal(current.config.model,'deepseek-v4-pro');
});
