import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installDeepSeekSelfTestProbe } from './deepseek-selftest.mjs';
import { installDeepSeekCurlFallback } from './deepseek-curl-fallback.mjs';
import { prepareNativeImageTools } from './native-tools.mjs';
import { installRuntimeHealth } from './runtime-health.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const appVersion = String(packageJson.version || '').trim();
installDeepSeekSelfTestProbe();
installDeepSeekCurlFallback();
installRuntimeHealth({ version: appVersion });

const nativeTools = await prepareNativeImageTools({ root });
if (nativeTools.upgradedJobs) console.log('已恢复旧素材记录的自动拆图能力。');
if (process.platform === 'darwin' && process.arch === 'arm64' && !nativeTools.segment) {
  console.warn('本机自动拆图程序不可用；请重新下载完整版本。');
}
await import('./server.mjs');
