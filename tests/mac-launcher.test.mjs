import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const launcher = resolve(root, '启动拾光手帐.command');

test('mac launcher starts from its own repository directory', async () => {
  const source = await readFile(launcher, 'utf8');
  assert.match(source, /^#!\/bin\/zsh/m);
  assert.match(source, /SCRIPT_DIR="\$\{0:A:h\}"/);
  assert.match(source, /cd "\$SCRIPT_DIR"/);
  assert.match(source, /exec node local\/launch\.mjs/);
});

test('mac launcher does not require terminal Git commands', async () => {
  const source = await readFile(launcher, 'utf8');
  assert.doesNotMatch(source, /git\s+(pull|fetch|checkout)/);
  assert.match(source, /command -v node/);
});

test('mac launcher is executable after a normal git checkout', async () => {
  const info = await stat(launcher);
  assert.notEqual(info.mode & 0o111, 0);
});
