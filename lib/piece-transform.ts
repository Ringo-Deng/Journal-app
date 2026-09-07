export type Box = {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
};
export const resizeHandles = [
  ['nw', '左上角缩放'],
  ['n', '上下拉伸（上边）'],
  ['ne', '右上角缩放'],
  ['e', '左右拉伸（右边）'],
  ['se', '右下角缩放'],
  ['s', '上下拉伸（下边）'],
  ['sw', '左下角缩放'],
  ['w', '左右拉伸（左边）'],
] as const;
export function resizeBox(
  box: Box,
  handle: string,
  dx: number,
  dy: number,
  proportional = false,
) {
  const a = (box.rotation * Math.PI) / 180,
    c = Math.cos(a),
    s = Math.sin(a);
  const lx = dx * c + dy * s,
    ly = -dx * s + dy * c;
  const hx = handle.includes('e') ? 1 : handle.includes('w') ? -1 : 0;
  const hy = handle.includes('s') ? 1 : handle.includes('n') ? -1 : 0;
  let w = Math.max(12, box.w + hx * lx),
    h = Math.max(12, box.h + hy * ly);
  if (proportional) {
    const sx = w / box.w,
      sy = h / box.h;
    const scale = Math.max(
      12 / box.w,
      12 / box.h,
      hx && hy ? (Math.abs(sx - 1) > Math.abs(sy - 1) ? sx : sy) : hx ? sx : sy,
    );
    w = box.w * scale;
    h = box.h * scale;
  }
  const cx = (hx * (w - box.w)) / 2,
    cy = (hy * (h - box.h)) / 2;
  return {
    ...box,
    w,
    h,
    x: box.x + (box.w - w) / 2 + cx * c - cy * s,
    y: box.y + (box.h - h) / 2 + cx * s + cy * c,
  };
}
export function normalizeAngle(angle: number) {
  return ((((angle + 180) % 360) + 360) % 360) - 180;
}
export function reorderPiece<T extends { id: string }>(
  items: T[],
  id: string,
  action: 'top' | 'bottom' | 'up' | 'down',
) {
  const index = items.findIndex((p) => p.id === id);
  if (index < 0) return items;
  const target =
    action === 'top'
      ? items.length - 1
      : action === 'bottom'
        ? 0
        : Math.max(
            0,
            Math.min(items.length - 1, index + (action === 'up' ? 1 : -1)),
          );
  if (target === index) return items;
  const next = [...items],
    [piece] = next.splice(index, 1);
  next.splice(target, 0, piece);
  return next;
}
