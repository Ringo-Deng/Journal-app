export function normalizeMaterialSourceBounds(value) {
  if (!Array.isArray(value) || value.length !== 4 || !value.every(number => Number.isFinite(Number(number)))) return null;
  const [x, y, width, height] = value.map(Number);
  if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1.001 || y + height > 1.001) return null;
  return [x, y, width, height];
}

export function mapMaterialSourceBounds(bounds, cropBounds) {
  const local = normalizeMaterialSourceBounds(bounds);
  if (!local) return null;
  if (cropBounds === undefined || cropBounds === null) return local;
  const crop = normalizeMaterialSourceBounds(cropBounds);
  if (!crop) return null;
  return normalizeMaterialSourceBounds([
    crop[0] + local[0] * crop[2],
    crop[1] + local[1] * crop[3],
    local[2] * crop[2],
    local[3] * crop[3],
  ]);
}
