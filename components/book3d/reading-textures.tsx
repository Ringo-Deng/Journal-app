import { bookFormat, coverInfo, type Book, type Asset } from "@/lib/journal";
import { readingBookPlan } from "@/lib/reading-book-plan";
import { getReadingJpg } from "@/lib/reading-jpg";
import { createCoverTextures } from "./cover-materials";

/** Decode saved JPGs into a bounded neighborhood of GPU-ready page images. */
export function createReadingTextures(book: Book, assets: Asset[]) {
  const plan = readingBookPlan(book.spreads.length, !!book.flyleaf);
  const coverInfoValue = coverInfo(book.cover);
  const stationery = !book.coverAsset && coverInfoValue.material.id === "linen";
  // Use front-face artwork without the shelf preview's illustrated book furniture.
  // The back texture deliberately omits the front label.
  const sharedStationeryCover = (() => {
    if (!stationery) return undefined;
    const textures = createCoverTextures("leather", coverInfoValue.colorway.color);
    const source = textures.front.image as HTMLCanvasElement;
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    canvas.getContext("2d")!.drawImage(source, 0, 0);
    textures.front.dispose();
    textures.back.dispose();
    textures.bump.dispose();
    return canvas;
  })();
  const cache = new Map<number, [HTMLCanvasElement, HTMLCanvasElement]>();
  const jpgs = new Map<number | null, Blob>();
  let preload: Promise<void> | undefined;
  let disposed = false;
  let queue = Promise.resolve();
  let front: HTMLCanvasElement | undefined;
  const blank = document.createElement("canvas");
  blank.width = 1000;
  blank.height = Math.round(2000 / bookFormat(book).ratio);
  const ctx = blank.getContext("2d")!;
  ctx.fillStyle = "#faf7ef";
  ctx.fillRect(0, 0, blank.width, blank.height);
  async function decode(index: number | null) {
    const blob = jpgs.get(index);
    if (!blob) throw Error("手帐图片尚未准备完成");
    const url = URL.createObjectURL(blob);
    const image = new Image();
    try {
      image.src = url;
      await image.decode();
      return image;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  async function prepare(leaf: number) {
    const work = queue.then(async () => {
      if (disposed) return;
      preload ??= (async () => {
        for (const index of [null, ...Array.from({ length: plan.count }, (_, i) => i)]) {
          if (disposed) return;
          const jpg = await getReadingJpg(book, assets, index);
          if (disposed) return;
          jpgs.set(index, jpg);
        }
      })();
      await preload;
      if (disposed) return;
      if (!front && !sharedStationeryCover) {
        const image = await decode(null);
        if (disposed) return;
        front = crop(image, false, true);
      }
      const needed = new Set<number>();
      for (
        let i = Math.max(0, leaf * 2 - 3);
        i <= Math.min(plan.faces.length - 1, leaf * 2 + 4);
        i++
      ) {
        const sheet = plan.faces[i].sheet;
        if (sheet !== null) needed.add(sheet);
      }
      for (const index of needed) {
        if (cache.has(index)) continue;
        const image = await decode(index);
        if (disposed) return;
        cache.set(index, [crop(image, false), crop(image, true)]);
      }
      for (const key of cache.keys()) if (!needed.has(key)) cache.delete(key);
    });
    queue = work.catch(() => {});
    return work;
  }
  function crop(image: HTMLImageElement, right: boolean, full = false) {
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth / (full ? 1 : 2);
    canvas.height = image.naturalHeight;
    canvas
      .getContext("2d")!
      .drawImage(
        image,
        right ? canvas.width : 0,
        0,
        canvas.width,
        canvas.height,
        0,
        0,
        canvas.width,
        canvas.height,
      );
    return canvas;
  }
  return {
    prepare,
    page(index: number) {
      const face = plan.faces[index];
      if (!face || face.sheet === null) return blank;
      const pair = cache.get(face.sheet);
      if (!pair) throw Error("Page texture is not ready");
      return pair[face.side === "left" ? 0 : 1];
    },
    cover() {
      if (sharedStationeryCover) return sharedStationeryCover;
      if (!front) throw Error("Cover texture is not ready");
      return front;
    },
    dispose() {
      disposed = true;
      cache.clear();
      jpgs.clear();
      front = undefined;
    },
  };
}
