import type { Book, Asset } from "./journal";

// Increment only when the paper renderer changes. One saved JPG per current sheet/cover.
const RENDER_VERSION = 2;
const COVER_RENDER_VERSION = 3;
export function readingJpgInput(book: Book, assets: Asset[], index: number | null) {
  const { spreads, flyleaf, ...appearance } = book;
  return JSON.stringify({
    version: index === null ? COVER_RENDER_VERSION : RENDER_VERSION,
    appearance,
    index,
    spread: index === null ? null : [...(flyleaf ? [flyleaf] : []), ...spreads][index],
    assets,
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
