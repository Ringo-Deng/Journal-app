import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('version is sourced from package.json and shown only through the existing bottom-left rail label', async () => {
  const [layout, page, pkg, rules] = await Promise.all([
    read('app/layout.tsx'),
    read('app/page.tsx'),
    read('package.json'),
    read('PROJECT_RELEASE_RULES.md'),
  ]);

  const version = JSON.parse(pkg).version;
  assert.match(layout, /packageJson\.version/);
  assert.match(layout, /--app-version/);
  assert.match(layout, /\.build-version::after/);
  assert.doesNotMatch(layout, /position:\s*'fixed'/);
  assert.equal((page.match(/className="build-version"/g) || []).length, 1);
  assert.match(rules, /仅在左下角显示/);
  assert.ok(/^0\.1\.\d+$/.test(version));
});
