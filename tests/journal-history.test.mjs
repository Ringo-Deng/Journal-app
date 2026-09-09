import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rename, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { createJournalHistory } from '../local/journal-history.mjs';

const book = (id = 'book-a', spreads = ['spread-a']) => ({
  id, title: `笔记本 ${id}`, month: '2026-09', cover: 'linen-oat',
  spreads: spreads.map(id => ({ id, theme: 'herbarium', days: [], elements: [] })),
});
const validate = state => {
  assert.ok(Array.isArray(state.books));
  for (const item of state.books) assert.ok(Array.isArray(item.spreads));
};
const atomicAt = async (directory, file, value) => {
  const temp = join(directory, `${file}.${randomUUID()}.tmp`);
  await writeFile(temp, JSON.stringify(value), { mode: 0o600 });
  await rename(temp, join(directory, file));
};
async function fixture(t, options = {}) {
  const data = await mkdtemp(join(tmpdir(), 'journal-history-test-'));
  t.after(() => rm(data, { recursive: true, force: true }));
  let date = new Date('2026-09-09T04:00:00Z');
  const create = extra => createJournalHistory({ data, atomicAt, validate, now: () => date, ...options, ...extra });
  return { data, create, history: create(), nextDay: () => { date = new Date(date.getTime() + 86400000); } };
}

test('daily snapshots preserve the preceding state without copying every autosave', async t => {
  const { history, nextDay } = await fixture(t);
  await history.captureBeforeSave({ revision: 0, books: [] }, { revision: 0, books: [book()] });
  assert.equal((await history.list()).entries.length, 0);
  const before = { revision: 1, books: [book()] };
  const edited = { revision: 2, books: [{ ...book(), title: '新的标题' }] };
  await history.captureBeforeSave(before, edited);
  await history.captureBeforeSave(edited, { ...edited, revision: 3 });
  const first = (await history.list()).entries;
  assert.equal(first.length, 1);
  assert.equal(first[0].reason, 'daily');
  assert.deepEqual((await history.read(first[0].id)).books, before.books);
  nextDay();
  await history.captureBeforeSave(edited, { ...edited, revision: 3 });
  assert.equal((await history.list()).entries.length, 2);
});

test('deleting books, spreads or a flyleaf protects their contents within the same day', async t => {
  const { history } = await fixture(t);
  const first = { revision: 1, books: [book('a', ['a1', 'a2']), book('b')] };
  await history.captureBeforeSave(first, first);
  const oneBook = { revision: 3, books: [book('a', ['a1', 'a2'])] };
  await history.captureBeforeSave({ ...first, revision: 2 }, oneBook);
  await history.captureBeforeSave(oneBook, { revision: 4, books: [book('a', ['a1'])] });
  const withLeaf = { revision: 5, books: [{ ...book('a'), flyleaf: { id: 'leaf', days: [], elements: [] } }] };
  await history.captureBeforeSave(withLeaf, { revision: 6, books: [book('a')] });
  assert.deepEqual((await history.list()).entries.map(item => item.reason), ['before-delete', 'before-delete', 'before-delete', 'daily']);
});

test('history remains bounded, survives restart and retains referenced original images', async t => {
  const { history, create, data, nextDay } = await fixture(t, { limit: 3 });
  const original = book();
  original.coverAsset = '/uploads/original.png';
  for (let revision = 1; revision <= 5; revision++) {
    await history.captureBeforeSave({ revision, books: [original] }, { books: [original] });
    nextDay();
  }
  const restarted = create();
  const list = (await restarted.list()).entries;
  assert.deepEqual(list.map(item => item.revision), [5, 4, 3]);
  assert.equal((await readdir(join(data, 'journal-history'))).filter(file => file.endsWith('.json')).length, 3);
  assert.equal((await restarted.read(list[0].id)).books[0].coverAsset, '/uploads/original.png');
  assert.equal((await stat(join(data, 'journal-history', `${list[0].id}.json`))).mode & 0o777, 0o600);
});

