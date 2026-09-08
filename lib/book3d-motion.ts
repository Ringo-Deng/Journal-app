/** Physical dimensions shared by the experiment and its geometry regression tests. */
export const BOOK = {
  width: 3.72,
  height: 5.04,
  segments: 64,
  leaves: 8,
  sheet: 0.036,
  base: -0.12,
} as const;

export function stackTop(leaves: number) {
  return BOOK.base + leaves * BOOK.sheet;
}

export function turnTarget(turned: number, direction: -1 | 1) {
  return Math.max(0, Math.min(BOOK.leaves, turned + direction));
}

/** Integrate unit tangents: every strip keeps its length, unlike scaled sin/cos folds. */
export function sampleSheet(progress: number, leaf: number) {
  const p = Math.max(0, Math.min(1, progress));
  const pulse = Math.sin(Math.PI * p);
  const points: Array<{ x: number; z: number }> = [];
  const start = stackTop(BOOK.leaves - leaf);
  const end = stackTop(leaf + 1);
  const hinge = start + (end - start) * p + 0.008;
  let x = 0;
  let z = hinge;
  points.push({ x, z });
  for (let i = 1; i <= BOOK.segments; i += 1) {
    const t = (i - 0.5) / BOOK.segments;
    // A small S curve lets the fore-edge lead, while the spine stays attached.
    const angle = Math.PI * p + 0.46 * pulse * Math.sin(2 * Math.PI * t);
    x += (Math.cos(angle) * BOOK.width) / BOOK.segments;
    z += (Math.sin(angle) * BOOK.width) / BOOK.segments;
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

export function nextBookTurn(position: BookPosition, direction: -1 | 1): BookTurn | null {
  if (position.backClosed) return direction === -1 ? { kind: "back-cover", from: 1, to: 0 } : null;
  if (!position.opened) return direction === 1 ? { kind: "cover", from: 0, to: 1 } : null;
  if (position.turned === 0 && direction === -1) return { kind: "cover", from: 1, to: 0 };
  if (position.turned === BOOK.leaves && direction === 1)
    return { kind: "back-cover", from: 0, to: 1 };
  return { kind: "page", from: position.turned, to: turnTarget(position.turned, direction) };
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
