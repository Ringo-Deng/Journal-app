export type MaterialCutPoint = { x: number; y: number };
export type MaterialCutEdge = "straight" | "torn" | "wave" | "zigzag";

export type MaterialCutSplit = {
  masks: Uint8Array[];
  sizes: number[];
  changed: number;
  tooMany?: boolean;
};

export type MaterialCutBounds = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  count?: number;
};

export function materialCutVisibleMask(alpha: Uint8Array, width: number, height: number) {
  if (width < 1 || height < 1 || alpha.length !== width * height) return null;
  const mask = new Uint8Array(alpha.length);
  let visible = 0;
  for (let index = 0; index < alpha.length; index++)
    if (alpha[index] > 2) {
      mask[index] = 255;
      visible++;
    }
  return visible ? mask : null;
}

export function materialCutExportGeometry(
  bounds: MaterialCutBounds,
  workWidth: number,
  workHeight: number,
  naturalWidth: number,
  naturalHeight: number,
  maxSide: number,
) {
  const workCropWidth = Math.max(1, bounds.x1 - bounds.x0 + 1),
    workCropHeight = Math.max(1, bounds.y1 - bounds.y0 + 1),
    sourceX = (bounds.x0 / workWidth) * naturalWidth,
    sourceY = (bounds.y0 / workHeight) * naturalHeight,
    sourceWidth = (workCropWidth / workWidth) * naturalWidth,
    sourceHeight = (workCropHeight / workHeight) * naturalHeight,
    scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight)),
    width = Math.max(1, Math.round(sourceWidth * scale)),
    height = Math.max(1, Math.round(sourceHeight * scale));
  return {
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    workCropWidth,
    workCropHeight,
    width,
    height,
  };
}

export function materialCutPathLength(points: MaterialCutPoint[]) {
  let length = 0;
  for (let i = 1; i < points.length; i++)
    length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return length;
}

export function sampleMaterialCutPath(points: MaterialCutPoint[], spacing = 1.25) {
  if (points.length < 2) return points.map((point) => ({ ...point }));
  const result = [{ ...points[0] }];
  let remaining = spacing;
  for (let i = 1; i < points.length; i++) {
    let from = { ...points[i - 1] },
      to = points[i],
      length = Math.hypot(to.x - from.x, to.y - from.y);
    while (length >= remaining && length > 0) {
      const ratio = remaining / length;
      from = { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio };
      result.push(from);
      length = Math.hypot(to.x - from.x, to.y - from.y);
      remaining = spacing;
    }
    remaining -= length;
  }
  const end = points[points.length - 1],
    last = result[result.length - 1];
  if (Math.hypot(end.x - last.x, end.y - last.y) > 0.01) result.push({ ...end });
  return result;
}

export function materialCutTornWidthFactor(
  distance: number,
  total: number,
  seed: number,
  side: -1 | 1,
  closed: boolean,
) {
  const safeTotal = Math.max(1, total);
  const noise = (scale: number, salt: number) => {
    const count = closed ? Math.max(3, Math.round(safeTotal / scale)) : 0,
      position = closed ? (distance / safeTotal) * count : distance / scale,
      cell = Math.floor(position),
      mix = position - cell,
      smooth = mix * mix * (3 - 2 * mix),
      wrap = (value: number) => (closed ? ((value % count) + count) % count : value),
      value = (index: number) => {
        const raw = Math.sin(
            (wrap(index) + 1) * 12.9898 + seed * 23.417 + side * 37.719 + salt * 17.131,
          ) * 43758.5453,
          unit = raw - Math.floor(raw);
        return unit * 2 - 1;
      };
    return value(cell) * (1 - smooth) + value(cell + 1) * smooth;
  };
  const factor =
    0.84 +
    noise(31, 0.7) * 0.36 +
    noise(10.5, 2.3) * 0.27 +
    noise(4.2, 4.9) * 0.18 +
    noise(1.8, 8.1) * 0.11;
  return Math.max(0.32, Math.min(1.72, factor + side * 0.035));
}

