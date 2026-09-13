import type { Book, Asset } from "./journal";

// Increment only when the paper renderer changes. One saved JPG per current sheet/cover.
const RENDER_VERSION = 10;
const COVER_RENDER_VERSION = 11;
export function readingJpgInput(book: Book, assets: Asset[], index: number | null) {
  if (index === null) {
    // Match renderReadingJpg's original-image lookup for custom covers. Catalog
    // names, labels and unrelated images do not change the captured cover.
    const coverAsset = book.coverAsset
      ? assets.find((asset) => asset.originalSrc === book.coverAsset)?.src || book.coverAsset
      : "";
    return JSON.stringify({
      version: COVER_RENDER_VERSION,
      appearance: { cover: book.cover, format: book.format, coverAsset },
      index,
    });
  }
  const flyleaf = !!book.flyleaf && index === 0;
  const pageIndex = index - (book.flyleaf ? 1 : 0);
  const spread = flyleaf ? book.flyleaf : book.spreads[pageIndex];
  // SpreadPreview resolves only visible asset pieces through the catalog.
  // Photos and paper backgrounds keep their direct URLs in the page/book input.
  const sources = spread?.elements
    .filter((piece) =>
      piece.kind === "asset" && piece.material !== "tape" &&
      (piece as typeof piece & { hidden?: boolean }).hidden !== true,
    )
    .map((piece) => assets.find((asset) => asset.id === piece.assetId)?.src || piece.src);
  return JSON.stringify({
    version: RENDER_VERSION,
    appearance: {
      cover: book.cover,
      format: book.format,
      paperFeel: book.paperFeel,
      paperStyle: book.paperStyle,
      paperColor: book.paperColor,
      paperRulingSize: book.paperRulingSize,
      paperBg: book.paperBg,
      header: book.header,
    },
    index,
    flyleaf,
    pageIndex,
    // Keep page and piece properties intact so all typography, crop, drawing,
    // layer order and per-side paper settings remain part of freshness checks.
    spread,
    sources,
  });
}
type Entry = { signature: string; blob: Blob };
let database: Promise<IDBDatabase> | undefined;
function db() {
  return (database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open("shiguang-reading-jpg", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("pages");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      database = undefined;
      reject(request.error);
    };
  }));
}
async function read(key: string): Promise<Entry | undefined> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const request = database.transaction("pages").objectStore("pages").get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function write(key: string, entry: Entry) {
  const database = await db();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction("pages", "readwrite");
    transaction.objectStore("pages").put(entry, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
const pending = new Map<string, Promise<Blob>>();
let renderQueue = Promise.resolve();
export async function getReadingJpg(
  book: Book,
  assets: Asset[],
  index: number | null,
): Promise<Blob> {
  const signature = readingJpgInput(book, assets, index);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(signature));
  const hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  const key = `${book.id}/${index === null ? "cover" : index}`;
  const taskKey = `${key}/${hash}`;
  const existing = pending.get(taskKey);
  if (existing) return existing;
  const task = (async () => {
    // Storage can be unavailable in private mode; still show a freshly generated JPG.
    const saved = await read(key).catch(() => undefined);
    if (saved?.signature === hash) return saved.blob;
    let result!: Blob;
    const render = renderQueue.then(async () => {
      const { renderReadingJpg } = await import("../components/book3d/render-reading-jpg");
      result = await renderReadingJpg(book, assets, index);
      await write(key, { signature: hash, blob: result }).catch(() => {});
    });
    renderQueue = render.catch(() => {});
    await render;
    return result;
  })();
  pending.set(taskKey, task);
  try {
    return await task;
  } finally {
    pending.delete(taskKey);
  }
}
