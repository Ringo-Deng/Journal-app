export type SnapRect = { x: number; y: number; w: number; h: number };
export type SnapTargets = { x: number[]; y: number[] };
export type SnapGuides = { x?: number; y?: number };

const uniqueSorted = (values: number[]) =>
  [...new Set(values.map(value => Math.round(value * 1000) / 1000))].sort((a, b) => a - b);

export function buildSnapTargets(
  canvasW: number,
  canvasH: number,
  others: SnapRect[],
): SnapTargets {
  const x = [0, canvasW * 0.25, canvasW * 0.5, canvasW * 0.75, canvasW];
  const y = [0, canvasH * 0.5, canvasH];
  for (const box of others) {
    x.push(box.x, box.x + box.w / 2, box.x + box.w);
    y.push(box.y, box.y + box.h / 2, box.y + box.h);
  }
  return { x: uniqueSorted(x), y: uniqueSorted(y) };
}

function bestDelta(anchors: number[], targets: number[], threshold: number) {
  let result: { delta: number; guide: number } | undefined;
  for (const anchor of anchors) {
    for (const target of targets) {
      const delta = target - anchor;
      if (Math.abs(delta) > threshold) continue;
      if (!result || Math.abs(delta) < Math.abs(result.delta)) result = { delta, guide: target };
    }
  }
  return result;
}

export function snapMoveBox(
  box: SnapRect,
  targets: SnapTargets,
  threshold = 6,
): { box: SnapRect; guides: SnapGuides } {
  const horizontal = bestDelta([box.x, box.x + box.w / 2, box.x + box.w], targets.x, threshold);
  const vertical = bestDelta([box.y, box.y + box.h / 2, box.y + box.h], targets.y, threshold);
  const guides: SnapGuides = {};
  if (horizontal) guides.x = horizontal.guide;
  if (vertical) guides.y = vertical.guide;
  return {
    box: {
      ...box,
      x: box.x + (horizontal?.delta ?? 0),
      y: box.y + (vertical?.delta ?? 0),
    },
    guides,
  };
}
