import { access, chmod, readFile, rename, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { platform } from 'node:os';
import { resolve } from 'node:path';

const NATIVE_IMAGE_TOOLS = ['segment', 'cutout', 'material-palette', 'clean-paper'];

export function upgradeManualMaterialJobs(value) {
  if (!Array.isArray(value)) return { jobs: value, changed: false };
  let changed = false;
  const jobs = value.map((job) => {
    if (!job || typeof job !== 'object' || job.manualOnly !== true) return job;
    changed = true;
    const pinterest = job.sourceMeta?.type === 'pinterest' || String(job.engine || '').startsWith('Pinterest');
    return {
      ...job,
      manualOnly: false,
      mode: 'auto',
      engine: pinterest ? 'Pinterest 原图 · 可自动分离' : '原图 · 可自动分离',
    };
  });
  return { jobs, changed };
}

async function makeExecutable(path) {
  try {
    await access(path, fsConstants.F_OK);
    try {
      await access(path, fsConstants.X_OK);
    } catch {
      await chmod(path, 0o755);
      await access(path, fsConstants.X_OK);
    }
    return true;
  } catch {
    return false;
  }
}

async function upgradeSavedJobs(dataDir) {
  const path = resolve(dataDir, 'material-jobs.json');
  try {
    const raw = JSON.parse(await readFile(path, 'utf8'));
    const upgraded = upgradeManualMaterialJobs(raw);
    if (!upgraded.changed) return false;
    const temp = `${path}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(upgraded.jobs, null, 2), { mode: 0o600 });
    await rename(temp, path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

export async function prepareNativeImageTools({ root, dataDir = process.env.JOURNAL_DATA_DIR || resolve(root, 'data') }) {
  const capabilities = Object.fromEntries(NATIVE_IMAGE_TOOLS.map((name) => [name, false]));
  if (platform() !== 'darwin' || process.arch !== 'arm64') return { ...capabilities, upgradedJobs: false };

  for (const name of NATIVE_IMAGE_TOOLS) {
    capabilities[name] = await makeExecutable(resolve(root, 'local', name));
  }
  const upgradedJobs = capabilities.segment ? await upgradeSavedJobs(dataDir) : false;
  return { ...capabilities, upgradedJobs };
}
