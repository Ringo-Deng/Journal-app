import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import net from 'node:net';

test('production HTTP serves all page-turn WAV files intact with an audio MIME type', async t => {
  const temp = await mkdtemp(join(tmpdir(), 'journal-audio-'));
  const listener = net.createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise((ok, fail) => listener.close(error => error ? fail(error) : ok()));
  const child = spawn(process.execPath, ['local/server-bootstrap.mjs'], {
    cwd: new URL('..', import.meta.url), stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, JOURNAL_DATA_DIR: join(temp, 'data'), JOURNAL_CONFIG_DIR: join(temp, 'config'),
      JOURNAL_PORT: String(port), JOURNAL_WEB_PORT: String(port), DEEPSEEK_API_KEY: '', SHIGUANG_DEEPSEEK_API_KEY: '' },
  });
  t.after(async () => {
    if (child.exitCode === null) { const exit = once(child, 'exit'); child.kill(); await exit; }
    await rm(temp, { recursive: true, force: true });
  });
  let output = '';
  const origin = await new Promise((ok, fail) => {
    const timer = setTimeout(() => fail(Error('Audio test server startup timeout: ' + output)), 10000);
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (match) { clearTimeout(timer); ok(match[0]); }
    });
    child.stderr.on('data', chunk => { output += chunk; });
    child.once('exit', code => { clearTimeout(timer); fail(Error('Audio test server exited ' + code + ': ' + output)); });
  });
  for (const file of ['mixkit-page-turn-single-1104.wav', 'mixkit-single-book-paging-1101-first.wav', 'mixkit-single-book-paging-1101-second.wav']) {
    const response = await fetch(origin + '/sounds/' + file);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'audio/wav');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    const bytes = await readFile(new URL('../public/sounds/' + file, import.meta.url));
    assert.equal(response.headers.get('content-length'), String(bytes.length));
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
    for (const [range, start, end] of [['bytes=0-43', 0, 43], ['bytes=44-', 44, bytes.length - 1], ['bytes=-16', bytes.length - 16, bytes.length - 1]]) {
      const partial = await fetch(origin + '/sounds/' + file + '?audio=2', { headers: { Range: range } });
      assert.equal(partial.status, 206);
      assert.equal(partial.headers.get('content-range'), `bytes ${start}-${end}/${bytes.length}`);
      assert.equal(partial.headers.get('content-length'), String(end - start + 1));
      assert.deepEqual(Buffer.from(await partial.arrayBuffer()), bytes.subarray(start, end + 1));
    }
    const invalid = await fetch(origin + '/sounds/' + file, { headers: { Range: `bytes=${bytes.length}-` } });
    assert.equal(invalid.status, 416);
    assert.equal(invalid.headers.get('content-range'), `bytes */${bytes.length}`);
    const head = await fetch(origin + '/sounds/' + file, { method: 'HEAD' });
    assert.equal(head.headers.get('content-length'), String(bytes.length));
    assert.equal((await head.arrayBuffer()).byteLength, 0);
  }
});
