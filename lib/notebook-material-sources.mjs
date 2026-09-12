/**
 * Materialize the current library image into an export-only notebook clone.
 * Live notebooks keep their original src fallback and revision untouched.
 * @param {unknown[]} books
 * @param {{id?:unknown,src?:unknown}[]} assets
 */
export function resolveNotebookAssetSources(books, assets = []) {
  const sources = new Map(
    assets
      .filter((asset) => typeof asset?.id === "string" && typeof asset?.src === "string")
      .map((asset) => [asset.id, asset.src]),
  );
  const next = structuredClone(books);
  const resolvePiece = (piece) => {
    if (piece?.kind !== "asset" || typeof piece.assetId !== "string") return;
    const src = sources.get(piece.assetId);
    if (src) piece.src = src;
  };
  for (const book of next) {
    for (const template of book?.collageTemplates || [])
      for (const piece of template?.elements || []) resolvePiece(piece);
    for (const spread of [
      ...(Array.isArray(book?.spreads) ? book.spreads : []),
      ...(book?.flyleaf ? [book.flyleaf] : []),
    ])
      for (const piece of spread?.elements || []) resolvePiece(piece);
  }
  return next;
}
