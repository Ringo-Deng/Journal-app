export async function commitMaterialImportFiles({
  write,
  readAssets,
  previousAssets,
  nextAssets,
  nextJobs,
  onReconcileAssets = () => {},
}) {
  await write("materials.json", nextAssets);
  try {
    await write("material-jobs.json", nextJobs);
  } catch (failure) {
    try {
      await write("materials.json", previousAssets);
    } catch {
      let diskAssets = nextAssets;
      try {
        const loaded = await readAssets();
        if (Array.isArray(loaded)) diskAssets = loaded;
      } catch {
        // The first committed file is the safest in-memory fallback if it cannot be reread.
      }
      onReconcileAssets(diskAssets);
    }
    throw failure;
  }
}
