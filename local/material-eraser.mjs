import {
  mapMaterialSourceBounds,
  normalizeMaterialSourceBounds,
} from "../lib/material-source-bounds.mjs";

const MAX_STROKES = 300;
const MAX_POINTS = 12000;
export const MATERIAL_ERASER_TRIM_THRESHOLD = 2;

export function normalizeMaterialEraserStrokes(value) {
  if (!Array.isArray(value) || !value.length || value.length > MAX_STROKES) return null;
  let total = 0;
  const strokes = [];
  for (const stroke of value) {
    const size = Number(stroke?.size),
      points = stroke?.points;
    if (
      !Number.isFinite(size) ||
      size < 0.002 ||
      size > 0.5 ||
      !Array.isArray(points) ||
      !points.length ||
      points.length > 2000
    )
      return null;
    total += points.length;
    if (total > MAX_POINTS) return null;
    const normalized = [];
    for (const point of points) {
      if (!Array.isArray(point) || point.length !== 2) return null;
      const x = Number(point[0]),
        y = Number(point[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1)
        return null;
      normalized.push([x, y]);
    }
    strokes.push({ size, points: normalized });
  }
  return strokes;
}

const number = (value) => Number(value.toFixed(3));

export function materialEraserSvg(strokes, width, height) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 20000 ||
    height > 20000
  )
    throw Error("invalid material eraser size");
  const shortest = Math.min(width, height);
  const marks = strokes
    .map((stroke) => {
      const radius = (stroke.size * shortest) / 2,
        lineWidth = radius * 2;
      if (stroke.points.length === 1) {
        const [x, y] = stroke.points[0];
        return `<circle cx="${number(x * width)}" cy="${number(y * height)}" r="${number(radius)}" fill="#fff"/>`;
      }
      const path = stroke.points
        .map(([x, y], index) => `${index ? "L" : "M"}${number(x * width)} ${number(y * height)}`)
        .join(" ");
      return `<path d="${path}" fill="none" stroke="#fff" stroke-width="${number(lineWidth)}" stroke-linecap="round" stroke-linejoin="round"/>`;
    })
    .join("");
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${marks}</svg>`,
  );
}

export function erasedMaterialSourceBounds(
  item,
  { sourceWidth, sourceHeight, left, top, width, height },
) {
  const current =
    normalizeMaterialSourceBounds(item?.sourceBounds) ||
    normalizeMaterialSourceBounds(item?.bounds);
  if (!current) return null;
  if (
    ![sourceWidth, sourceHeight, left, top, width, height].every(Number.isFinite) ||
    sourceWidth < 1 ||
    sourceHeight < 1 ||
    left < 0 ||
    top < 0 ||
    width < 1 ||
    height < 1
  )
    return null;
  return mapMaterialSourceBounds(
    [left / sourceWidth, top / sourceHeight, width / sourceWidth, height / sourceHeight],
    current,
  );
}
