import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);

test('all normal server entrypoints route through the native bootstrap', async () => {
  const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  const dev = await readFile(resolve(root, 'local/dev.mjs'), 'utf8');
  const launch = await readFile(resolve(root, 'local/launch.mjs'), 'utf8');
  const bootstrap = await readFile(resolve(root, 'local/server-bootstrap.mjs'), 'utf8');
  assert.equal(pkg.scripts.start, 'node local/server-bootstrap.mjs');
  assert.equal(pkg.scripts.service, 'node local/server-bootstrap.mjs');
  assert.match(dev, /local\/server-bootstrap\.mjs/);
  assert.match(launch, /local\/server-bootstrap\.mjs/);
  assert.doesNotMatch(dev, /\['local\/server\.mjs'\]/);
  assert.doesNotMatch(launch, /\['local\/server\.mjs'\]/);
  assert.match(bootstrap, /installPortableSips\(\)/);
});