export function styleMaterialCutPath(
  points: MaterialCutPoint[],
  edge: MaterialCutEdge,
  strength: number,
) {
  const sampled = sampleMaterialCutPath(points, 1.35);
  if (edge === "straight" || sampled.length < 3) return sampled;
  const lengths = [0];
  for (let i = 1; i < sampled.length; i++)
    lengths.push(
      lengths[i - 1] + Math.hypot(sampled[i].x - sampled[i - 1].x, sampled[i].y - sampled[i - 1].y),
    );
  const total = lengths[lengths.length - 1] || 1;
  return sampled.map((point, index) => {
    const before = sampled[Math.max(0, index - 2)],
      after = sampled[Math.min(sampled.length - 1, index + 2)];
    const dx = after.x - before.x,
      dy = after.y - before.y,
      length = Math.hypot(dx, dy) || 1,
      distance = lengths[index];
    const taper = Math.min(1, distance / 14, (total - distance) / 14),
      phase = distance / (18 + strength * 1.5);
    let offset = 0;
    if (edge === "wave") offset = Math.sin(phase * Math.PI * 2) * strength;
    else if (edge === "zigzag") offset = (1 - 4 * Math.abs((phase % 1) - 0.5)) * strength;
    else
      offset =
        (Math.sin(distance * 0.17) * 0.45 +
          Math.sin(distance * 0.91 + 1.2) * 0.32 +
          Math.sin(distance * 2.71) * 0.23) *
        strength;
    return {
      x: point.x - (dy / length) * offset * taper,
      y: point.y + (dx / length) * offset * taper,
    };
  });
}

function erasePath(
  mask: Uint8Array,
  width: number,
  height: number,
  path: MaterialCutPoint[],
  cutWidth: number,
) {
  const next = new Uint8Array(mask),
    radius = Math.max(0.75, cutWidth / 2),
    limit = Math.ceil(radius),
    samples = sampleMaterialCutPath(path, 0.65);
  let changed = 0;
  for (const point of samples) {
    const cx = Math.round(point.x),
      cy = Math.round(point.y);
    for (let dy = -limit; dy <= limit; dy++)
      for (let dx = -limit; dx <= limit; dx++) {
        if (dx * dx + dy * dy > radius * radius + 0.35) continue;
        const x = cx + dx,
          y = cy + dy;
        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        const at = y * width + x;
        if (next[at]) {
          next[at] = 0;
          changed++;
        }
      }
  }
  return { next, changed };
}

function exteriorMaterialCutMask(mask: Uint8Array, width: number, height: number) {
  const exterior = new Uint8Array(mask.length),
    queue = new Int32Array(mask.length);
  let read = 0,
    write = 0;
  const add = (index: number) => {
    if (index < 0 || index >= mask.length || mask[index] || exterior[index]) return;
    exterior[index] = 1;
    queue[write++] = index;
  };
  for (let x = 0; x < width; x++) {
    add(x);
    add((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y++) {
    add(y * width);
    add(y * width + width - 1);
  }
  while (read < write) {
    const current = queue[read++],
      x = current % width;
    if (x > 0) add(current - 1);
    if (x < width - 1) add(current + 1);
    if (current >= width) add(current - width);
    if (current < mask.length - width) add(current + width);
  }
  return exterior;
}

function materialCutEndpointAnchor(
  point: MaterialCutPoint,
  neighbor: MaterialCutPoint,
  baseMask: Uint8Array,
  currentMask: Uint8Array,
  exterior: Uint8Array,
  width: number,
  height: number,
  radius: number,
): "outside" | "barrier" | null {
  if (point.x < 0 || point.x >= width || point.y < 0 || point.y >= height) return "outside";
  const dx = point.x - neighbor.x,
    dy = point.y - neighbor.y,
    length = Math.hypot(dx, dy) || 1,
    nx = dx / length,
    ny = dy / length,
    limit = Math.max(2, Math.ceil(radius));
  for (let distance = 0; distance <= limit; distance++) {
    const x = Math.round(point.x + nx * distance),
      y = Math.round(point.y + ny * distance);
    if (x < 0 || x >= width || y < 0 || y >= height) return "outside";
    const index = y * width + x;
    if (exterior[index]) return "outside";
    if (!baseMask[index]) return "barrier";
  }
  const cx = Math.round(point.x),
    cy = Math.round(point.y);
  for (let oy = -limit; oy <= limit; oy++)
    for (let ox = -limit; ox <= limit; ox++) {
      if (ox * ox + oy * oy > limit * limit) continue;
      const x = cx + ox,
        y = cy + oy;
      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      const index = y * width + x;
      if (baseMask[index] && !currentMask[index]) return "barrier";
    }
  return null;
}

function extendMaterialCutEndpoint(
  point: MaterialCutPoint,
  neighbor: MaterialCutPoint,
  width: number,
  height: number,
  margin: number,
) {
  if (
    point.x <= -margin ||
    point.x >= width - 1 + margin ||
    point.y <= -margin ||
    point.y >= height - 1 + margin
  )
    return { ...point };
  const dx = point.x - neighbor.x,
    dy = point.y - neighbor.y,
    candidates: number[] = [];
  if (dx < -0.001) candidates.push((-margin - point.x) / dx);
  if (dx > 0.001) candidates.push((width - 1 + margin - point.x) / dx);
  if (dy < -0.001) candidates.push((-margin - point.y) / dy);
  if (dy > 0.001) candidates.push((height - 1 + margin - point.y) / dy);
  const distance = Math.min(...candidates.filter((value) => value > 0));
  return Number.isFinite(distance)
    ? { x: point.x + dx * distance, y: point.y + dy * distance }
    : { ...point };
}

function materialCutRegions(mask: Uint8Array, width: number) {
  const labels = new Int32Array(mask.length),
    queue = new Int32Array(mask.length),
    sizes: number[] = [];
  let count = 0;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start]) continue;
    count++;
    let read = 0,
      write = 1;
    queue[0] = start;
    labels[start] = count;
    while (read < write) {
      const current = queue[read++],
        x = current % width;
      const neighbors = [
        x > 0 ? current - 1 : -1,
        x < width - 1 ? current + 1 : -1,
        current >= width ? current - width : -1,
        current < mask.length - width ? current + width : -1,
      ];
      for (const at of neighbors)
        if (at >= 0 && mask[at] && !labels[at]) {
          labels[at] = count;
          queue[write++] = at;
        }
    }
    sizes.push(write);
  }
  return { labels, sizes };
}

