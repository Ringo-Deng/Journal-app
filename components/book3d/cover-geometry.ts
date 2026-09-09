import { Shape } from "three";

/** Straight binding edge; only the two fore-edge corners are rounded. */
export function coverOutline(
  width: number,
  height: number,
  radius: number,
  spineSide: "left" | "right" = "left",
) {
  const left = -width / 2;
  const right = width / 2;
  const bottom = -height / 2;
  const top = height / 2;
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  const leftRadius = spineSide === "left" ? 0 : r;
  const rightRadius = spineSide === "right" ? 0 : r;
  const shape = new Shape();
  shape.moveTo(left + leftRadius, bottom);
  shape.lineTo(right - rightRadius, bottom);
  shape.quadraticCurveTo(right, bottom, right, bottom + rightRadius);
  shape.lineTo(right, top - rightRadius);
  shape.quadraticCurveTo(right, top, right - rightRadius, top);
  shape.lineTo(left + leftRadius, top);
  shape.quadraticCurveTo(left, top, left, top - leftRadius);
  shape.lineTo(left, bottom + leftRadius);
  shape.quadraticCurveTo(left, bottom, left + leftRadius, bottom);
  shape.closePath();
  return shape;
}
