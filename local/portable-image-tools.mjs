import { randomUUID } from "node:crypto";
import { unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const MAX_INPUT_PIXELS = 40_000_000;
const MAX_EDGE = 2400;
const MAX_RESULTS = 100;

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

async function decodeImage(input) {
  const rendered = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, animated: false })
    .rotate()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (!rendered.info.width || !rendered.info.height || rendered.info.channels !== 4)
    throw Error("无法读取图片像素。");
  return { pixels: rendered.data, width: rendered.info.width, height: rendered.info.height };
}

function cropImage(image, rect) {
  if (!rect) return image;
  const [left, top, width, height] = rect.map(Number);
  const x = clamp(Math.floor(left * image.width), 0, image.width - 1);
  const y = clamp(Math.floor(top * image.height), 0, image.height - 1);
  const w = clamp(Math.round(width * image.width), 1, image.width - x);
  const h = clamp(Math.round(height * image.height), 1, image.height - y);
  const pixels = Buffer.alloc(w * h * 4);
  for (let row = 0; row < h; row++) {
    const from = ((y + row) * image.width + x) * 4;
    image.pixels.copy(pixels, row * w * 4, from, from + w * 4);
  }
  return { pixels, width: w, height: h };
}

function sampleIndices(width, height, borderOnly) {
  const indices = [];
  if (borderOnly) {
    const step = Math.max(1, Math.floor((width * 2 + height * 2) / 4000));
    for (let x = 0; x < width; x += step) {
      indices.push(x, (height - 1) * width + x);
    }
    for (let y = step; y < height - 1; y += step) indices.push(y * width, y * width + width - 1);
    return indices;
  }
  const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 40_000)));
  for (let y = 0; y < height; y += step)
    for (let x = 0; x < width; x += step) indices.push(y * width + x);
  return indices;
}

function dominantOpaqueColor(image, borderOnly) {
  const groups = new Map();
  let samples = 0;
  for (const pixel of sampleIndices(image.width, image.height, borderOnly)) {
    const offset = pixel * 4;
    if (image.pixels[offset + 3] < 240) continue;
    const r = image.pixels[offset],
      g = image.pixels[offset + 1],
      b = image.pixels[offset + 2];
    const key = `${r >> 4}:${g >> 4}:${b >> 4}`;
    const group = groups.get(key) || { count: 0, r: 0, g: 0, b: 0 };
    group.count++;
    group.r += r;
    group.g += g;
    group.b += b;
    groups.set(key, group);
    samples++;
  }
  let best = null;
  for (const group of groups.values()) if (!best || group.count > best.count) best = group;
  if (!best || !samples) return null;
  return {
    color: [best.r / best.count, best.g / best.count, best.b / best.count],
    share: best.count / samples,
    samples,
  };
}

function chooseBackground(image) {
  const border = dominantOpaqueColor(image, true);
  if (border && border.samples >= 8) return border.share >= 0.32 ? border : null;
  const whole = dominantOpaqueColor(image, false);
  if (whole && whole.samples >= 20 && whole.share >= 0.12 && Math.min(...whole.color) >= 130)
    return whole;
  return null;
}

function colorDistance(pixels, offset, color) {
  const r = pixels[offset] - color[0];
  const g = pixels[offset + 1] - color[1];
  const b = pixels[offset + 2] - color[2];
  return Math.sqrt(r * r + g * g + b * b);
}

function hasTransparency(image) {
  const total = image.width * image.height;
  let transparent = 0;
  const step = Math.max(1, Math.floor(total / 40_000));
  for (let pixel = 0; pixel < total; pixel += step)
    if (image.pixels[pixel * 4 + 3] < 45) transparent++;
  return transparent > Math.ceil(total / step / 100);
}

