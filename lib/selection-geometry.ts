export type SelectionPoint = { x: number; y: number };

export type SelectionRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type SelectionGeometryItem = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  groupId?: string;
  locked?: boolean;
  hidden?: boolean;
};

export function selectionRect(start: SelectionPoint, end: SelectionPoint): SelectionRect {
  return {
    left: Math.min(start.x, end.x),
    top: Math.min(start.y, end.y),
    right: Math.max(start.x, end.x),
    bottom: Math.max(start.y, end.y),
  };
}

export function selectionRectSize(rect: SelectionRect) {
  return { width: rect.right - rect.left, height: rect.bottom - rect.top };
}

export function idsInSelectionRect(
  items: SelectionGeometryItem[],
  rect: SelectionRect,
  editingGroup: string | null = null,
) {
  const available = items.filter(
    (item) => !item.hidden && !item.locked && (editingGroup ? item.groupId === editingGroup : true),
  );
  const directlyHit = available.filter((item) => {
    const centerX = item.x + item.w / 2;
    const centerY = item.y + item.h / 2;
    return (
      centerX >= rect.left && centerX <= rect.right && centerY >= rect.top && centerY <= rect.bottom
    );
  });

  if (editingGroup) return directlyHit.map((item) => item.id);

  const unavailableGroups = new Set(
    items
      .filter((item) => item.groupId && (item.hidden || item.locked))
      .map((item) => item.groupId!),
  );
  const hitGroups = new Set(
    directlyHit
      .map((item) => item.groupId)
      .filter((groupId): groupId is string => !!groupId && !unavailableGroups.has(groupId)),
  );
  const directIds = new Set(directlyHit.filter((item) => !item.groupId).map((item) => item.id));

  return available
    .filter((item) => directIds.has(item.id) || (!!item.groupId && hitGroups.has(item.groupId)))
    .map((item) => item.id);
}

export function mergeSelection(current: string[], incoming: string[], toggle: boolean) {
  if (!toggle) return [...new Set(incoming)];
  const next = new Set(current);
  const incomingIsSelected = incoming.length > 0 && incoming.every((id) => next.has(id));
  for (const id of incoming) {
    if (incomingIsSelected) next.delete(id);
    else next.add(id);
  }
  return [...next];
}

export function selectionBounds(items: SelectionGeometryItem[]): SelectionGeometryItem | null {
  if (!items.length) return null;
  const left = Math.min(...items.map((item) => item.x));
  const top = Math.min(...items.map((item) => item.y));
  const right = Math.max(...items.map((item) => item.x + item.w));
  const bottom = Math.max(...items.map((item) => item.y + item.h));
  return { id: "selection", x: left, y: top, w: right - left, h: bottom - top };
}

export function clampSelectionMove(
  items: SelectionGeometryItem[],
  delta: SelectionPoint,
  canvas: { width: number; height: number },
  minimumVisible = 28,
) {
  const bounds = selectionBounds(items);
  if (!bounds) return { x: 0, y: 0 };
  const minimumX = minimumVisible - (bounds.x + bounds.w);
  const maximumX = canvas.width - minimumVisible - bounds.x;
  const minimumY = minimumVisible - (bounds.y + bounds.h);
  const maximumY = canvas.height - minimumVisible - bounds.y;
  return {
    x: Math.max(minimumX, Math.min(maximumX, delta.x)),
    y: Math.max(minimumY, Math.min(maximumY, delta.y)),
  };
}
