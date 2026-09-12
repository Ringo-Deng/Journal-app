import test from "node:test";
import assert from "node:assert/strict";
import { commitMaterialImportFiles } from "../lib/material-import-commit.mjs";

const previousAssets = [{ id: "old" }],
  nextAssets = [{ id: "new" }],
  nextJobs = [{ id: "job", imported: true }];

test("material import commits assets before marking job items imported", async () => {
  const writes = [];
  await commitMaterialImportFiles({
    write: async (file, value) => writes.push([file, value]),
    readAssets: async () => assert.fail("successful commit must not reread assets"),
    previousAssets,
    nextAssets,
    nextJobs,
  });
  assert.deepEqual(writes, [
    ["materials.json", nextAssets],
    ["material-jobs.json", nextJobs],
  ]);
});

test("a failed job write restores the previous material library", async () => {
  const writes = [];
  let reconciled = false;
  await assert.rejects(
    commitMaterialImportFiles({
      write: async (file, value) => {
        writes.push([file, value]);
        if (file === "material-jobs.json") throw new Error("disk full");
      },
      readAssets: async () => assert.fail("a successful rollback must not reread assets"),
      previousAssets,
      nextAssets,
      nextJobs,
      onReconcileAssets: () => {
        reconciled = true;
      },
    }),
    /disk full/,
  );
  assert.deepEqual(writes, [
    ["materials.json", nextAssets],
    ["material-jobs.json", nextJobs],
    ["materials.json", previousAssets],
  ]);
  assert.equal(reconciled, false);
});

test("a failed rollback reloads the committed library before later writes", async () => {
  let writeCount = 0,
    reconciled;
  const diskAssets = [{ id: "committed-on-disk" }];
  await assert.rejects(
    commitMaterialImportFiles({
      write: async () => {
        writeCount++;
        if (writeCount > 1) throw new Error(writeCount === 2 ? "jobs failed" : "rollback failed");
      },
      readAssets: async () => diskAssets,
      previousAssets,
      nextAssets,
      nextJobs,
      onReconcileAssets: (value) => {
        reconciled = value;
      },
    }),
    /jobs failed/,
  );
  assert.equal(writeCount, 3);
  assert.equal(reconciled, diskAssets);
});
