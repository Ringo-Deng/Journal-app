import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { freeTestPort } from './test-server.mjs';

const pinId = '1001136192184185383';
const originalUrl = `https://www.pinterest.com/pin/${pinId}/`;
const shortUrl = 'https://pin.it/directLink';
const firstUrl = 'https://i.pinimg.com/originals/aa/bb/cc/first.png';
const secondUrl = 'https://i.pinimg.com/originals/dd/ee/ff/second.png';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

async function startPinterestServer(t, { legacy = false } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'journal-pinterest-import-'));
  let child;
  t.after(async () => {
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }
    await rm(dir, { recursive: true, force: true });
  });

  const firstBytes = await sharp({ create: { width: 48, height: 80, channels: 4, background: '#b95862' } }).png().toBuffer();
  const secondBytes = await sharp({ create: { width: 96, height: 60, channels: 4, background: '#7296b3' } }).png().toBuffer();
  const fixtureImages = { [firstUrl]: firstBytes.toString('base64'), [secondUrl]: secondBytes.toString('base64') };
  const fixtureHtml = `<meta property="og:image" content="${firstUrl}"><script type="application/json">${JSON.stringify({ images: [firstUrl, secondUrl] })}</script>`;
  const preload = join(dir, 'pinterest-fixture.mjs');
  // Only upstream Pinterest I/O is stubbed; parsing, image validation and local HTTP storage run normally.
  await writeFile(preload, `
const images = ${JSON.stringify(fixtureImages)};
const html = ${JSON.stringify(fixtureHtml)};
globalThis.fetch = async input => {
  const url = new URL(typeof input === 'string' ? input : input.url || String(input));
  if (url.href === ${JSON.stringify(shortUrl)}) {
    return new Response('', { status: 308, headers: { location: 'https://api.pinterest.com/url_shortener/directLink/redirect/' } });
  }
  if (url.hostname === 'api.pinterest.com' && url.pathname === '/url_shortener/directLink/redirect/') {
    return new Response('', { status: 302, headers: { location: ${JSON.stringify(originalUrl)} } });
  }
  if (url.hostname === 'www.pinterest.com' || url.hostname === 'assets.pinterest.com') {
    return new Response(html, { headers: { 'content-type': 'text/html' } });
  }
  if (images[url.href]) {
    return new Response(Buffer.from(images[url.href], 'base64'), { headers: { 'content-type': 'image/png' } });
  }
  throw new Error('Unexpected upstream URL in isolated Pinterest test: ' + url.href);
};
`);
  const journal = { revision: 7, books: [] };
  await writeFile(join(dir, 'journal.json'), JSON.stringify(journal));
  let legacyRecord;
  if (legacy) {
    const src = '/uploads/00000000-0000-4000-8000-000000000001.png';
    legacyRecord = { pinId, src, name: '原来导入的图片', originalUrl, imageUrl: firstUrl,
      sha256: sha256(firstBytes), createdAt: '2025-01-01T00:00:00.000Z' };
    await mkdir(join(dir, 'uploads'));
    await writeFile(join(dir, src.slice(1)), firstBytes);
    await writeFile(join(dir, 'pinterest-imports.json'), JSON.stringify([legacyRecord]));
  }

  const port = await freeTestPort();
  const webPort = await freeTestPort();
  const env = { ...process.env, JOURNAL_DATA_DIR: dir, JOURNAL_CONFIG_DIR: dir,
    JOURNAL_PORT: String(port), JOURNAL_WEB_PORT: String(webPort) };
  delete env.DEEPSEEK_API_KEY;
  delete env.SHIGUANG_DEEPSEEK_API_KEY;
  child = spawn(process.execPath, ['--import', pathToFileURL(preload).href, 'local/server.mjs'], {
    cwd: new URL('..', import.meta.url), env, stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    let output = '';
    let errors = '';
    const timer = setTimeout(() => finish(Error('Isolated Pinterest test server startup timed out.')), 10_000);
    const finish = error => {
      clearTimeout(timer);
      child.stdout.off('data', onData);
      child.off('error', onError);
      child.off('exit', onExit);
      if (error) reject(error);
      else resolve();
    };
    const onData = chunk => {
      output += chunk;
      if (output.includes(`http://127.0.0.1:${port}`)) finish();
    };
    const onError = error => finish(error);
    const onExit = code => finish(Error(`Isolated Pinterest test server exited ${code}: ${errors}`));
    child.stdout.on('data', onData);
    child.stderr.on('data', chunk => { errors = (errors + chunk).slice(-4000); });
    child.once('error', onError);
    child.once('exit', onExit);
  });

  const base = `http://127.0.0.1:${port}`;
  const request = async (path, body) => {
    const response = await fetch(base + path, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  };
  const importImage = (imageUrl, input = originalUrl) => request('/api/materials/pinterest/import', { input, imageUrl });
  const records = async () => JSON.parse(await readFile(join(dir, 'pinterest-imports.json'), 'utf8'));
  return { dir, base, journal, firstBytes, secondBytes, legacyRecord, request, importImage, records };
}