test('invalid IDs and symbolic links cannot read files outside the history directory', async t => {
  const { history, data } = await fixture(t);
  await assert.rejects(history.read('../journal.json'), error => error.status === 404);
  await assert.rejects(history.read('%2e%2e%2fjournal.json'), error => error.status === 404);
  const directory = join(data, 'journal-history');
  await mkdir(directory);
  const source = join(data, 'outside.json');
  await writeFile(source, '{"private":true}');
  const id = `${Date.now()}-${randomUUID()}`;
  await symlink(source, join(directory, `${id}.json`));
  await assert.rejects(history.read(id), error => error.status === 404);
  assert.deepEqual((await history.list()).entries, []);
});

test('a damaged snapshot is retained and disclosed without hiding healthy snapshots', async t => {
  const { history, create, data } = await fixture(t);
  await history.captureBeforeSave({ revision: 1, books: [book()] }, { books: [book()] });
  const id = `${Date.now()}-${randomUUID()}`;
  const badFile = join(data, 'journal-history', `${id}.json`);
  await writeFile(badFile, '{damaged');
  const restarted = create();
  const result = await restarted.list();
  assert.equal(result.entries.length, 1);
  assert.match(result.warning, /部分历史备份无法读取/);
  assert.equal(await readFile(badFile, 'utf8'), '{damaged');
  await assert.rejects(restarted.read(id), /无法读取/);
});

test('failed snapshot writes leave previous backups intact and can be retried', async t => {
  let fail = false;
  const { history } = await fixture(t, { atomicAt: (...args) => fail ? Promise.reject(Error('disk full')) : atomicAt(...args) });
  const first = { revision: 1, books: [book('a'), book('b')] };
  await history.captureBeforeSave(first, first);
  fail = true;
  await assert.rejects(history.captureBeforeSave({ ...first, revision: 2 }, { books: [book('a')] }), /disk full/);
  assert.equal((await history.list()).entries.length, 1);
  fail = false;
  await history.captureBeforeSave({ ...first, revision: 2 }, { books: [book('a')] });
  assert.equal((await history.list()).entries.length, 2);
});

test('server exposes snapshots read-only, keeps revision protection and discloses snapshot failure', async t => {
  const { data } = await fixture(t);
  const listener = createServer();
  await new Promise((resolve, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', resolve); });
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const child = spawn(process.execPath, ['local/server.mjs'], {
    env: { ...process.env, JOURNAL_DATA_DIR: data, JOURNAL_CONFIG_DIR: data, JOURNAL_PORT: String(port), JOURNAL_WEB_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => {
    if (child.exitCode !== null) return;
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill(); await exited;
  });
  await new Promise((resolve, reject) => {
    child.stdout.once('data', resolve); child.once('error', reject);
    child.once('exit', code => reject(Error(`test server exited: ${code}`)));
  });
  const call = async (path, state) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, state ? { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(state) } : undefined);
    return { status: response.status, body: await response.json() };
  };
  assert.equal((await call('/api/state', { revision: 0, books: [book()] })).status, 200);
  assert.equal((await call('/api/state', { revision: 1, books: [{ ...book(), title: '第二版' }] })).status, 200);
  const entries = (await call('/api/history')).body.entries;
  assert.equal(entries.length, 1);
  assert.equal((await call(`/api/history/${entries[0].id}`)).body.books[0].title, '笔记本 book-a');
  assert.equal((await call('/api/history/%2e%2e%2fjournal.json')).status, 404);
  assert.equal((await call('/api/state', { revision: 0, books: [] })).status, 409);
  assert.equal((await call('/api/history')).body.entries.length, 1);
  assert.equal(JSON.parse(await readFile(join(data, 'journal.previous.json'), 'utf8')).books[0].title, '笔记本 book-a');
  // A blocked history directory must not block the authoritative save or report a full success.
  await rename(join(data, 'journal-history'), join(data, 'saved-history'));
  await writeFile(join(data, 'journal-history'), 'blocked');
  const failedHistory = await call('/api/state', { revision: 2, books: [] });
  assert.equal(failedHistory.status, 200);
  assert.equal(failedHistory.body.revision, 3);
  assert.match(failedHistory.body.historyWarning, /历史备份未能完成/);
  assert.deepEqual((await call('/api/state')).body.books, []);
  assert.equal((await readdir(join(data, 'saved-history'))).length, 1);
});