function clearConnectedBackground(image, tolerance) {
  const background = chooseBackground(image);
  if (!background) return { image, removed: 0, background: null };
  const { width, height } = image,
    total = width * height;
  const paper = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0,
    tail = 0;
  const matches = (pixel) => {
    const offset = pixel * 4;
    return (
      image.pixels[offset + 3] < 20 ||
      colorDistance(image.pixels, offset, background.color) <= tolerance
    );
  };
  const seed = (pixel) => {
    if (paper[pixel] || !matches(pixel)) return;
    paper[pixel] = 1;
    queue[tail++] = pixel;
  };
  for (let x = 0; x < width; x++) {
    seed(x);
    seed((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y++) {
    seed(y * width);
    seed(y * width + width - 1);
  }
  while (head < tail) {
    const pixel = queue[head++],
      x = pixel % width,
      y = Math.floor(pixel / width);
    if (x > 0) seed(pixel - 1);
    if (x + 1 < width) seed(pixel + 1);
    if (y > 0) seed(pixel - width);
    if (y + 1 < height) seed(pixel + width);
  }
  if (!tail) return { image, removed: 0, background };
  const pixels = Buffer.from(image.pixels);
  for (let pixel = 0; pixel < total; pixel++) {
    const offset = pixel * 4;
    if (paper[pixel]) {
      pixels[offset] = 0;
      pixels[offset + 1] = 0;
      pixels[offset + 2] = 0;
      pixels[offset + 3] = 0;
      continue;
    }
    const x = pixel % width,
      y = Math.floor(pixel / width);
    const edge =
      (x > 0 && paper[pixel - 1]) ||
      (x + 1 < width && paper[pixel + 1]) ||
      (y > 0 && paper[pixel - width]) ||
      (y + 1 < height && paper[pixel + width]);
    if (!edge) continue;
    const alpha = clamp(
      Math.round(((colorDistance(image.pixels, offset, background.color) - tolerance) / 14) * 255),
      0,
      255,
    );
    pixels[offset + 3] = Math.min(pixels[offset + 3], alpha);
  }
  return { image: { pixels, width, height }, removed: tail, background };
}

function foregroundBounds(image) {
  let minX = image.width,
    minY = image.height,
    maxX = -1,
    maxY = -1,
    count = 0;
  for (let y = 0; y < image.height; y++)
    for (let x = 0; x < image.width; x++) {
      if (image.pixels[(y * image.width + x) * 4 + 3] <= 45) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      count++;
    }
  return count ? { minX, minY, maxX: maxX + 1, maxY: maxY + 1, count } : null;
}

function connectedComponents(image) {
  const { width, height } = image,
    total = width * height;
  const labels = new Int32Array(total);
  const queue = new Int32Array(total);
  const components = [];
  let label = 0;
  for (let start = 0; start < total; start++) {
    if (labels[start] || image.pixels[start * 4 + 3] <= 45) continue;
    label++;
    let head = 0,
      tail = 0,
      minX = width,
      minY = height,
      maxX = 0,
      maxY = 0;
    labels[start] = label;
    queue[tail++] = start;
    while (head < tail) {
      const pixel = queue[head++],
        x = pixel % width,
        y = Math.floor(pixel / width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + 1);
      maxY = Math.max(maxY, y + 1);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx,
            ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const next = ny * width + nx;
          if (labels[next] || image.pixels[next * 4 + 3] <= 45) continue;
          labels[next] = label;
          queue[tail++] = next;
        }
    }
    components.push({ label, minX, minY, maxX, maxY, count: tail });
  }
  return { labels, components };
}

async function writeWhole(image, outputDir, engine) {
  const file = `${randomUUID()}.png`;
  await sharp(image.pixels, { raw: { width: image.width, height: image.height, channels: 4 } })
    .png()
    .toFile(join(outputDir, file));
  return {
    items: [
      {
        file,
        width: image.width,
        height: image.height,
        foregroundPixels: foregroundBounds(image)?.count || 0,
        bounds: [0, 0, 1, 1],
      },
    ],
    engine,
    width: image.width,
    height: image.height,
  };
}

async function writeComponents(image, outputDir, engine) {
  const { labels, components } = connectedComponents(image);
  const minimum = Math.max(8, Math.floor((image.width * image.height) / 12_000));
  const retained = components
    .filter(
      (component) =>
        component.count >= minimum &&
        component.maxX - component.minX >= 3 &&
        component.maxY - component.minY >= 3,
    )
    .slice(0, MAX_RESULTS);
  const items = [];
  try {
    for (const component of retained) {
      const width = component.maxX - component.minX,
        height = component.maxY - component.minY;
      const pixels = Buffer.alloc(width * height * 4);
      for (let y = component.minY; y < component.maxY; y++)
        for (let x = component.minX; x < component.maxX; x++) {
          const sourcePixel = y * image.width + x;
          if (labels[sourcePixel] !== component.label) continue;
          image.pixels.copy(
            pixels,
            ((y - component.minY) * width + x - component.minX) * 4,
            sourcePixel * 4,
            sourcePixel * 4 + 4,
          );
        }
      const file = `${randomUUID()}.png`;
      await sharp(pixels, { raw: { width, height, channels: 4 } })
        .png()
        .toFile(join(outputDir, file));
      items.push({
        file,
        width,
        height,
        foregroundPixels: component.count,
        bounds: [
          component.minX / image.width,
          component.minY / image.height,
          width / image.width,
          height / image.height,
        ],
      });
    }
  } catch (error) {
    await Promise.all(items.map((item) => unlink(join(outputDir, item.file)).catch(() => {})));
    throw error;
  }
  return {
    items,
    engine,
    width: image.width,
    height: image.height,
    bridgeSplits: 0,
    patternGroups: 0,
  };
}

export async function segmentPortable(input, outputDir, mode = "auto", tolerance = 28, rect) {
  const source = await decodeImage(input);
  const image = cropImage(source, rect);
  if (mode === "crop") return writeWhole(image, outputDir, "Windows 框选保留原底");

  const transparent = hasTransparency(image);
  let processed = image,
    removed = 0;
  if (!transparent || ["paper", "dense", "single", "point", "ai"].includes(mode)) {
    const cleared = clearConnectedBackground(image, Number(tolerance) || 28);
    processed = cleared.image;
    removed = cleared.removed;
  }
  const usefulRemoval = removed >= Math.max(8, Math.floor((image.width * image.height) / 500));
  if (!transparent && !usefulRemoval)
    throw Error("图片背景不够单一，Windows 本地处理未修改原图；请框选保留原底。");

  const engine =
    transparent && !usefulRemoval ? "Windows 透明素材分离" : "Windows 本地纸底 / 背景分离";
  if (["single", "point"].includes(mode)) return writeWhole(processed, outputDir, engine);
  return writeComponents(processed, outputDir, engine);
}

export async function cutoutPortable(input, output) {
  const image = await decodeImage(input);
  const transparent = hasTransparency(image);
  const cleared = transparent ? { image, removed: 0 } : clearConnectedBackground(image, 34);
  if (!transparent && cleared.removed < Math.max(8, Math.floor((image.width * image.height) / 500)))
    throw Error("图片背景不够单一。");
  const bounds = foregroundBounds(cleared.image);
  if (!bounds || bounds.count < Math.max(25, Math.floor((image.width * image.height) / 10_000)))
    throw Error("没有识别到可以保留的主体。");
  const cropped = cropImage(cleared.image, [
    bounds.minX / image.width,
    bounds.minY / image.height,
    (bounds.maxX - bounds.minX) / image.width,
    (bounds.maxY - bounds.minY) / image.height,
  ]);
  const png = await sharp(cropped.pixels, {
    raw: { width: cropped.width, height: cropped.height, channels: 4 },
  })
    .png()
    .toBuffer();
  await writeFile(output, png, { mode: 0o600 });
}

export async function palettePortable(paths) {
  const output = {};
  for (const path of paths) {
    const rendered = await sharp(path, { limitInputPixels: MAX_INPUT_PIXELS, animated: false })
      .rotate()
      .resize({ width: 32, height: 32, fit: "inside", withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const counts = new Map();
    for (let offset = 0; offset < rendered.data.length; offset += 4) {
      if (rendered.data[offset + 3] < 128) continue;
      const r = rendered.data[offset],
        g = rendered.data[offset + 1],
        b = rendered.data[offset + 2];
      if (Math.min(r, g, b) > 239) continue;
      const key = (r >> 5) * 64 + (g >> 5) * 8 + (b >> 5);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    output[path] = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .slice(0, 4)
      .map(
        ([key]) =>
          `#${[(key >> 6) * 32 + 16, ((key >> 3) & 7) * 32 + 16, (key & 7) * 32 + 16]
            .map((value) => value.toString(16).padStart(2, "0"))
            .join("")}`,
      );
  }
  return output;
}
