import type { Piece } from './journal';
import {reorderStack,type StackAction} from './stack-order';

export type LayerMeta = {
  hidden?: boolean;
  layerName?: string;
  groupName?: string;
  stackOrder?: number;
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

export function reorderLayerBlock<T extends { id: string; groupId?: string; stackOrder?: number }>(
  items: T[],
  memberIds: Iterable<string>,
  action: StackAction,
): T[] {
  // The compact panel still exposes legacy onUp/onDown callback names.
  // Those buttons are now edge actions on the journal canvas, not list reordering.
  const canvasAction = action === 'up' ? 'top' : action === 'down' ? 'bottom' : action;
  return reorderStack(items, memberIds, canvasAction);
}