test('resolve and import endpoints accept a pin.it webpage link', { timeout: 30_000 }, async t => {
  const server = await startPinterestServer(t);
  const preview = await server.request('/api/materials/pinterest/resolve', { input: shortUrl });
  assert.equal(preview.status, 200);
  assert.equal(preview.data.pinId, pinId);
  assert.equal(preview.data.originalUrl, originalUrl);
  assert.equal(preview.data.images[0].downloadUrl, firstUrl);

  const imported = await server.importImage(firstUrl, shortUrl);
  assert.equal(imported.status, 200);
  assert.equal(imported.data.pinId, pinId);
  assert.equal(imported.data.originalUrl, originalUrl);
  assert.deepEqual(await readFile(join(server.dir, imported.data.src.slice(1))), server.firstBytes);
  assert.deepEqual(JSON.parse(await readFile(join(server.dir, 'journal.json'), 'utf8')), server.journal);
});

test('different selected images from one Pinterest Pin keep their own files and repeated content is reused', { timeout: 30_000 }, async t => {
  const server = await startPinterestServer(t);
  const first = await server.importImage(firstUrl);
  const second = await server.importImage(secondUrl);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(first.data.duplicate, false);
  assert.equal(second.data.duplicate, false);
  assert.notEqual(first.data.src, second.data.src);
  assert.equal(first.data.imageUrl, firstUrl);
  assert.equal(second.data.imageUrl, secondUrl);
  assert.equal(first.data.sha256, sha256(server.firstBytes));
  assert.equal(second.data.sha256, sha256(server.secondBytes));

  const repeated = await server.importImage(firstUrl);
  assert.equal(repeated.status, 200);
  assert.equal(repeated.data.duplicate, true);
  assert.equal(repeated.data.src, first.data.src);
  const sameImageOnAnotherPin = await server.importImage(secondUrl, '641903753143916509');
  assert.equal(sameImageOnAnotherPin.status, 200);
  assert.equal(sameImageOnAnotherPin.data.duplicate, true);
  assert.equal(sameImageOnAnotherPin.data.src, second.data.src);

  const records = await server.records();
  assert.equal(records.length, 2);
  assert.deepEqual(new Set(records.map(record => record.src)), new Set([first.data.src, second.data.src]));
  assert.ok(records.every(record => record.pinId === pinId));
  for (const [result, bytes] of [[first, server.firstBytes], [second, server.secondBytes]]) {
    assert.deepEqual(await readFile(join(server.dir, result.data.src.slice(1))), bytes);
    const image = await fetch(server.base + result.data.src);
    assert.equal(image.status, 200);
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), bytes);
    const source = await server.request('/api/materials/source', { src: result.data.src, name: result.data.name });
    assert.equal(source.status, 200);
    assert.equal(source.data.sourceMeta.imageUrl, result.data.imageUrl);
  }
  assert.equal((await readdir(join(server.dir, 'uploads'))).length, 2);
  assert.deepEqual(JSON.parse(await readFile(join(server.dir, 'journal.json'), 'utf8')), server.journal);
});

test('legacy Pinterest records remain reusable after selecting another image from the same Pin', { timeout: 30_000 }, async t => {
  const server = await startPinterestServer(t, { legacy: true });
  const second = await server.importImage(secondUrl);
  assert.equal(second.status, 200);
  assert.equal(second.data.duplicate, false);
  assert.notEqual(second.data.src, server.legacyRecord.src);
  const first = await server.importImage(firstUrl);
  assert.equal(first.status, 200);
  assert.equal(first.data.duplicate, true);
  assert.equal(first.data.src, server.legacyRecord.src);
  assert.equal(first.data.name, server.legacyRecord.name);
  const records = await server.records();
  assert.equal(records.length, 2);
  assert.deepEqual(records.find(record => record.src === server.legacyRecord.src), server.legacyRecord);
  assert.deepEqual(await readFile(join(server.dir, server.legacyRecord.src.slice(1))), server.firstBytes);
});

test('a stale Pinterest image selection fails without writing images or import records', { timeout: 30_000 }, async t => {
  const server = await startPinterestServer(t, { legacy: true });
  const beforeRecords = await readFile(join(server.dir, 'pinterest-imports.json'), 'utf8');
  const beforeFiles = await readdir(join(server.dir, 'uploads'));
  const result = await server.importImage('https://i.pinimg.com/originals/00/11/22/removed.png');
  assert.equal(result.status, 422);
  assert.equal(await readFile(join(server.dir, 'pinterest-imports.json'), 'utf8'), beforeRecords);
  assert.deepEqual(await readdir(join(server.dir, 'uploads')), beforeFiles);
  assert.deepEqual(await readFile(join(server.dir, server.legacyRecord.src.slice(1))), server.firstBytes);
  assert.deepEqual(JSON.parse(await readFile(join(server.dir, 'journal.json'), 'utf8')), server.journal);
});
