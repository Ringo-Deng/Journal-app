const validNumber = (value) => Number.isFinite(Number(value));
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

function normalizedBounds(item, sourceWidth, sourceHeight) {
  if (item?.bounds !== undefined) {
    if (!Array.isArray(item.bounds) || item.bounds.length !== 4 || !item.bounds.every(validNumber)) return null;
    const [x, y, w, h] = item.bounds.map(Number);
    return x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= 1.001 && y + h <= 1.001 ? [x, y, w, h] : null;
  }
  const width = Number(item?.width), height = Number(item?.height);
  if (!(sourceWidth > 0 && sourceHeight > 0 && width > 0 && height > 0)) return null;
  return [0, 0, clamp(width / sourceWidth, 0, 1), clamp(height / sourceHeight, 0, 1)];
}

function partitionQuality(bounds) {
  if (bounds.length < 2 || bounds.length > 8) return 0;
  const horizontal = bounds.every(([x, , w]) => x <= 0.06 && x + w >= 0.94);
  const vertical = bounds.every(([, y, , h]) => y <= 0.06 && y + h >= 0.94);
  if (!horizontal && !vertical) return 0;
  const intervals = bounds
    .map(([x, y, w, h]) => horizontal ? [y, y + h] : [x, x + w])
    .sort((a, b) => a[0] - b[0]);
  let covered = 0, overlap = 0, end = 0;
  for (const [start, stop] of intervals) {
    if (stop <= start) continue;
    if (start < end) overlap += Math.min(end, stop) - start;
    covered += Math.max(0, stop - Math.max(start, end));
    end = Math.max(end, stop);
  }
  if (overlap > 0.08 || covered < 0.72) return 0;
  return clamp((covered - overlap) / 0.92, 0, 1);
}

function separationQuality(bounds) {
  if (bounds.length < 2 || bounds.length > 12) return 0;
  const meaningful = bounds.filter(([, , w, h]) => w * h >= 0.008 && w >= 0.035 && h >= 0.035);
  if (meaningful.length < 2) return 0;
  let disjointPairs = 0, pairs = 0;
  for (let i = 0; i < meaningful.length; i++) {
    for (let j = i + 1; j < meaningful.length; j++) {
      pairs++;
      const [ax, ay, aw, ah] = meaningful[i], [bx, by, bw, bh] = meaningful[j];
      const overlapX = Math.max(0, Math.min(ax + aw, bx + bw) - Math.max(ax, bx));
      const overlapY = Math.max(0, Math.min(ay + ah, by + bh) - Math.max(ay, by));
      if (overlapX * overlapY < Math.min(aw * ah, bw * bh) * 0.04) disjointPairs++;
    }
  }
  return pairs ? disjointPairs / pairs : 0;
}

export function summarizeMaterialCandidate(result) {
  const items = Array.isArray(result?.items) ? result.items : [];
  const sourceWidth = Number(result?.width), sourceHeight = Number(result?.height);
  const sourceArea = sourceWidth > 0 && sourceHeight > 0 ? sourceWidth * sourceHeight : 0;
  const areas = items.map((item) => Math.max(0, Number(item?.width) || 0) * Math.max(0, Number(item?.height) || 0));
  const bounds = items.map((item) => normalizedBounds(item, sourceWidth, sourceHeight)).filter(Boolean);
  const ratios = sourceArea ? areas.map((area) => area / sourceArea) : [];
  const largestRatio = ratios.length ? Math.max(...ratios) : 0;
  const tinyCount = sourceArea
    ? areas.filter((area) => area < sourceArea * 0.0025).length
    : items.filter((item) => Number(item?.width) < 16 || Number(item?.height) < 16).length;
  const fullFrame = items.length === 1 && (
    largestRatio >= 0.78 ||
    (bounds[0] && bounds[0][0] <= 0.035 && bounds[0][1] <= 0.035 && bounds[0][0] + bounds[0][2] >= 0.965 && bounds[0][1] + bounds[0][3] >= 0.965)
  );
  return {
    valid: items.length > 0 && items.every(item =>
      validNumber(item?.width) && Number(item.width) > 0 &&
      validNumber(item?.height) && Number(item.height) > 0 &&
      (item.bounds === undefined || normalizedBounds(item, sourceWidth, sourceHeight))),
    count: items.length,
    tinyCount,
    tinyShare: items.length ? tinyCount / items.length : 1,
    largestRatio,
    coverage: ratios.reduce((sum, value) => sum + value, 0),
    fullFrame,
    partitionQuality: bounds.length === items.length ? partitionQuality(bounds) : 0,
    separationQuality: bounds.length === items.length ? separationQuality(bounds) : 0,
  };
}

