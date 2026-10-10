import { readFile, writeFile, mkdir, lstat, link, unlink } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

// Only a missing journal can receive the bundled example. An empty library is
// an intentional saved state, and unreadable/corrupt files must never be replaced.
export async function initializeExampleNotebook({ data, publicDir, validate }) {
  for (const name of ['journal.json', 'journal.previous.json']) {
    try { await lstat(resolve(data, name)); return false; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const book = JSON.parse(await readFile(resolve(publicDir, 'examples/starry-collage/book.json'), 'utf8'));
  const state = { revision: 0, books: [book] };
  const refs = [book.paperBg, ...[...book.spreads, ...(book.flyleaf ? [book.flyleaf] : [])].flatMap(spread => [
    spread.paperBg, spread.pages?.left?.paperBg, spread.pages?.right?.paperBg,
    ...spread.elements.filter(piece => piece.src),
  ])].filter(Boolean);
  await mkdir(resolve(data, 'uploads'), { recursive: true, mode: 0o700 });
  for (const ref of refs) {
    if (!/^\/examples\/starry-collage\/[a-z-]+\.(png|jpg)$/.test(ref.src)) throw Error('Invalid example asset');
    const bytes = await readFile(resolve(publicDir, ref.src.slice(1)));
    const name = createHash('sha256').update(bytes).digest('hex') + extname(ref.src);
    const target = resolve(data, 'uploads', name);
    try { await writeFile(target, bytes, { flag: 'wx', mode: 0o600 }); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (!(await readFile(target)).equals(bytes)) throw Error('Example image conflicts with an existing file');
    }
    ref.src = `/uploads/${name}`;
  }
  validate(state);
  const temporary = resolve(data, `example-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, JSON.stringify(state, null, 2), { flag: 'wx', mode: 0o600 });
    // Atomic publication without replacing a journal created concurrently.
    try { await link(temporary, resolve(data, 'journal.json')); }
    catch (error) { if (error.code === 'EEXIST') return false; throw error; }
    return true;
  } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}
