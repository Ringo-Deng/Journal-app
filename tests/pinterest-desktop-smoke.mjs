// Run with Electron, outside node --test. All network traffic stays on loopback.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { createPinterestDesktopFetch, pinterestFetch } from '../local/pinterest-network.mjs';

const require = createRequire(import.meta.url);
const electron = require('electron');
if (process.type === 'utility') {
  try {
    // Remap remote hosts at the native request boundary, retaining the real
    // Electron request/response/redirect events and production URL validation.
    const request = electron.net.request.bind(electron.net);
    electron.net.request = options => request({ ...options,
      url: process.env.PINTEREST_FIXTURE_ORIGIN + new URL(options.url).pathname });
    globalThis.fetch = () => { throw Error('Desktop Pinterest must not use Node fetch'); };
    const fetch = process.platform === 'win32' ? pinterestFetch : createPinterestDesktopFetch(electron.net);
    const redirect = await fetch('https://pin.it/share', { redirect: 'manual' });
    assert.equal(redirect.status, 302);
    assert.equal(redirect.headers.get('location'), 'https://www.pinterest.com/pin/123456/');
    const response = await fetch('https://pin.it/share', { signal: AbortSignal.timeout(5000) });
    assert.equal(response.url, 'https://www.pinterest.com/pin/123456/');
    assert.match(await response.text(), /og:image/);
    const image = await fetch('https://i.pinimg.com/originals/image.png');
    assert.equal(image.headers.get('content-type'), 'image/png');
    assert.equal((await image.arrayBuffer()).byteLength, 8);
    await assert.rejects(fetch('https://pin.it/stall', { signal: AbortSignal.timeout(100) }));
    if (process.platform === 'win32') {
      const { resolvePinterestInput, resolvePinterestPin, downloadPinterestImage } = await import('../local/pinterest-import.mjs');
      assert.equal((await resolvePinterestInput('https://pin.it/share')).pinId, '123456');
      assert.equal((await resolvePinterestPin('123456')).images.length, 1);
      assert.equal((await downloadPinterestImage('123456')).ext, 'png');
    }
    process.parentPort.postMessage({ ok: true });
  } catch (error) {
    process.parentPort.postMessage({ ok: false, error: error.stack });
  }
} else {
  const profile = await mkdtemp(join(tmpdir(), 'journal-pinterest-electron-'));
  electron.app.setPath('userData', profile);
  const server = createServer((req, res) => {
    if (req.url === '/stall') return;
    if (req.url === '/share') {
      res.writeHead(302, { location: 'https://www.pinterest.com/pin/123456/' }); res.end(); return;
    }
    if (req.url.endsWith('.png')) {
      res.writeHead(200, { 'content-type': 'image/png' });
      res.end(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])); return;
    }
    res.end('<meta property="og:image" content="https://i.pinimg.com/originals/image.png">');
  });
  let worker;
  void electron.app.whenReady().then(async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    await new Promise((resolve, reject) => {
      worker = electron.utilityProcess.fork(fileURLToPath(import.meta.url), [], {
        env: { ...process.env, PINTEREST_FIXTURE_ORIGIN: `http://127.0.0.1:${server.address().port}` }, stdio: 'pipe',
      });
      worker.stderr.on('data', chunk => process.stderr.write(chunk));
      const timer = setTimeout(() => reject(Error('Pinterest Electron smoke timed out')), 15000);
      worker.once('message', result => {
        clearTimeout(timer);
        if (result.ok) resolve(); else reject(Error(result.error));
      });
      worker.once('exit', code => { clearTimeout(timer); reject(Error(`Utility exited ${code}`)); });
    });
    console.log('Pinterest Electron utility: native requests, redirects, image bytes and timeout passed.');
  }).then(() => finish(0), error => { console.error(error); return finish(1); });
  async function finish(code) {
    worker?.kill();
    server.closeAllConnections();
    server.close();
    await rm(profile, { recursive: true, force: true }).catch(() => {});
    electron.app.exit(code);
  }
}
