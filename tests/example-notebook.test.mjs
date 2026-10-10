import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { initializeExampleNotebook } from '../local/example-notebook.mjs';
import { notebookUploads } from '../lib/journal-backup.ts';
import { distributableSource, distributableWindowsSource } from '../desktop/package-policy.mjs';
const publicDir = resolve('public');
async function fixture(t) {
  const data = await mkdtemp(resolve(tmpdir(), 'journal-example-test-'));
  t.after(() => rm(data, { recursive: true, force: true }));
  return { data, publicDir, validate: s => assert.equal(s.books.length, 1) };
}
test('desktop example preserves layers, contains no private records, and all images enter backups', async t => {
  const options = await fixture(t);
  assert.equal(await initializeExampleNotebook(options), true);
  const state = JSON.parse(await readFile(resolve(options.data, 'journal.json'), 'utf8'));
  const book = state.books[0];
  assert.equal(book.title, '拾光拼贴 · 示例');
  assert.deepEqual(book.spreads.map(s => s.elements.length), [8, 17]);
  const source = JSON.parse(await readFile(resolve(publicDir, 'examples/starry-collage/book.json')));
  for (const [page, spread] of book.spreads.entries()) {
    assert.deepEqual(spread.days, []);
    assert.ok(spread.elements.every(e => ['asset','doodle'].includes(e.kind) && !e.photoOriginal && !e.text && !e.assetId));
    for (let i=0;i<spread.elements.length;i++) {
      for (const key of ['x','y','w','h','rotation','stackOrder']) assert.equal(spread.elements[i][key], source.spreads[page].elements[i][key]);
    }
  }
  const images = notebookUploads(state.books);
  assert.equal(images.length, 26);
  assert.doesNotMatch(JSON.stringify(book), /\/examples\//);
  for (const image of images) assert.ok((await readFile(resolve(options.data, image.slice(1)))).length > 0);
  const before = await readFile(resolve(options.data, 'journal.json'));
  assert.equal(await initializeExampleNotebook(options), false);
  assert.deepEqual(await readFile(resolve(options.data, 'journal.json')), before);
});
test('existing, empty, corrupt and recovery journals are never replaced', async t => {
  for (const [file, contents] of [['journal.json','{"revision":8,"books":[]}'],['journal.json','broken'],['journal.previous.json','{"books":[]}']]) {
    const options = await fixture(t);
    await writeFile(resolve(options.data,file), contents);
    assert.equal(await initializeExampleNotebook(options), false);
    assert.equal(await readFile(resolve(options.data,file),'utf8'), contents);
    assert.deepEqual(await readdir(options.data), [file]);
  }
});
test('validation failure never publishes a partial journal', async t => {
  const options = await fixture(t);
  await assert.rejects(initializeExampleNotebook({...options,validate:()=>{throw Error('invalid');}}), /invalid/);
  assert.ok(!(await readdir(options.data)).includes('journal.json'));
  assert.equal(await initializeExampleNotebook(options), true);
});
test('Mac and Windows include the example runtime and its assets', async () => {
  for (const path of ['local/example-notebook.mjs', ...(await readdir(resolve(publicDir,'examples/starry-collage'))).map(n=>'public/examples/starry-collage/'+n)]) {
    assert.equal(distributableSource(path), true);
    assert.equal(distributableWindowsSource(path), true);
  }
});