function materialCutPlaneRegions(
  path: MaterialCutPoint[],
  width: number,
  height: number,
  cutWidth: number,
  existingBarrier?: Uint8Array,
) {
  const full = new Uint8Array(width * height).fill(255),
    open = erasePath(full, width, height, path, cutWidth).next;
  if (existingBarrier)
    for (let index = 0; index < open.length; index++)
      if (existingBarrier[index]) open[index] = 0;
  return materialCutRegions(open, width).labels;
}

export function splitMaterialCutMask(
  mask: Uint8Array,
  width: number,
  height: number,
  path: MaterialCutPoint[],
  options: { cutWidth?: number; maxPieces?: number; baseMask?: Uint8Array } = {},
): MaterialCutSplit {
  if (mask.length !== width * height || width < 1 || height < 1 || path.length < 2)
    return { masks: [], sizes: [], changed: 0 };
  const cutWidth = options.cutWidth ?? 2,
    { next, changed } = erasePath(mask, width, height, path, cutWidth);
  if (!changed) return { masks: [], sizes: [], changed: 0 };
  const maxPieces = options.maxPieces ?? 48;
  const baseMask = options.baseMask?.length === mask.length ? options.baseMask : mask,
    beforeComponents = materialCutRegions(mask, width),
    components = materialCutRegions(next, width),
    children = beforeComponents.sizes.map(() => new Set<number>());
  for (let index = 0; index < next.length; index++)
    if (next[index]) children[beforeComponents.labels[index] - 1].add(components.labels[index] - 1);
  if (!children.some((items) => items.size > 1))
    return { masks: [next], sizes: [next.reduce((sum, value) => sum + (value ? 1 : 0), 0)], changed };
  const first = path[0],
    last = path[path.length - 1],
    closed =
      path.length > 2 && Math.hypot(first.x - last.x, first.y - last.y) <= Math.max(2, cutWidth);
  let regionPath: MaterialCutPoint[];
  if (closed) regionPath = [...path, { ...first }];
  else {
    const exterior = exteriorMaterialCutMask(baseMask, width, height),
      firstAnchor = materialCutEndpointAnchor(
        first,
        path[1],
        baseMask,
        mask,
        exterior,
        width,
        height,
        cutWidth + 2,
      ),
      lastAnchor = materialCutEndpointAnchor(
        last,
        path[path.length - 2],
        baseMask,
        mask,
        exterior,
        width,
        height,
        cutWidth + 2,
      );
    if (!firstAnchor || !lastAnchor)
      return { masks: [next], sizes: [next.reduce((sum, value) => sum + (value ? 1 : 0), 0)], changed };
    const margin = Math.max(3, Math.ceil(cutWidth + 1));
    regionPath = [
      firstAnchor === "outside"
        ? extendMaterialCutEndpoint(first, path[1], width, height, margin)
        : { ...first },
      ...path,
      lastAnchor === "outside"
        ? extendMaterialCutEndpoint(last, path[path.length - 2], width, height, margin)
        : { ...last },
    ];
  }
  const existingBarrier = new Uint8Array(mask.length);
  for (let index = 0; index < mask.length; index++)
    if (baseMask[index] && !mask[index]) existingBarrier[index] = 255;
  const planeLabels = materialCutPlaneRegions(
      regionPath,
      width,
      height,
      cutWidth,
      existingBarrier,
    ),
    votes = components.sizes.map(() => new Map<number, number>()),
    centers = components.sizes.map(() => ({ x: 0, y: 0, count: 0 }));
  for (let index = 0; index < next.length; index++) {
    const component = components.labels[index] - 1,
      plane = planeLabels[index];
    if (component < 0) continue;
    centers[component].x += index % width;
    centers[component].y += Math.floor(index / width);
    centers[component].count++;
    if (plane) votes[component].set(plane, (votes[component].get(plane) || 0) + 1);
  }
  let componentGroups = votes.map((counts) => {
      let bestPlane = 1,
        bestCount = -1;
      for (const [plane, count] of counts)
        if (count > bestCount || (count === bestCount && plane < bestPlane)) {
          bestPlane = plane;
          bestCount = count;
      }
      return bestPlane;
    });
  const splitChildren = children.find((items) => items.size > 1)!;
  if (new Set([...splitChildren].map((component) => componentGroups[component])).size < 2) {
    const seeds = [...splitChildren];
    if (seeds.length > maxPieces) return { masks: [], sizes: [], changed, tooMany: true };
    componentGroups = centers.map((center, component) => {
      const seeded = seeds.indexOf(component);
      if (seeded >= 0) return seeded + 1;
      const x = center.x / Math.max(1, center.count),
        y = center.y / Math.max(1, center.count);
      let nearest = 0,
        nearestDistance = Number.POSITIVE_INFINITY;
      for (let index = 0; index < seeds.length; index++) {
        const seed = centers[seeds[index]],
          sx = seed.x / Math.max(1, seed.count),
          sy = seed.y / Math.max(1, seed.count),
          distance = (x - sx) ** 2 + (y - sy) ** 2;
        if (distance < nearestDistance) {
          nearest = index;
          nearestDistance = distance;
        }
      }
      return nearest + 1;
    });
  }
  const labelToPiece = new Map<number, number>(),
    masks: Uint8Array[] = [],
    sizes: number[] = [];
  for (let index = 0; index < next.length; index++) {
    if (!next[index]) continue;
    const component = components.labels[index] - 1,
      group = componentGroups[component];
    let piece = labelToPiece.get(group);
    if (piece === undefined) {
      piece = masks.length;
      if (piece >= maxPieces) return { masks: [], sizes: [], changed, tooMany: true };
      labelToPiece.set(group, piece);
      masks.push(new Uint8Array(next.length));
      sizes.push(0);
    }
    masks[piece][index] = 255;
    sizes[piece]++;
  }
  if (masks.length < 2)
    return { masks: [next], sizes: [next.reduce((sum, value) => sum + (value ? 1 : 0), 0)], changed };
  return { masks, sizes, changed };
}

export function materialCutMaskBounds(
  mask: Uint8Array,
  width: number,
  height: number,
  alpha?: Uint8Array,
) {
  let x0 = width,
    y0 = height,
    x1 = -1,
    y1 = -1,
    count = 0;
  for (let index = 0; index < mask.length; index++) {
    if (!mask[index] || (alpha && !alpha[index])) continue;
    const x = index % width,
      y = Math.floor(index / width);
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
    count++;
  }
  return count ? { x0, y0, x1, y1, count } : null;
}
