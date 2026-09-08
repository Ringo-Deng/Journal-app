import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseLease,
  looksLikeShiguangLauncher,
  stopPreviousLauncher,
  writeLauncherLease,
  clearLauncherLease,
} from '../local/launcher-instance.mjs';

test('recognizes only the Shiguang launcher command', () => {
  assert.equal(looksLikeShiguangLauncher('/usr/bin/node local/launch.mjs'), true);
  assert.equal(looksLikeShiguangLauncher('node C:\\Journal-app\\local\\launch.mjs'), true);
  assert.equal(looksLikeShiguangLauncher('node local/server.mjs'), false);
  assert.equal(looksLikeShiguangLauncher('node other/launch.mjs'), false);
});

test('stops the previous registered launcher but never kills a reused unrelated PID', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'shiguang-launcher-'));
  await writeLauncherLease(dir, '0.1.36', 32123);
  let alive = true;
  const kills = [];
  const stopped = await stopPreviousLauncher({
    configDir: dir,
    currentPid: 99999,
    inspectProcess: async (pid) => ({ alive, command: pid === 32123 ? '/usr/bin/node local/launch.mjs' : '' }),
    killProcess: (pid, signal) => { kills.push([pid, signal]); alive = false; },
    wait: async () => {},
  });
  assert.deepEqual(stopped, { stopped: true, reason: 'previous-launcher' });
  assert.deepEqual(kills, [[32123, 'SIGTERM']]);

  await writeLauncherLease(dir, '0.1.36', 44444);
  const unrelatedKills = [];
  const reused = await stopPreviousLauncher({
    configDir: dir,
    currentPid: 99999,
    inspectProcess: async () => ({ alive: true, command: '/usr/bin/python worker.py' }),
    killProcess: (...args) => unrelatedKills.push(args),
    wait: async () => {},
  });
  assert.deepEqual(reused, { stopped: false, reason: 'pid-reused' });
  assert.deepEqual(unrelatedKills, []);
});

test('lease lifecycle is pid-safe and malformed leases are ignored', async () => {
  assert.equal(parseLease('{bad'), null);
  const dir = await mkdtemp(join(tmpdir(), 'shiguang-lease-'));
  const file = await writeLauncherLease(dir, '0.1.37', 55555);
  const saved = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(saved.pid, 55555);
  assert.equal(saved.version, '0.1.37');
  assert.equal(await clearLauncherLease(dir, 99999), false);
  assert.equal(await clearLauncherLease(dir, 55555), true);
});

test('real process inspection and termination work on the current host', async () => {
  const { spawn } = await import('node:child_process');
  const { inspectLocalProcess } = await import('../local/launcher-instance.mjs');
  const dir = await mkdtemp(join(tmpdir(), 'shiguang-real-'));
  const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)', 'local/launch.mjs'], { stdio: 'ignore' });
  try {
    await new Promise(r => setTimeout(r, 80));
    const info = await inspectLocalProcess(child.pid);
    assert.equal(info.alive, true);
    assert.equal(looksLikeShiguangLauncher(info.command), true);
    await writeLauncherLease(dir, '0.1.36', child.pid);
    const result = await stopPreviousLauncher({ configDir: dir, currentPid: process.pid });
    assert.equal(result.stopped, true);
    await new Promise(r => setTimeout(r, 80));
    assert.equal((await inspectLocalProcess(child.pid)).alive, false);
  } finally {
    try { child.kill('SIGKILL'); } catch {}
  }
});

test('legacy launcher scan kills only launchers from the same project root', async () => {
  const { stopLegacyShiguangProcesses } = await import('../local/launcher-instance.mjs');
  const kills = [];
  const result = await stopLegacyShiguangProcesses({
    root: '/Users/ringo/Journal-app',
    currentPid: 10,
    hostPlatform: 'darwin',
    listProcesses: async () => [
      { pid: 10, command: 'node local/launch.mjs' },
      { pid: 20, command: 'node local/launch.mjs' },
      { pid: 30, command: 'node local/launch.mjs' },
      { pid: 40, command: 'node other/launch.mjs' },
      { pid: 50, command: 'node local/server.mjs' },
    ],
    processCwd: async (pid) => [20,50].includes(pid) ? '/Users/ringo/Journal-app' : pid === 30 ? '/Users/ringo/Other-app' : '',
    killProcess: (pid, signal) => kills.push([pid, signal]),
  });
  assert.deepEqual(result, [20, 50]);
  assert.deepEqual(kills, [[20, 'SIGTERM'], [50, 'SIGTERM']]);
});

test('real legacy scan terminates a same-root launcher without touching this process', async () => {
  const { spawn } = await import('node:child_process');
  const { stopLegacyShiguangProcesses, inspectLocalProcess } = await import('../local/launcher-instance.mjs');
  const root = await mkdtemp(join(tmpdir(), 'shiguang-root-'));
  const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)', 'local/launch.mjs'], { cwd: root, stdio: 'ignore' });
  try {
    await new Promise(r => setTimeout(r, 100));
    assert.equal((await inspectLocalProcess(child.pid)).alive, true);
    const stopped = await stopLegacyShiguangProcesses({ root, currentPid: process.pid });
    assert.ok(stopped.includes(child.pid));
    await new Promise(r => setTimeout(r, 100));
    assert.equal((await inspectLocalProcess(child.pid)).alive, false);
  } finally {
    try { child.kill('SIGKILL'); } catch {}
  }
});

test('legacy scan also terminates an orphaned same-root server process', async () => {
  const { spawn } = await import('node:child_process');
  const { stopLegacyShiguangProcesses, inspectLocalProcess } = await import('../local/launcher-instance.mjs');
  const root = await mkdtemp(join(tmpdir(), 'shiguang-server-root-'));
  const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)', 'local/server.mjs'], { cwd: root, stdio: 'ignore' });
  try {
    await new Promise(r => setTimeout(r, 100));
    assert.equal((await inspectLocalProcess(child.pid)).alive, true);
    const stopped = await stopLegacyShiguangProcesses({ root, currentPid: process.pid });
    assert.ok(stopped.includes(child.pid));
    await new Promise(r => setTimeout(r, 100));
    assert.equal((await inspectLocalProcess(child.pid)).alive, false);
  } finally {
    try { child.kill('SIGKILL'); } catch {}
  }
});
