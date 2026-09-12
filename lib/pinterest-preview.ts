import type { PinterestResolvedImage } from './pinterest-resolve-compat';

export type VerifiedPinterestImage = PinterestResolvedImage & {
  available: boolean;
  width: number;
  height: number;
};

type ImageSize = { width: number; height: number };
type PreviewLoader = (url: string, signal?: AbortSignal) => Promise<ImageSize>;
const PREVIEW_TIMEOUT_MS = 6000;
const PREVIEW_CONCURRENCY = 4;

function abortError() {
  return new DOMException('图片预览已取消。', 'AbortError');
}

function checkAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError();
}

const loadBrowserImage: PreviewLoader = (url, signal) => new Promise((resolve, reject) => {
  checkAborted(signal);
  const image = new Image();
  const cleanup = () => {
    image.onload = null;
    image.onerror = null;
    signal?.removeEventListener('abort', onAbort);
  };
  const fail = (error: unknown) => {
    cleanup();
    image.src = '';
    reject(error);
  };
  const onAbort = () => fail(abortError());
  image.onload = () => {
    const size = { width: image.naturalWidth, height: image.naturalHeight };
    cleanup();
    resolve(size);
  };
  image.onerror = () => fail(new Error('图片预览加载失败。'));
  signal?.addEventListener('abort', onAbort, { once: true });
  try { image.src = url; } catch (error) { fail(error); }
});

function loadWithTimeout(url: string, load: PreviewLoader, signal?: AbortSignal): Promise<ImageSize> {
  return new Promise((resolve, reject) => {
    checkAborted(signal);
    const controller = new AbortController();
    let finished = false;
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    const fail = (error: unknown) => {
      if (finished) return;
      finished = true;
      cleanup();
      controller.abort();
      reject(error);
    };
    const onAbort = () => fail(abortError());
    const timer = setTimeout(() => fail(new Error('图片预览加载超时。')), PREVIEW_TIMEOUT_MS);
    signal?.addEventListener('abort', onAbort, { once: true });
    // Also bound injected loaders that do not reject when their signal aborts.
    Promise.resolve().then(() => {
      checkAborted(controller.signal);
      return load(url, controller.signal);
    }).then(size => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve(size);
    }, fail);
  });
}

function validSize(size: ImageSize) {
  return Number.isFinite(size?.width) && size.width > 0 &&
    Number.isFinite(size?.height) && size.height > 0;
}

export async function verifyPinterestPreviews(
  images: readonly PinterestResolvedImage[],
  { signal, load = loadBrowserImage }: { signal?: AbortSignal; load?: PreviewLoader } = {},
): Promise<VerifiedPinterestImage[]> {
  checkAborted(signal);
  const verified = images.map(image => ({ ...image, available: false, width: 0, height: 0 }));
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < images.length) {
      checkAborted(signal);
      const index = nextIndex++;
      const image = images[index];
      const urls = [...new Set([image.previewUrl, image.downloadUrl])].filter(Boolean);
      for (const url of urls) {
        checkAborted(signal);
        try {
          const size = await loadWithTimeout(url, load, signal);
          checkAborted(signal);
          if (!validSize(size)) continue;
          verified[index] = { ...image, previewUrl: url, available: true, width: size.width, height: size.height };
          break;
        } catch {
          checkAborted(signal);
        }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(PREVIEW_CONCURRENCY, images.length) }, worker));
  checkAborted(signal);
  return verified;
}

export function preferredPinterestImage(images: readonly VerifiedPinterestImage[]): VerifiedPinterestImage | null {
  let preferred: VerifiedPinterestImage | null = null;
  for (const image of images) {
    if (!image.available || !validSize(image)) continue;
    if (!preferred || image.width * image.height > preferred.width * preferred.height) preferred = image;
  }
  return preferred;
}
