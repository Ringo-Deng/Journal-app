import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const MANAGED_KEY_FILENAME = 'deepseek-api-key.txt';

function normalizeManagedKey(value) {
  let key = String(value || '').trim();
  key = key.replace(/^`+|`+$/g, '').trim();
  key = key.replace(/^(?:export\s+)?DEEPSEEK_API_KEY\s*=\s*/i, '').trim();
  const quoted =
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"));
  if (quoted && key.length >= 2) key = key.slice(1, -1).trim();
  key = key.replace(/^Bearer\s+/i, '').trim();
  return key.replace(/[\s\u200B-\u200D\uFEFF]+/g, '');
}

export async function readManagedDeepSeekKey({ configDir, env = process.env } = {}) {
  const fromEnv = normalizeManagedKey(
    env.DEEPSEEK_API_KEY || env.SHIGUANG_DEEPSEEK_API_KEY || '',
  );
  if (fromEnv) return { key: fromEnv, source: 'environment' };
  if (!configDir) return { key: '', source: '' };
  try {
    const fromFile = normalizeManagedKey(
      await readFile(resolve(configDir, MANAGED_KEY_FILENAME), 'utf8'),
    );
    return fromFile
      ? { key: fromFile, source: MANAGED_KEY_FILENAME }
      : { key: '', source: '' };
  } catch (error) {
    if (error?.code === 'ENOENT') return { key: '', source: '' };
    throw error;
  }
}

async function writeJsonAtomic(file, value) {
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
  await rename(temp, file);
}

export async function syncManagedDeepSeekKey({ configDir, env = process.env } = {}) {
  const managed = await readManagedDeepSeekKey({ configDir, env });
  if (!managed.key || !configDir)
    return { managed: false, changed: false, source: managed.source || '' };

  await mkdir(configDir, { recursive: true, mode: 0o700 });
  const settingsPath = resolve(configDir, 'settings.json');
  let current = {};
  try {
    current = JSON.parse(await readFile(settingsPath, 'utf8'));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const next = {
    baseUrl: current.baseUrl || 'https://api.deepseek.com',
    model: current.model || 'deepseek-v4-flash-vision-exp',
    vision: typeof current.vision === 'boolean' ? current.vision : true,
    ...current,
    apiKey: managed.key,
  };
  const changed = current.apiKey !== managed.key;
  if (changed) await writeJsonAtomic(settingsPath, next);

  return { managed: true, changed, source: managed.source };
}