export function materialCandidateScore(result) {
  const summary = summarizeMaterialCandidate(result);
  if (!summary.valid) return -1000;
  let score = 60;
  if (summary.count <= 12) score += summary.count === 1 ? 4 : 12;
  else if (summary.count <= 30) score += 4;
  else score -= Math.min(28, (summary.count - 30) * 1.4);
  score -= Math.min(30, summary.tinyShare * 36);
  if (summary.fullFrame) score -= 12;
  if (summary.coverage > 1.7) score -= Math.min(16, (summary.coverage - 1.7) * 8);
  score += summary.partitionQuality * 24;
  score += summary.separationQuality * 12;
  return Math.round(score * 10) / 10;
}

export function materialFallbackModes(result) {
  const summary = summarizeMaterialCandidate(result);
  if (!summary.valid) return ['paper', 'ai'];
  if (summary.fullFrame) return ['panels', 'dense'];
  // A sheet with many complete stickers is healthy. Count alone is not evidence
  // of fragmentation and should not trigger two more native runs.
  if (summary.tinyShare >= 0.42) return ['paper', 'dense'];
  if (summary.count >= 2 && summary.count <= 24 && summary.largestRatio >= 0.58) return ['dense', 'paper'];
  return [];
}

function retainsSubjects(before, after) {
  if (summarizeMaterialCandidate(before).fullFrame) return true;
  // Native alpha counts are comparable across modes without counting the
  // transparent space inside bounding boxes as preserved material.
  const hasPixels = result => result.items.every(item =>
    Number.isFinite(item.foregroundPixels) && item.foregroundPixels > 0);
  if (hasPixels(before) && hasPixels(after)) {
    const total = result => result.items.reduce((sum, item) => sum + item.foregroundPixels, 0);
    if (total(after) < total(before) * 0.82) return false;
  }
  if (!before.items.every(item => Array.isArray(item.bounds)) || !after.items.every(item => Array.isArray(item.bounds))) return true;
  return before.items.every(item => {
    const [x, y, w, h] = item.bounds;
    const covered = after.items.reduce((sum, next) => {
      const [nx, ny, nw, nh] = next.bounds;
      return sum + Math.max(0, Math.min(x + w, nx + nw) - Math.max(x, nx)) *
        Math.max(0, Math.min(y + h, ny + nh) - Math.max(y, ny));
    }, 0);
    return covered >= w * h * 0.55;
  });
}

export function chooseMaterialCandidate(candidates, { minimumImprovement = 28 } = {}) {
  const valid = (Array.isArray(candidates) ? candidates : []).filter((candidate) => summarizeMaterialCandidate(candidate?.result).valid);
  if (!valid.length) return null;
  const primary = valid.find((candidate) => candidate?.primary) || valid[0];
  const ranked = valid.filter(candidate => candidate === primary || retainsSubjects(primary.result, candidate.result))
    .map((candidate) => ({ ...candidate, score: materialCandidateScore(candidate.result) })).sort((a, b) => b.score - a.score);
  const best = ranked[0];
  const primaryScore = materialCandidateScore(primary.result);
  if (best === primary || best.score < primaryScore + minimumImprovement) return { ...primary, score: primaryScore };
  return best;
}
