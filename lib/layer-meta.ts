import type { Piece } from './journal';

export type LayerMeta = {
  hidden?: boolean;
  layerName?: string;
  groupName?: string;
};

export type LayerPiece = Piece & LayerMeta;

export function layerMeta(piece: Piece): LayerPiece {
  return piece as LayerPiece;
}

export function isPieceHidden(piece: Piece): boolean {
  return layerMeta(piece).hidden === true;
}

export function pieceLayerName(piece: Piece): string | undefined {
  const name = layerMeta(piece).layerName?.trim();
  return name || undefined;
}

export function pieceGroupName(piece: Piece): string | undefined {
  const name = layerMeta(piece).groupName?.trim();
  return name || undefined;
}

export function withLayerMeta(piece: Piece, patch: LayerMeta): Piece {
  return { ...piece, ...patch } as Piece;
}

export function reorderLayerBlock<T extends { id: string; groupId?: string }>(
  items: T[],
  memberIds: Iterable<string>,
  action: 'top' | 'bottom' | 'up' | 'down',
): T[] {
  const ids = new Set(memberIds);
  const selected = items.filter((item) => ids.has(item.id));
  if (!selected.length || selected.length === items.length) return items;

  const rest = items.filter((item) => !ids.has(item.id));
  const seenGroups = new Set<string>();
  const blocks: T[][] = [];

  for (const item of rest) {
    if (item.groupId) {
      if (seenGroups.has(item.groupId)) continue;
      seenGroups.add(item.groupId);
      blocks.push(rest.filter((candidate) => candidate.groupId === item.groupId));
    } else {
      blocks.push([item]);
    }
  }

  // The layer panel keeps the legacy up/down callback names, but those controls now mean top/bottom.
  const target = action === 'top' || action === 'up' ? blocks.length : 0;
  return [...blocks.slice(0, target).flat(), ...selected, ...blocks.slice(target).flat()];
}
