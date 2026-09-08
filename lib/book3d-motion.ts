/** Physical dimensions shared by the experiment and its geometry regression tests. */
export const BOOK = {
  width: 3.72,
  height: 5.04,
  segments: 64,
  leaves: 8,
  sheet: 0.036,
  base: -0.12,
  cover: 0.05,
  coverGap: 0.012,
} as const;

export type BookGeometry = { [K in keyof typeof BOOK]: number };
export function bookGeometry(leaves: number, spreadRatio: number): BookGeometry {
  const count = Math.max(1, Math.floor(leaves));
  return {
    ...BOOK,
    leaves: count,
    height: (BOOK.width * 2) / Math.max(0.5, spreadRatio),
    sheet: Math.min(BOOK.sheet, 0.32 / count),
  };
}

export function stackTop(leaves: number, geometry: BookGeometry = BOOK) {
  return geometry.base + leaves * geometry.sheet;
}

export function turnTarget(turned: number, direction: -1 | 1, count = BOOK.leaves as number) {
  return Math.max(0, Math.min(count, turned + direction));
}

/** Integrate unit tangents: every strip keeps its length, unlike scaled sin/cos folds. */
export type PaperStyle = "original" | "soft";
// Curvature adapted from ThreeUI Sketchbook applyTurn (MIT); see THIRD_PARTY_NOTICES.md.
export function sampleSheet(
  progress: number,
  leaf: number,
  geometry: BookGeometry = BOOK,
  style: PaperStyle = "original",
) {
  const p = Math.max(0, Math.min(1, progress));
  const pulse = Math.sin(Math.PI * p);
  const points: Array<{ x: number; z: number }> = [];
  const start = stackTop(geometry.leaves - leaf, geometry);
  const end = stackTop(leaf + 1, geometry);
  const hinge = start + (end - start) * p + 0.008;
  let x = 0;
  let z = hinge;
  points.push({ x, z });
  for (let i = 1; i <= geometry.segments; i += 1) {
    const t = (i - 0.5) / geometry.segments;
    // Soft mode forms one continuous arc; original keeps its small S curve.
    const bend =
      style === "soft" ? 0.95 * pulse * (1 - 2 * t) : 0.46 * pulse * Math.sin(2 * Math.PI * t);
    const angle = Math.PI * p + bend;
    x += (Math.cos(angle) * geometry.width) / geometry.segments;
    z += (Math.sin(angle) * geometry.width) / geometry.segments;
    points.push({ x, z });
  }
  return points;
}

/** Screen-space span comes from the projected book, so zoom does not change the gesture. */
export function dragTurnProgress(deltaX: number, direction: -1 | 1, span: number) {
  return Math.max(0, Math.min(1, (-direction * deltaX) / Math.max(1, span)));
}

export function releaseTurn(progress: number, distance: number, cancelled = false): 0 | 1 {
  if (cancelled) return 0;
  return distance <= 6 || progress >= 0.35 ? 1 : 0;
}

/** Keep a deliberate turn reachable even when a zoomed page extends off-screen. */
export function dragTurnSpan(projectedBookWidth: number, viewportWidth: number) {
  return Math.max(1, Math.min(projectedBookWidth, viewportWidth * 0.9));
}

export const TURN_SECONDS = { page: 1.08, cover: 1.05 } as const;
export type DragTurn = {
  progress: number;
  target: 0 | 1 | null;
  settleFrom: number;
  elapsed: number;
};
export type BookTurn = {
  kind: "cover" | "page" | "back-cover";
  from: number;
  to: number;
  drag?: DragTurn;
};
export type BookPosition = { opened: boolean; turned: number; backClosed: boolean };

export function nextBookTurn(
  position: BookPosition,
  direction: -1 | 1,
  count = BOOK.leaves as number,
): BookTurn | null {
  if (position.backClosed) return direction === -1 ? { kind: "back-cover", from: 1, to: 0 } : null;
  if (!position.opened) return direction === 1 ? { kind: "cover", from: 0, to: 1 } : null;
  if (position.turned === 0 && direction === -1) return { kind: "cover", from: 1, to: 0 };
  if (position.turned === count && direction === 1) return { kind: "back-cover", from: 0, to: 1 };
  return { kind: "page", from: position.turned, to: turnTarget(position.turned, direction, count) };
}

export function finishBookTurn(position: BookPosition, motion: BookTurn): BookPosition {
  const destination = motion.drag?.target === 0 ? motion.from : motion.to;
  if (motion.kind === "cover") return { ...position, opened: destination === 1 };
  if (motion.kind === "back-cover") return { ...position, backClosed: destination === 1 };
  return { ...position, turned: destination };
}

export function settleDrag(control: DragTurn, target: 0 | 1) {
  if (control.target !== null) return;
  control.target = target;
  control.settleFrom = control.progress;
  control.elapsed = 0;
}

/** No timer may finish a sheet while the pointer is held, even at full travel. */
export function advanceDrag(control: DragTurn, delta: number, duration: number) {
  if (control.target === null) return false;
  control.elapsed = Math.min(duration, control.elapsed + Math.max(0, delta));
  const t = Math.min(1, control.elapsed / duration);
  const eased = t * t * (3 - 2 * t);
  control.progress = control.settleFrom + (control.target - control.settleFrom) * eased;
  return t === 1;
}

/** White cloth follows both resting stacks and the actual moving hinge. */
export function bindingProfile(left: number, right: number, hinge: number) {
  return Array.from({ length: 33 }, (_, i) => {
    const u = i / 32;
    const t = u <= 0.5 ? u * 2 : (u - 0.5) * 2;
    const smooth = t * t * (3 - 2 * t);
    return {
      x: (u - 0.5) * 0.28,
      z: u <= 0.5 ? left + (hinge - left) * smooth : hinge + (right - hinge) * smooth,
    };
  });
}

export function coverHeight(side: "above" | "below", geometry: BookGeometry = BOOK) {
  return side === "above"
    ? stackTop(geometry.leaves, geometry) + geometry.coverGap + geometry.cover / 2
    : geometry.base - geometry.coverGap - geometry.cover / 2;
}

/** Move the hinge only on the empty side; never lower a cover through the full paper block. */
export function coverPose(progress: number, side: "front" | "back", geometry: BookGeometry = BOOK) {
  const p = Math.max(0, Math.min(1, progress));
  const t = side === "front" ? Math.max(0, (p - 0.5) * 2) : Math.min(1, p * 2);
  const eased = t * t * (3 - 2 * t);
  const from = coverHeight(side === "front" ? "above" : "below", geometry);
  const to = coverHeight(side === "front" ? "below" : "above", geometry);
  return { angle: -Math.PI * p, z: from + (to - from) * eased };
}
