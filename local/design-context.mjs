import {bounds, intersects} from '../lib/layout-safety.mjs';
import {isEmptyTextHint} from './editorial.mjs';

const fail = (message, code = 'design_source') => Object.assign(Error(message), {code});
const backing = p => p.assetId === 'collage-paper' || p.frame === 'collage-paper' || p.kind === 'doodle' && p.frame === 'vellum-sheet';
const visible = p => p.hidden !== true;
const clone = p => ({...p});

/** Keep user-selected materials and groups outside the model's rewriteable source list. */
export function prepareDesignContext(input) {
  const sources = (input.elements || []).map(clone);
  const ids = sources.map(p => p.id);
  if (ids.some(id => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length)
    throw fail('当前页面的元素引用不完整，请重新打开页面。');
  const grouped = new Map();
  for (const p of sources) {
    const key = p.groupId ? `group:${p.groupId}` : `piece:${p.id}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(p);
  }
  const editable = [], fixed = [], movableUnits = [];
  for (const [id, elements] of grouped) {
    if (elements.some(p => p.locked || p.hidden === true)) fixed.push(...elements);
    else if (elements.some(p => p.groupId) || elements.some(p => !['text', 'photo'].includes(p.kind) || isEmptyTextHint(p)))
      movableUnits.push({id, elements});
    else editable.push(...elements);
  }
  const ratio = Number.isFinite(input.ratio) ? Math.max(.6, Math.min(2.5, input.ratio)) : 1.43;
  const preservedUnits = movableUnits.map(unit => ({
    id: unit.id, sourceIds: unit.elements.map(p => p.id), movable: true,
    ...envelope(unit.elements.filter(visible).map(p => bounds(p, ratio))),
  }));
  return {sources, editable, fixed, movableUnits, ratio, header: Math.max(3, Number(input.headerSpace) || 3),
    input: {...input, preservedUnits, elements: [...editable.map(clone), ...fixed.map(p => ({...p, locked: true}))]},
  };
}

function envelope(boxes) {
  if (!boxes.length) return {x: 0, y: 0, w: 0, h: 0};
  const x = Math.min(...boxes.map(b => b.x)), y = Math.min(...boxes.map(b => b.y));
  return {x, y, w: Math.max(...boxes.map(b => b.x + b.w)) - x, h: Math.max(...boxes.map(b => b.y + b.h)) - y};
}

function requestedSide(instruction = '') {
  // A paragraph-specific position must not silently move every retained group.
  let side = null;
  for (const clause of String(instruction).split(/[，。！？;；\n]/).map(s => s.trim())) {
    if (/不要|不用|不必|不能|不需要|不想|别|禁止|避免|(?:左页|右页)(?:以外|之外)/.test(clause)) continue;
    const request = clause.match(/(?:整组|整个组合|全部内容|所有元素|这一组|这组)[^，。！？;\n]{0,18}(左页|右页)/)
      || clause.match(/^(?:请)?(?:放|移|摆|换)(?:到|在|至)?(左页|右页)\s*$/);
    if (request) side = request[1] === '右页' ? 50 : 0;
  }
  return side;
}

function wantsComposition(input) {
  const text = String(input.instruction || '');
  const clauses = text.split(/[，。！？;；\n]/);
  // A broad button intent must never override a request to keep positions or edit one detail.
  if (clauses.some(clause => /不要|不用|不必|不想|别|避免/.test(clause) && /位置|移动|挪|重排|排版|重新设计|整理|左页|右页/.test(clause))) return false;
  if (/(?:保持|维持)(?:原位|位置|原样|现状)|(?:位置|排布|布局)[^，。！？;；\n]{0,8}(?:不变|不动|不改)|(?:左页|右页)(?:以外|之外)|(?:只|仅|单独)[^，。！？;；\n]{0,8}(?:标题|正文|文字|这段|这一段|段落|照片|贴纸|素材|颜色|字体|字号)/.test(text)) return false;
  const globalScope = /整个跨页|这一跨页|当前跨页|整页|整个页面|全页|整体|全部内容|所有元素/;
  if (!globalScope.test(text) && /标题|正文|文字|这段|这一段|段落|照片|贴纸|字体|字号|颜色|日期|图注|单个|这张/.test(text)) return false;
  if (input.layoutIntent === 'compose') return true;
  return clauses.some(clause => {
    if (/不要|不用|不必|不想|别|避免/.test(clause)) return false;
    if (/换(?:个|一种|一?个)?感觉|多(?:一)?点留白/.test(clause)) return true;
    if (/(?:重新设计|重新排版|重新整理|重排|整理)/.test(clause)) {
      if (/整个跨页|这一跨页|当前跨页|整页|整个页面|全页|整体/.test(clause)) return true;
      return /^(?:请)?(?:帮我)?(?:重新设计|重新排版|重新整理|重排)(?:一下)?\s*$/.test(clause.trim());
    }
    return false;
  });
}

function compositionTargets(units, context, side) {
  const related = (a, b) => intersects(a.box, b.box) && a.items.some(i => b.items.some(j => (backing(i.p) || backing(j.p)) && intersects(i.box, j.box)));
  const clusters = [];
  // A paper and the original writing on it remain one temporary layout unit even without groupId.
  for (const unit of units) {
    let cluster = unit;
    for (let i = 0; i < clusters.length;) {
      if (!related(cluster, clusters[i])) { i++; continue; }
      const [other] = clusters.splice(i, 1);
      cluster = layoutUnit(cluster.id, [...cluster.elements, ...other.elements], context, true);
      i = 0;
    }
    clusters.push(cluster);
  }
  const ordered = clusters.sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h);
  const primary = side ?? (ordered[0]?.box.x >= 50 ? 50 : 0);
  return ordered.map((unit, index) => {
    const targetSide = side ?? (index % 2 ? 50 - primary : primary);
    const x = unit.box.w > 46 ? 50 - unit.box.w / 2 : targetSide + 25 - unit.box.w / 2;
    const y = Math.max(context.header, Math.min(97 - unit.box.h, context.header + (index % 2 ? 32 : 18) + Math.floor(index / 2) * 18));
    return layoutUnit(unit.id, unit.elements.map(p => ({...p, x: p.x + x - unit.box.x, y: p.y + y - unit.box.y})), context, true);
  });
}

function unchangedDesign(elements, sources) {
  if (elements.length !== sources.length) return false;
  const withoutReference = p => { const {sourceId: _sourceId, ...rest} = p; return rest; };
  return elements.every((p, index) => {
    const original = sources[index];
    if (original.id !== p.sourceId) return false;
    const updated = {...original, ...p};
    for (const coordinate of ['x', 'y']) if (Math.abs(updated[coordinate] - original[coordinate]) < 1e-8) updated[coordinate] = original[coordinate];
    return JSON.stringify(withoutReference(updated)) === JSON.stringify(withoutReference(original));
  });
}

function layoutUnit(id, elements, context, source) {
  const items = elements.filter(visible).map(p => {
    const original = context.sources.find(s => s.id === (p.sourceId || p.id));
    return {p, box: bounds(p, context.ratio), original, originalBox: original && bounds(original, context.ratio)};
  });
  return {id, elements, items, box: envelope(items.map(i => i.box)), source};
}

function conflicts(unit, dx, dy, placed) {
  for (const item of unit.items) {
    const box = {...item.box, x: item.box.x + dx, y: item.box.y + dy};
    for (const other of placed) for (const target of other.items) {
      // Reflowing original text does not sever its existing backing-paper relationship.
      if (item.original && target.original && (backing(item.original) || backing(target.original)) && (backing(item.p) || backing(target.p)) && intersects(item.originalBox, target.originalBox)) continue;
      // Existing paper/lettering and purely decorative overlaps are intentional.
      if (unit.source && other.source && (backing(item.p) || backing(target.p) || item.p.kind !== 'text' && target.p.kind !== 'text' && !(item.p.kind === 'photo' && target.p.kind === 'photo'))) continue;
      if (intersects(box, target.box, 1)) return true;
    }
  }
  return false;
}

function safe(unit, dx, dy, placed, context, side) {
  for (const {p, box} of unit.items) {
    const x = box.x + dx, y = box.y + dy;
    if (x < 2 - 1e-8 || x + box.w > 98 + 1e-8 || y < context.header - 1e-8 || y + box.h > 97 + 1e-8) return false;
    if (p.kind === 'text' && x < 51 && x + box.w > 49) return false;
    if (side !== null && (x < side + 2 - 1e-8 || x + box.w > side + 48 + 1e-8)) return false;
  }
  return !conflicts(unit, dx, dy, placed);
}

function place(unit, placed, context, side = null) {
  if (!unit.items.length || safe(unit, 0, 0, placed, context, side)) return unit;
  const {x, y, w, h} = unit.box;
  const xs = new Set([x, 2, 49 - w, 51, 98 - w]), ys = new Set([y, context.header, 97 - h]);
  // Obstacle edges cover narrow gaps the coarse fallback grid may otherwise miss.
  for (const other of placed) for (const {box} of other.items) {
    xs.add(box.x - w - 1); xs.add(box.x + box.w + 1);
    ys.add(box.y - h - 1); ys.add(box.y + box.h + 1);
  }
  for (let px = 2; px + w <= 98; px += 2) xs.add(px);
  for (let py = context.header; py + h <= 97; py += 2) ys.add(py);
  const candidates = [];
  // At most 4096 positions per unit, including exact nearby obstacle boundaries.
  const orderedX = [...xs].filter(px => px >= 2 && px + w <= 98 && (side === null || px >= side + 2 && px + w <= side + 48)).sort((a, b) => Math.abs(a - x) - Math.abs(b - x)).slice(0, 64);
  const orderedY = [...ys].filter(py => py >= context.header && py + h <= 97).sort((a, b) => Math.abs(a - y) - Math.abs(b - y)).slice(0, 64);
  for (const px of orderedX) for (const py of orderedY) {
    candidates.push({dx: px - x, dy: py - y});
  }
  candidates.sort((a, b) => Math.hypot(a.dx, a.dy / context.ratio) - Math.hypot(b.dx, b.dy / context.ratio));
  const move = candidates.find(({dx, dy}) => safe(unit, dx, dy, placed, context, side));
  if (!move) return null;
  return layoutUnit(unit.id, unit.elements.map(p => ({...p, x: p.x + move.dx, y: p.y + move.dy})), context, unit.source);
}

/** Merge a checked AI plan with original materials. Only whole retained units may translate. */
export function finishDesignContext(elements, context) {
  if (!Array.isArray(elements)) throw fail('AI 未返回完整的页面设计。');
  const sourceIds = new Set(context.sources.map(p => p.id));
  const retained = new Set([...context.fixed, ...context.movableUnits.flatMap(u => u.elements)].map(p => p.id));
  const generated = [];
  for (const p of elements) {
    if (p.sourceId && !sourceIds.has(p.sourceId)) throw fail('AI 引用了不属于当前页面的元素。');
    if (!retained.has(p.sourceId)) generated.push(clone(p));
  }
  for (const p of context.editable) {
    if (generated.filter(q => q.sourceId === p.id && q.kind === p.kind).length !== 1 || generated.filter(q => q.sourceId === p.id).length !== 1)
      throw fail('AI 设计遗漏或重复了原有文字或照片，请重试。');
  }
  const fixed = layoutUnit('fixed', context.fixed.map(p => ({...p, sourceId: p.id})), context, true);
  const originalUnits = context.movableUnits.map(u => layoutUnit(u.id, u.elements.map(p => ({...p, sourceId: p.id})), context, true));
  const fresh = layoutUnit('generated', generated, context, false);
  const side = requestedSide(context.input.instruction);
  const largeFirst = [...originalUnits].sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h);
  // First keep the checked design as placed; the fallback instead preserves existing units first.
  const orders = [[fresh, ...originalUnits], [fresh, ...largeFirst], [...originalUnits, fresh], [...largeFirst, fresh]];
  // Existing groups already form complete designs: give an explicit whole-page request a real goal.
  if (!generated.length && wantsComposition(context.input)) orders.unshift([...compositionTargets(originalUnits, context, side), fresh]);
  for (const units of orders) {
    const placed = [fixed];
    let failed = false;
    for (const unit of units) {
      const result = place(unit, placed, context, unit.source ? side : null);
      if (!result) { failed = true; break; }
      placed.push(result);
    }
    if (failed) continue;
    const positions = new Map(placed.flatMap(u => u.elements).filter(p => p.sourceId).map(p => [p.sourceId, p]));
    const movedGenerated = placed.find(u => u.id === 'generated').elements;
    // Insert retained layers before their next original source, preserving existing paper/text order.
    const result = [...movedGenerated];
    let previousRetained = -1;
    for (let i = 0; i < context.sources.length; i++) {
      const p = context.sources[i];
      if (!retained.has(p.id)) continue;
      const next = context.sources.slice(i + 1).find(q => !retained.has(q.id));
      const anchor = next ? result.findIndex(q => q.sourceId === next.id) : result.length;
      const index = Math.max(previousRetained + 1, anchor < 0 ? result.length : anchor);
      result.splice(index, 0, positions.get(p.id));
      previousRetained = index;
    }
    return {elements: result, headerReserved: true, unchanged: unchangedDesign(result, context.sources)};
  }
  throw Object.assign(fail('当前内容暂时无法在跨页内安全排下，请减少新增装饰或换到空白跨页。', 'design_space'), {
    retryHint: '保留全部原文、照片和已选素材，缩小或减少新增装饰，为保留的素材组合留出空间。',
  });
}
