// Point selection is deliberately separate from sheet splitting: a sheet can
// contain several valid stickers, whereas a click must retain just its subject.
function labelMask(mask, width, height) {
  const labels = new Int32Array(mask.length);
  const queue = new Int32Array(mask.length);
  const parts = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start]) continue;
    const id = parts.length + 1;
    let head = 0, tail = 1;
    queue[0] = start;
    labels[start] = id;
    const part = { id, count: 0, left: width, top: height, right: 0, bottom: 0 };
    while (head < tail) {
      const p = queue[head++], x = p % width, y = Math.floor(p / width);
      part.left = Math.min(part.left, x); part.right = Math.max(part.right, x + 1);
      part.top = Math.min(part.top, y); part.bottom = Math.max(part.bottom, y + 1);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, next = ny * width + nx;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height || !mask[next] || labels[next]) continue;
        labels[next] = id; queue[tail++] = next;
      }
    }
    part.count = tail;
    parts.push(part);
  }
  return { labels, parts };
}

// Integral sums keep morphology linear in pixel count, even on large imports.
function morph(mask, width, height, radius, dilate) {
  const stride = width + 1, sums = new Uint32Array(stride * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += mask[y * width + x];
      sums[(y + 1) * stride + x + 1] = sums[y * stride + x + 1] + row;
    }
  }
  const out = new Uint8Array(mask.length), full = (radius * 2 + 1) ** 2;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const left = Math.max(0, x - radius), right = Math.min(width, x + radius + 1);
    const top = Math.max(0, y - radius), bottom = Math.min(height, y + radius + 1);
    const count = sums[bottom * stride + right] - sums[top * stride + right]
      - sums[bottom * stride + left] + sums[top * stride + left];
    out[y * width + x] = Number(dilate ? count > 0 : count === full);
  }
  return out;
}

function selectPart(result, width, height, point) {
  const x = Math.min(width - 1, Math.max(0, Math.round(point[0] * (width - 1))));
  const y = Math.min(height - 1, Math.max(0, Math.round(point[1] * (height - 1))));
  const minArea = Math.max(12, width * height / 2000);
  const valid = result.parts.filter(part => part.count >= minArea);
  const direct = valid.find(part => part.id === result.labels[y * width + x]);
  if (direct) return direct;
  // A click can land on white clothing inside a dark outline. Prefer the
  // smallest enclosing object instead of a nearby decoration outside it.
  const enclosed = valid.filter(part => x >= part.left && x < part.right && y >= part.top && y < part.bottom)
    .sort((a, b) => (a.right - a.left) * (a.bottom - a.top) - (b.right - b.left) * (b.bottom - b.top));
  if (enclosed.length) return enclosed[0];
  const ids = new Set(valid.map(part => part.id));
  let nearest = 0, distance = (Math.min(width, height) * 0.06) ** 2;
  for (let p = 0; p < result.labels.length; p++) {
    if (!ids.has(result.labels[p])) continue;
    const d = (p % width - x) ** 2 + (Math.floor(p / width) - y) ** 2;
    if (d < distance) { distance = d; nearest = result.labels[p]; }
  }
  return valid.find(part => part.id === nearest);
}

function fillInterior(mask, width, height) {
  const outside = new Uint8Array(mask.length), queue = new Int32Array(mask.length);
  let head = 0, tail = 0;
  const add = p => { if (!mask[p] && !outside[p]) { outside[p] = 1; queue[tail++] = p; } };
  for (let x = 0; x < width; x++) { add(x); add((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { add(y * width); add(y * width + width - 1); }
  while (head < tail) {
    const p = queue[head++], x = p % width, y = Math.floor(p / width);
    if (x) add(p - 1); if (x + 1 < width) add(p + 1);
    if (y) add(p - width); if (y + 1 < height) add(p + width);
  }
  return mask.map((value, p) => value || !outside[p] ? 1 : 0);
}

export function portablePointMask(image, background, tolerance, point) {
  if (!background || !Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite))
    throw Error('无法确定点选主体，请使用吸附套索。');
  const { width, height, pixels } = image;
  const mask = new Uint8Array(width * height);
  // Do not increase the threshold to the sheet slider's aggressive values:
  // that would consume pale clothing and skin along with the paper.
  const threshold = Math.min(40, Math.max(12, tolerance));
  for (let p = 0; p < mask.length; p++) {
    const i = p * 4;
    const distance = Math.hypot(pixels[i] - background[0], pixels[i + 1] - background[1], pixels[i + 2] - background[2]);
    mask[p] = Number(pixels[i + 3] > 45 && distance > threshold);
  }
  let result = labelMask(mask, width, height);
  let part = selectPart(result, width, height, point);
  if (!part) throw Error('没有找到点击的主体，请点在人物中央或使用吸附套索。');
  let radius = 0;
  const spansSheet = p => p.right - p.left >= width * 0.9 || p.bottom - p.top >= height * 0.9;
  if (spansSheet(part)) {
    // Grid lines connected to a figure can make the whole sheet one component.
    // Only in that case break narrow bridges, then restore the original edge
    // pixels locally. Normal isolated subjects never undergo erosion.
    const limit = Math.max(1, Math.min(10, Math.ceil(Math.min(width, height) / 240)));
    radius = Math.max(1, Math.min(3, Math.round(Math.min(width, height) / 500)));
    while (true) {
      result = labelMask(morph(mask, width, height, radius, false), width, height);
      part = selectPart(result, width, height, point);
      if (!part || !spansSheet(part) || radius === limit) break;
      radius = Math.min(limit, radius * 2);
    }
    if (!part || spansSheet(part)) throw Error('背景线条与主体相连，请使用吸附套索；原有结果未改动。');
  }
  let selected = Uint8Array.from(result.labels, value => Number(value === part.id));
  // Fill clothing before expanding the edge. Expanding first can reconnect
  // tiny grid remnants into closed cells and accidentally fill those with paper.
  selected = fillInterior(selected, width, height);
  if (radius) {
    const interior = selected;
    selected = morph(interior, width, height, radius, true);
    for (let p = 0; p < selected.length; p++) selected[p] &= mask[p] | interior[p];
  }
  const count = selected.reduce((sum, value) => sum + value, 0);
  if (count < Math.max(20, mask.length * 0.005) || count > mask.length * 0.88)
    throw Error('无法可靠分离主体，请使用吸附套索；原有结果未改动。');
  const output = Buffer.from(pixels);
  for (let p = 0; p < selected.length; p++) if (!selected[p]) output.fill(0, p * 4, p * 4 + 4);
  return { pixels: output, width, height };
}
