import { mkdir, readFile, readdir, lstat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const FORMAT = 'shiguang-history-v1';
const ID_PATTERN = /^\d{13}-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const failure = (message, status = 500) => Object.assign(new Error(message), { status });
const localDay = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const summary = ({ id, createdAt, day, reason, revision, books }) => ({
  id, createdAt, day, reason, revision,
  bookCount: books.length,
  spreadCount: books.reduce((count, book) => count + book.spreads.length, 0),
  titles: books.map(book => book.title),
});

function removesPages(current, next) {
  const byId = new Map(next.books.map(book => [book.id, book]));
  return current.books.some(book => {
    const after = byId.get(book.id);
    if (!after || after.spreads.length < book.spreads.length || (book.flyleaf && book.flyleaf.id !== after.flyleaf?.id)) return true;
    const retained = new Set(after.spreads.map(spread => spread.id));
    return book.spreads.some(spread => !retained.has(spread.id));
  });
}

/** Snapshots share the journal write queue. They contain references to local images, not another image store. */
export function createJournalHistory({ data, atomicAt, validate, limit = 30, now = () => new Date() }) {
  const directory = join(data, 'journal-history');
  let entries = [];
  let loading;
  let warning;

  async function read(id) {
    if (!ID_PATTERN.test(id)) throw failure('历史备份不存在。', 404);
    const path = join(directory, `${id}.json`);
    let snapshot;
    try {
      // Do not follow a file link outside the history directory.
      if (!(await lstat(path)).isFile()) throw failure('历史备份不存在。', 404);
      snapshot = JSON.parse(await readFile(path, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT' || error.status === 404) throw failure('历史备份不存在，请重新加载列表。', 404);
      throw failure('这份历史备份无法读取，请选择其他时间的备份。');
    }
    if (snapshot?.format !== FORMAT || snapshot.id !== id || !Array.isArray(snapshot.books) ||
        !Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(snapshot.day) ||
        !['daily', 'before-delete'].includes(snapshot.reason) || !Number.isFinite(Date.parse(snapshot.createdAt))) {
      throw failure('这份历史备份格式不正确，请选择其他时间的备份。');
    }
    try { validate(snapshot); } catch { throw failure('这份历史备份中的手帐数据不完整，请选择其他备份。'); }
    return snapshot;
  }

  async function load() {
    if (!loading) loading = (async () => {
      let files;
      try { files = await readdir(directory, { withFileTypes: true }); }
      catch (error) { if (error.code === 'ENOENT') return; throw error; }
      const found = [];
      for (const file of files) {
        const id = file.name.replace(/\.json$/, '');
        if (!file.isFile() || !file.name.endsWith('.json') || !ID_PATTERN.test(id)) continue;
        try { found.push(summary(await read(id))); }
        catch { warning = '部分历史备份无法读取，已保留原文件；其余备份仍可使用。'; }
      }
      entries = found.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.revision - a.revision);
    })().catch(error => { loading = undefined; throw error; });
    await loading;
  }

  async function prune() {
    while (entries.length > limit) {
      const oldest = entries.at(-1);
      try { await unlink(join(directory, `${oldest.id}.json`)); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      entries.pop();
    }
  }

  return {
    async list() {
      try { await load(); }
      catch { throw failure('历史备份列表读取失败，请检查本机数据目录后重试。'); }
      return { entries: entries.map(entry => ({ ...entry, titles: [...entry.titles] })), ...(warning ? { warning } : {}) };
    },
    read,
    async captureBeforeSave(current, next) {
      if (!current.books.length) return;
      await load();
      const date = now();
      const day = localDay(date);
      const deleting = removesPages(current, next);
      if ((!deleting && entries.some(entry => entry.day === day)) || entries.some(entry => entry.revision === current.revision)) {
        await prune();
        return;
      }
      const id = `${String(date.getTime()).padStart(13, '0')}-${randomUUID()}`;
      const snapshot = { format: FORMAT, id, createdAt: date.toISOString(), day,
        reason: deleting ? 'before-delete' : 'daily', revision: current.revision, books: current.books };
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await atomicAt(directory, `${id}.json`, snapshot);
      entries.unshift(summary(snapshot));
      // Only prune after the new snapshot is durable. A failure leaves older backups available.
      await prune();
    },
  };
}
