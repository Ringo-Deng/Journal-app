/** Recto/verso order preserves each existing spread; no document mutation is needed. */
export type ReadingFace =
  | { sheet: number; side: "left" | "right" }
  | { sheet: null; side: "left" | "right" };
export function readingBookPlan(bodyCount: number, hasFlyleaf: boolean) {
  const count = Math.max(0, bodyCount) + (hasFlyleaf ? 1 : 0);
  const faces: ReadingFace[] = [{ sheet: hasFlyleaf ? 0 : null, side: "right" }];
  for (let body = 0; body < bodyCount; body++) {
    const sheet = body + (hasFlyleaf ? 1 : 0);
    faces.push({ sheet, side: "left" }, { sheet, side: "right" });
  }
  faces.push({ sheet: null, side: "left" });
  return {
    faces,
    count,
    leaves: faces.length / 2,
    firstLeaf: hasFlyleaf ? 0 : 1,
    leafForReading: (index: number) =>
      Math.max(0, Math.min(count - 1, index)) + (hasFlyleaf ? 0 : 1),
    readingForLeaf: (leaf: number) => Math.max(0, Math.min(count - 1, leaf - (hasFlyleaf ? 0 : 1))),
  };
}
