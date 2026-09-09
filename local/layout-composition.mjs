import {estimatedHeight} from '../lib/layout-safety.mjs';

export const compositionGuide = `preset 选择 quiet（日记留白）、photo-led（大照片配文）、photo-story（多照片故事）、travel-notes（旅行票据）、long-read（长文双栏）或 free（明确指定的位置、特殊构图或锁定组合）。primarySide 为 left 或 right，指主要视觉所在页。density 默认为 rich（丰富叠贴），也可为 balanced 或 sparse（仅用户明确要求极简时）。不要为了用某种构图而新增文字或照片。`;
const presets = new Set(['quiet', 'photo-led', 'photo-story', 'travel-notes', 'long-read']);

// Regions describe a composition, not fixed text boxes. Heights follow content.
export function resolveComposition(brief = {}, input = {}) {
  const preset = (input.elements || []).some(p => p.locked || p.groupId) ? 'free' : presets.has(brief?.preset) ? brief.preset : 'free';
  const primarySide = brief?.primarySide === 'right' ? 'right' : 'left';
  const density = ['sparse', 'balanced', 'rich'].includes(brief?.density) ? brief.density : 'rich';
  const region = (id, x, y, w, h, accepts) => ({id, x: primarySide === 'right' ? 100 - x - w : x, y, w, h, accepts});
  const regions = {
    quiet: [region('writing', 9, 15, 32, 71, 'text'), region('continuation', 59, 34, 32, 52, 'text')],
    'photo-led': [region('hero', 6, 15, 38, 70, 'photo'), region('writing', 57, 13, 36, 73, 'text')],
    'photo-story': [region('hero', 6, 12, 38, 42, 'photo'), region('photos', 57, 18, 36, 39, 'photo'), region('writing', 8, 62, 36, 25, 'text'), region('continuation', 57, 65, 36, 22, 'text')],
    'travel-notes': [region('writing', 7, 13, 34, 73, 'text'), region('story', 57, 23, 36, 63, 'content')],
    'long-read': [region('writing', 7, 11, 36, 77, 'text'), region('continuation', 57, 11, 36, 77, 'text')],
  }[preset] || [];
  return {preset, primarySide, density, regions};
}

export function composeContent(elements, input, composition) {
  const result = elements.map(p => ({...p}));
  const ratio = Number.isFinite(input.ratio) ? Math.max(.6, Math.min(2.5, input.ratio)) : 1.43;
  if (!composition.regions.length) return result.map(({region: _region, ...p}) => p.kind === 'text' && Number.isFinite(p.h) ? {...p, h: estimatedHeight({...p, h: 0}, ratio)} : p);
  const assignments = new Map(composition.regions.map(r => [r.id, []]));
  const content = result.filter(p => p.kind === 'photo' || p.kind === 'text');
  const eligible = p => composition.regions.filter(r => r.accepts === 'content' || r.accepts === p.kind);
  for (const p of content) {
    const options = eligible(p);
    const requested = options.find(r => r.id === p.region);
    const target = requested || (p.kind === 'photo' ? options.find(r => !assignments.get(r.id).length) : options[0]) || options[0];
    if (!target) throw Object.assign(Error('这个构图无法容纳当前内容，请改选适合照片与文字的构图。'), {retryHint: '保留所有内容，视觉方案不合适时使用 layoutOverride="free" 并返回完整自由构图。'});
    assignments.get(target.id).push(p);
  }
  for (const r of composition.regions) {
    const pieces = assignments.get(r.id);
    const photos = pieces.filter(p => p.kind === 'photo');
    let cursor = r.y;
    if (photos.length) {
      const columns = photos.length > 1 ? 2 : 1;
      const rows = Math.ceil(photos.length / columns);
      const cellW = (r.w - (columns - 1) * 3) / columns;
      const cellH = Math.min(photos.length === pieces.length ? r.h : r.h * .5, rows * 55) / rows - 3;
      for (let i = 0; i < photos.length; i++) {
        const p = photos[i];
        const source = (input.elements || []).find(s => s.id === p.sourceId);
        const reference = source?.w ? source : p;
        const aspect = estimatedHeight(reference, ratio) / reference.w;
        const w = Math.min(cellW, cellH / aspect);
        Object.assign(p, {x: r.x + (i % columns) * (cellW + 3), y: r.y + Math.floor(i / columns) * (cellH + 3), w, h: w * aspect, rotation: 0});
      }
      cursor = Math.max(...photos.map(p => p.y + p.h)) + 5;
    }
    // Model order within a region carries the reading order; never split or rewrite a paragraph.
    const overflow = [];
    const writing = pieces.filter(p => p.kind === 'text');
    for (let i = 0; i < writing.length; i++) {
      const p = writing[i];
      const candidate = {...p, w: r.w, h: 0, rotation: 0};
      const h = estimatedHeight(candidate, ratio);
      const following = p.role === 'title' && writing[i + 1] ? 5 + estimatedHeight({...writing[i + 1], w: r.w, h: 0, rotation: 0}, ratio) : 0;
      if (overflow.length || cursor + h + following > r.y + r.h) { overflow.push(p); continue; }
      Object.assign(p, {x: r.x, y: cursor, w: r.w, h, rotation: 0});
      cursor += h + (p.role === 'title' ? 5 : input.requirements?.stickers ? 14 : 4);
    }
    if (overflow.length) {
      const next = composition.regions.slice(composition.regions.indexOf(r) + 1).find(q => q.accepts === 'content' || q.accepts === 'text');
      if (next) assignments.set(next.id, [...overflow, ...assignments.get(next.id)]);
      else throw Object.assign(Error('当前跨页文字或照片过多，无法在保持字号的情况下排下。'), {retryHint: '不要删内容或缩小正文硬塞。可以用 layoutOverride="free" 扩大正文区域，减少装饰；仍不足则需要更多跨页。'});
    }
  }
  return result.map(({region: _region, ...p}) => p);
}
