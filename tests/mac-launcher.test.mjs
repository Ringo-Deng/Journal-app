import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const launcher = resolve(root, '启动拾光手帐.command');
const pageTurnLauncher = resolve(root, '启动翻页测试.command');

test('mac launcher starts from its own repository directory', async () => {
  const source = await readFile(launcher, 'utf8');
  assert.match(source, /^#!\/bin\/zsh/m);
  assert.match(source, /SCRIPT_DIR="\$\{0:A:h\}"/);
  assert.match(source, /cd "\$SCRIPT_DIR"/);
  assert.match(source, /exec node local\/launch\.mjs/);
});

test('mac launcher updates without credential prompts and falls back to the local checkout', async () => {
  const source = await readFile(launcher, 'utf8');
  assert.match(source, /GIT_TERMINAL_PROMPT=0 git fetch origin main --quiet/);
  assert.match(source, /git merge --ff-only FETCH_HEAD --quiet/);
  assert.match(source, /未能拉取 GitHub 更新，将继续启动当前本地版本/);
  assert.doesNotMatch(source, /git\s+(reset\s+--hard|clean\s+-[a-z]*f|checkout\s+--)/);
  assert.match(source, /command -v node/);
});

test('mac launcher is executable after a normal git checkout', async () => {
  const info = await stat(launcher);
  assert.notEqual(info.mode & 0o111, 0);
});

test('page-turn launcher opens the three-test route in dev mode', async () => {
  const source = await readFile(pageTurnLauncher, 'utf8');
  assert.match(source, /^#!\/bin\/zsh/m);
  assert.match(source, /SHIGUANG_DEV=1/);
  assert.match(source, /SHIGUANG_OPEN_PATH="\/three-test"/);
  assert.match(source, /exec node local\/launch\.mjs/);
});

test('page-turn launcher is executable after a normal git checkout', async () => {
  const info = await stat(pageTurnLauncher);
  assert.notEqual(info.mode & 0o111, 0);
});
