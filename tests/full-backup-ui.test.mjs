import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [component, page] = await Promise.all([
  readFile(new URL("../components/full-backup.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
]);

test("backup dialog offers all-data and journal-only scopes", () => {
  assert.match(component, />\s*备份全部资料\s*</);
  assert.match(component, />\s*仅备份手帐\s*</);
  assert.match(component, /JSON\.stringify\(\{ revision, scope \}\)/);
  assert.match(component, /选择备份文件恢复/);
});

test("legacy JSON backup controls are removed from the normal backup flow", () => {
  assert.doesNotMatch(component, /旧版手帐备份|导入旧版 JSON|onLegacyExport|onLegacyImport/);
  assert.doesNotMatch(page, /importBackup|importInput|remapNotebookUploads/);
  assert.match(page, /const backupBooks = resolveNotebookAssetSources\(books, assets\)/);
  assert.match(page, /notebookUploads\(backupBooks\)/);
  assert.match(page, /books: backupBooks/);
});
