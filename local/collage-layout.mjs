import {bounds, estimatedHeight, intersects} from '../lib/layout-safety.mjs';
import {composeContent, resolveComposition} from './layout-composition.mjs';

export function textFootprint(p, ratio = 1.43) {
  const box = bounds(p, ratio);
  return {x: box.x - 1, y: box.y - 1, w: box.w + 2, h: box.h + 2};
}

// Only model-selected decorations are considered. Never fill whitespace from the library.
export function finishCollage(elements, input, assets, brief = {}) {
  const composition = resolveComposition(brief, input);
  const result = composeContent(elements, input, composition);
  const ratio = Number.isFinite(input.ratio) ? Math.max(.6, Math.min(2.5, input.ratio)) : 1.43;
  const locked = (input.elements || []).filter(p => p.locked);
  const protectedIds = new Set(locked.map(p => p.id));
  const content = result.filter(p => p.kind === 'text' || p.kind === 'photo');
  const occupied = [...content, ...locked].map(p => bounds(p, ratio));
  const noDecorations = /不要贴纸|无装饰|no stickers|no decoration/i.test(input.instruction || '');
  const limit = noDecorations ? 0 : composition.density === 'sparse' ? 2 : 4;
  let count = 0;
  return result.filter(p => {
    if (p.kind === 'text' || p.kind === 'photo' || protectedIds.has(p.sourceId)) return true;
    // Explicit paragraph stickers are requirements, not optional filler.
    const required = input.requirements?.stickers && p.forParagraph;
    if (!required && count >= limit) return false;
    const asset = assets.find(a => a.id === p.assetId);
    if (p.kind === 'asset' && asset?.width && asset?.height && !p.h) p.h = p.w * asset.height / asset.width * ratio;
    const target = content.find(t => t.sourceId && t.sourceId === p.forParagraph);
    const positions = [{x: p.x, y: p.y}];
    if (target && composition.preset !== 'free') {
      const box = bounds(target, ratio);
      positions.unshift({x: box.x + box.w - p.w, y: box.y + box.h + 3}, {x: box.x, y: box.y - estimatedHeight(p, ratio) - 3});
    }
    const position = positions.find(pos => {
      const b = bounds({...p, ...pos}, ratio);
      return b.x >= 2 && b.x + b.w <= 98 && b.y >= 3 && b.y + b.h <= 93 && !(b.x < 51 && b.x + b.w > 49) && !occupied.some(o => intersects(b, o, 1));
    });
    if (!position) {
      if (required) throw Object.assign(Error('段落旁没有足够的贴纸空间，请调整构图。'), {retryHint: '缩小关联贴纸并为每段留出间距，不要移动或缩小正文来填装饰。'});
      return false;
    }
    Object.assign(p, position);
    occupied.push(bounds(p, ratio));
    count++;
    return true;
  });
}
