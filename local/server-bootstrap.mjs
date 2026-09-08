import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareNativeImageTools } from './native-tools.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nativeTools = await prepareNativeImageTools({ root });
if (nativeTools.upgradedJobs) console.log('已恢复旧素材记录的自动拆图能力。');
if (process.platform === 'darwin' && process.arch === 'arm64' && !nativeTools.segment) {
  console.warn('本机自动拆图程序不可用；请重新下载完整版本。');
}
await import('./server.mjs');
