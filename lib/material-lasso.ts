export type LassoPoint = [number, number];

export type LassoRaster = {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
};

const clamp = (value: number) => Math.max(0, Math.min(1, value));

function distance(a: LassoPoint, b: LassoPoint) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

export function normalizeLassoPoints(value: unknown, maximum = 260): LassoPoint[] {
  if (!Array.isArray(value)) return [];
  const points: LassoPoint[] = [];
  for (const candidate of value) {
    if (!Array.isArray(candidate) || candidate.length !== 2) continue;
    const x = Number(candidate[0]), y = Number(candidate[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const point: LassoPoint = [clamp(x), clamp(y)];
    if (!points.length || distance(points.at(-1)!, point) >= 0.0015) points.push(point);
  }
  if (points.length > 2 && distance(points[0], points.at(-1)!) < 0.002) points.pop();
  if (points.length <= maximum) return points;
  return Array.from({length: maximum}, (_, index) =>
    points[Math.round(index * (points.length - 1) / (maximum - 1))],
  );
}

export function lassoBounds(value: unknown): [number, number, number, number] | null {
  const points = normalizeLassoPoints(value);
  if (points.length < 6) return null;
  const xs = points.map(point => point[0]), ys = points.map(point => point[1]);
  const left = Math.min(...xs), top = Math.min(...ys), right = Math.max(...xs), bottom = Math.max(...ys);
  if (right - left < 0.01 || bottom - top < 0.01) return null;
  let twiceArea = 0;
  for (let index = 0; index < points.length; index++) {
    const current = points[index], next = points[(index + 1) % points.length];
    twiceArea += current[0] * next[1] - next[0] * current[1];
  }
  if (Math.abs(twiceArea) / 2 < 0.0001) return null;
  return [left, top, right - left, bottom - top];
}

function channel(raster: LassoRaster, x: number, y: number, offset: number) {
  const px = Math.max(0, Math.min(raster.width - 1, Math.round(x)));
  const py = Math.max(0, Math.min(raster.height - 1, Math.round(y)));
  return raster.data[(py * raster.width + px) * 4 + offset] || 0;
}

function luminance(raster: LassoRaster, x: number, y: number) {
  return channel(raster, x, y, 0) * 0.299 + channel(raster, x, y, 1) * 0.587 + channel(raster, x, y, 2) * 0.114;
}

function edge(raster: LassoRaster, x: number, y: number) {
  const gx = luminance(raster, x + 1, y) - luminance(raster, x - 1, y);
  const gy = luminance(raster, x, y + 1) - luminance(raster, x, y - 1);
  const ax = channel(raster, x + 1, y, 3) - channel(raster, x - 1, y, 3);
  const ay = channel(raster, x, y + 1, 3) - channel(raster, x, y - 1, 3);
  return {gx, gy, strength: Math.hypot(gx, gy) + Math.hypot(ax, ay) * 0.8};
}

export function snapLassoToEdges(value: unknown, raster: LassoRaster, radius = 18) {
  const points = normalizeLassoPoints(value);
  if (!lassoBounds(points) || raster.width < 3 || raster.height < 3 || raster.data.length < raster.width * raster.height * 4)
    return {points, moved: 0};
  const searchRadius = Math.max(2, Math.min(32, Math.round(radius)));
  let moved = 0;
  const snapped = points.map((point, index): LassoPoint => {
    const previous = points[(index + points.length - 1) % points.length], next = points[(index + 1) % points.length];
    const tx = (next[0] - previous[0]) * raster.width, ty = (next[1] - previous[1]) * raster.height;
    const length = Math.hypot(tx, ty);
    if (length < 0.5) return point;
    const nx = -ty / length, ny = tx / length;
    const x = point[0] * (raster.width - 1), y = point[1] * (raster.height - 1);
    let bestOffset = 0, bestStrength = 0, bestScore = -Infinity;
    for (let offset = -searchRadius; offset <= searchRadius; offset++) {
      const sample = edge(raster, x + nx * offset, y + ny * offset);
      if (sample.strength < 18) continue;
      const gradientLength = Math.hypot(sample.gx, sample.gy);
      const alignment = gradientLength ? Math.abs((sample.gx * nx + sample.gy * ny) / gradientLength) : 1;
      const score = sample.strength * (0.4 + alignment * 0.6) - Math.abs(offset) * 1.35;
      if (score > bestScore) {
        bestScore = score;
        bestOffset = offset;
        bestStrength = sample.strength;
      }
    }
    if (bestStrength < 18) return point;
    if (Math.abs(bestOffset) >= 1) moved++;
    return [clamp((x + nx * bestOffset) / (raster.width - 1)), clamp((y + ny * bestOffset) / (raster.height - 1))];
  });
  return lassoBounds(snapped) ? {points: snapped, moved} : {points, moved: 0};
}
