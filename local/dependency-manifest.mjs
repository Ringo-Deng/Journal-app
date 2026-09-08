import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export function dependencyMismatches(packageJson, packageLock) {
  const lockedRoot = packageLock?.packages?.[''] || {};
  const mismatches = [];
  for (const section of ['dependencies', 'devDependencies']) {
    const declared = packageJson?.[section] || {};
    const locked = lockedRoot?.[section] || {};
    const names = new Set([...Object.keys(declared), ...Object.keys(locked)]);
    for (const name of [...names].sort()) {
      if (declared[name] !== locked[name]) {
        mismatches.push({
          section,
          name,
          packageVersion: declared[name] ?? null,
          lockVersion: locked[name] ?? null,
        });
      }
    }
  }
  return mismatches;
}

export function formatDependencyMismatch(item) {
  return `${item.name}: package.json=${item.packageVersion ?? '缺失'}，package-lock.json=${item.lockVersion ?? '缺失'}`;
}

export async function assertDependencyManifest(root) {
  const [packageJson, packageLock] = await Promise.all([
    readFile(resolve(root, 'package.json'), 'utf8').then(JSON.parse),
    readFile(resolve(root, 'package-lock.json'), 'utf8').then(JSON.parse),
  ]);
  const mismatches = dependencyMismatches(packageJson, packageLock);
  if (mismatches.length) {
    const detail = mismatches.slice(0, 8).map(formatDependencyMismatch).join('；');
    throw Error(`依赖清单不一致，已停止启动以避免安装出错：${detail}`);
  }
  return true;
}
