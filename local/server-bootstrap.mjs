import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installDeepSeekCurlFallback } from './deepseek-curl-fallback.mjs';
import { installDeepSeekVisionRouter } from './deepseek-vision-router.mjs';
import { syncManagedDeepSeekKey } from './managed-ai-key.mjs';
import { prepareNativeImageTools } from './native-tools.mjs';
import { installRuntimeHealth } from './runtime-health.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const appVersion = String(packageJson.version || '').trim();
const configDir = process.env.JOURNAL_CONFIG_DIR || resolve(root, 'data');
const managedKey = await syncManagedDeepSeekKey({ configDir });
if (managedKey.managed && managedKey.changed)
  console.log('已载入本机持久化 DeepSeek AI 配置。');

// Keep one authoritative transport layer for all official DeepSeek requests.
// The curl path has been verified on the target Mac for both /models and chat.
installDeepSeekCurlFallback();
// Image-bearing requests are routed automatically to DeepSeek's vision model;
// ordinary text requests keep using the user's selected Flash/Pro model.
installDeepSeekVisionRouter();
installRuntimeHealth({ version: appVersion });

const nativeTools = await prepareNativeImageTools({ root });
if (nativeTools.upgradedJobs) console.log('已恢复旧素材记录的自动拆图能力。');
if (process.platform === 'darwin' && process.arch === 'arm64' && !nativeTools.segment) {
  console.warn('本机自动拆图程序不可用；请重新下载完整版本。');
}
await import('./server.mjs');
