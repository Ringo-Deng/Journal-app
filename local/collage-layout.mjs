import {bounds, estimatedHeight, intersects} from '../lib/layout-safety.mjs';
import {composeContent, resolveComposition} from './layout-composition.mjs';
import {isEditorialShape} from './editorial-shapes.mjs';

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
  const noShapes = /无装饰|不要(?:任何|任何的|所有)?装饰|no decoration/i.test(input.instruction || '');
  const kept = result.filter(p => {
    if (p.kind === 'text' || p.kind === 'photo' || protectedIds.has(p.sourceId)) return true;
    // Explicit paragraph stickers are requirements, not optional filler.
    const required = input.requirements?.stickers && p.forParagraph;
    if ((noDecorations || noShapes) && !required && (!isEditorialShape(p) || noShapes)) return false;
    const asset = assets.find(a => a.id === p.assetId);
    if (p.kind === 'asset' && asset?.width && asset?.height && !p.h) p.h = p.w * asset.height / asset.width * ratio;
    const target = content.find(t => t.sourceId && t.sourceId === p.forParagraph);
    const positions = [{x: p.x, y: p.y}];
    const backing = p.assetId === 'collage-paper';
    if (target && composition.preset !== 'free') {
      const box = bounds(target, ratio);
      const originalTarget = elements.find(t => t.sourceId === target.sourceId);
      // Keep each decoration's relative position in its cluster when content flows.
      if (originalTarget) positions.unshift({x: p.x + target.x - originalTarget.x, y: p.y + target.y - originalTarget.y});
      positions.push({x: box.x + box.w - p.w, y: box.y + box.h + 3}, {x: box.x, y: box.y - estimatedHeight(p, ratio) - 3});
    }
    const position = positions.find(pos => {
      const b = bounds({...p, ...pos}, ratio);
      if (required && target) {
        const t = textFootprint(target, ratio);
        if ((pos.x < 50) !== (target.x < 50) || Math.max(0, b.x - t.x - t.w, t.x - b.x - b.w) > 15 || Math.max(0, b.y - t.y - t.h, t.y - b.y - b.h) > 15) return false;
      }
      return b.x >= 2 && b.x + b.w <= 98 && b.y >= 3 && b.y + b.h <= 93 && !(b.x < 51 && b.x + b.w > 49) && (backing || !occupied.some(o => intersects(b, o, 1)));
    });
    if (!position) {
      if (required) throw Object.assign(Error('段落旁没有足够的贴纸空间，请调整构图。'), {retryHint: '缩小关联贴纸并为每段留出间距，不要移动或缩小正文来填装饰。'});
      return false;
    }
    Object.assign(p, position);
    if (backing) p.stackOrder = 1;
    // Decorative layers may overlap one another; only writing and photos reserve space.
    return true;
  });
  // Models sometimes omit association metadata even when the sticker is visibly beside the paragraph.
  if (input.requirements?.stickers) for (const text of content.filter(p => p.kind === 'text' && p.sourceId && (p.role === 'body' || Number.isInteger(p.paragraphIndex)))) {
    if (kept.some(p => p.forParagraph === text.sourceId)) continue;
    const t = textFootprint(text, ratio);
    const nearby = kept.filter(p => !p.forParagraph && p.kind === 'asset' && p.assetId !== 'collage-paper' && (p.x < 50) === (text.x < 50)).map(p => {
      const b = bounds(p, ratio);
      return {p, gapX: Math.max(0, b.x - t.x - t.w, t.x - b.x - b.w), gapY: Math.max(0, b.y - t.y - t.h, t.y - b.y - b.h)};
    }).filter(p => p.gapX <= 15 && p.gapY <= 15).sort((a, b) => a.gapX + a.gapY - b.gapX - b.gapY);
    if (nearby[0]) nearby[0].p.forParagraph = text.sourceId;
  }
  // Backing papers must remain below writing, including writing previously moved to the bottom.
  return [...kept.filter(p => p.assetId === 'collage-paper'), ...kept.filter(p => p.assetId !== 'collage-paper')];
}
