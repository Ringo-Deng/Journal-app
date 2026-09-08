import { readFile, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { platform } from 'node:os';

const run = promisify(execFile);
const LEASE_FILE = '.shiguang-launcher.json';

export async function inspectLocalProcess(pid, hostPlatform = platform()) {
  if (!Number.isInteger(Number(pid)) || Number(pid) <= 1)
    return { alive: false, command: '' };
  try {
    if (hostPlatform === 'win32') {
      const script = `$p=Get-CimInstance Win32_Process -Filter \"ProcessId=${Number(pid)}\"; if ($p) { $p.CommandLine }`;
      const { stdout } = await run('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        script,
      ], { timeout: 2000, windowsHide: true });
      const command = String(stdout || '').trim();
      return { alive: !!command, command };
    }
    const { stdout } = await run('ps', ['-p', String(Number(pid)), '-o', 'command='], { timeout: 2000 });
    const command = String(stdout || '').trim();
    return { alive: !!command, command };
  } catch {
    return { alive: false, command: '' };
  }
}

export async function inspectProcessCwd(pid, hostPlatform = platform()) {
  try {
    if (hostPlatform === 'linux') {
      const { stdout } = await run('readlink', [`/proc/${Number(pid)}/cwd`], { timeout: 2000 });
      return String(stdout || '').trim();
    }
    if (hostPlatform === 'darwin') {
      const { stdout } = await run('lsof', ['-a', '-p', String(Number(pid)), '-d', 'cwd', '-Fn'], { timeout: 2000 });
      return String(stdout || '').split(/\r?\n/).find((line) => line.startsWith('n'))?.slice(1).trim() || '';
    }
  } catch {}
  return '';
}

export async function listShiguangProcesses(hostPlatform = platform()) {
  try {
    if (hostPlatform === 'win32') {
      const script = "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'local[\\\\/](launch|dev|server|server-bootstrap)\\.mjs' } | ForEach-Object { \"$($_.ProcessId)`t$($_.CommandLine)\" }";
      const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 3000, windowsHide: true });
      return String(stdout || '').split(/\r?\n/).map((line) => {
        const [pid, ...rest] = line.split('\t');
        return { pid: Number(pid), command: rest.join('\t').trim() };
      }).filter((item) => Number.isInteger(item.pid) && looksLikeShiguangProcess(item.command));
    }
    const { stdout } = await run('ps', ['-ax', '-o', 'pid=', '-o', 'command='], { timeout: 3000 });
    return String(stdout || '').split(/\r?\n/).map((line) => {
      const match = line.match(/^\s*(\d+)\s+(.+)$/);
      return match ? { pid: Number(match[1]), command: match[2] } : null;
    }).filter((item) => item && looksLikeShiguangProcess(item.command));
  } catch {
    return [];
  }
}

export async function stopLegacyShiguangProcesses({
  root,
  currentPid = process.pid,
  hostPlatform = platform(),
  listProcesses = listShiguangProcesses,
  processCwd = inspectProcessCwd,
  killProcess = process.kill,
}) {
  const normalizedRoot = resolve(root);
  const stopped = [];
  for (const item of await listProcesses(hostPlatform)) {
    if (!item || item.pid === currentPid || !looksLikeShiguangProcess(item.command)) continue;
    let sameProject = false;
    const cwd = await processCwd(item.pid, hostPlatform);
    if (cwd) sameProject = resolve(cwd) === normalizedRoot;
    else {
      const command = String(item.command || '').replaceAll('\\', '/').toLowerCase();
      sameProject = command.includes(normalizedRoot.replaceAll('\\', '/').toLowerCase());
    }
    if (!sameProject) continue;
    try {
      killProcess(item.pid, 'SIGTERM');
      stopped.push(item.pid);
    } catch (error) {
      if (error?.code !== 'ESRCH') throw error;
    }
  }
  return stopped;
}

export function parseLease(text) {
  try {
    const value = JSON.parse(String(text || ''));
    const pid = Number(value?.pid);
    if (!Number.isInteger(pid) || pid <= 1) return null;
    return {
      pid,
      version: String(value?.version || ''),
      startedAt: String(value?.startedAt || ''),
    };
  } catch {
    return null;
  }
}

export function looksLikeShiguangProcess(command) {
  const value = String(command || '').replaceAll('\\', '/').toLowerCase();
  return /(?:^|\s|\/)local\/(?:launch|dev|server|server-bootstrap)\.mjs(?:\s|$)/.test(value);
}

export function looksLikeShiguangLauncher(command) {
  const value = String(command || '').replaceAll('\\', '/').toLowerCase();
  return /(?:^|\s|\/)local\/launch\.mjs(?:\s|$)/.test(value);
}

export async function stopPreviousLauncher({
  configDir,
  currentPid = process.pid,
  inspectProcess = inspectLocalProcess,
  killProcess = process.kill,
  wait = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms)),
}) {
  const file = resolve(configDir, LEASE_FILE);
  let lease;
  try {
    lease = parseLease(await readFile(file, 'utf8'));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    return { stopped: false, reason: 'none' };
  }
  if (!lease || lease.pid === currentPid)
    return { stopped: false, reason: lease ? 'current' : 'invalid' };

  let info;
  try {
    info = await inspectProcess(lease.pid);
  } catch {
    info = null;
  }
  if (!info?.alive) return { stopped: false, reason: 'stale' };
  if (!looksLikeShiguangLauncher(info.command))
    return { stopped: false, reason: 'pid-reused' };

  try {
    killProcess(lease.pid, 'SIGTERM');
  } catch (error) {
    if (error?.code === 'ESRCH') return { stopped: false, reason: 'stale' };
    throw error;
  }

  for (let i = 0; i < 20; i++) {
    await wait(100);
    try {
      const next = await inspectProcess(lease.pid);
      if (!next?.alive) return { stopped: true, reason: 'previous-launcher' };
    } catch {
      return { stopped: true, reason: 'previous-launcher' };
    }
  }
  return { stopped: true, reason: 'previous-launcher-signal-sent' };
}

export async function writeLauncherLease(configDir, version, pid = process.pid) {
  const file = resolve(configDir, LEASE_FILE);
  const payload = {
    pid,
    version: String(version || ''),
    startedAt: new Date().toISOString(),
  };
  await writeFile(file, JSON.stringify(payload, null, 2), { mode: 0o600 });
  return file;
}

export async function clearLauncherLease(configDir, pid = process.pid) {
  const file = resolve(configDir, LEASE_FILE);
  try {
    const lease = parseLease(await readFile(file, 'utf8'));
    if (lease?.pid !== pid) return false;
    await unlink(file);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}
