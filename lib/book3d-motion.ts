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
