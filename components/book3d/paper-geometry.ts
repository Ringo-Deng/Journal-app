import { BufferGeometry, ExtrudeGeometry, Float32BufferAttribute, PlaneGeometry, Shape } from "three";
import type { BookGeometry } from "../../lib/book3d-motion";

const CORNER_SEGMENTS = 8;
const PAPER_ROWS = 8;

/** Keep every original turn strip; add vertices only along the trimmed corner. */
export function paperColumns(book: BookGeometry) {
  const radius = Math.min(0.12, book.width / 8, book.height / 16);
  const original = Array.from({ length: book.segments + 1 }, (_, i) => i * book.width / book.segments);
  const corner = Array.from({ length: CORNER_SEGMENTS }, (_, i) =>
    book.width - radius + Math.sin(i / CORNER_SEGMENTS * Math.PI / 2) * radius);
  return [...new Set([...original, ...corner])].sort((a, b) => a - b).map(x => {
    const dx = Math.max(0, x - (book.width - radius));
    return { x, inset: dx === 0 ? 0 : radius - Math.sqrt(Math.max(0, radius * radius - dx * dx)) };
  });
}

export function createPaperGeometry(book: BookGeometry, side: -1 | 1 = 1) {
  const columns = paperColumns(book);
  const result = new PlaneGeometry(book.width, book.height, columns.length - 1, PAPER_ROWS);
  const positions = result.attributes.position;
  const uv = result.attributes.uv;
  for (let i = 0; i < positions.count; i++) {
    const column = columns[i % columns.length];
    const row = Math.floor(i / columns.length);
    const originalY = (1 - 2 * row / PAPER_ROWS) * book.height / 2;
    // Interior rows retain their original positions. Only top/bottom boundary
    // vertices are trimmed, leaving the existing bend and twist untouched.
    const y = row === 0 ? originalY - column.inset : row === PAPER_ROWS ? originalY + column.inset : originalY;
    positions.setXYZ(i, side * column.x, y, 0);
    // Keep image coordinates tied to the original rectangular page; do not
    // squeeze edge text or artwork as the physical corner is trimmed.
    uv.setXY(i, side === 1 ? column.x / book.width : 1 - column.x / book.width, y / book.height + 0.5);
  }
  if (side === -1) {
    const index = result.index!;
    for (let i = 0; i < index.count; i += 3) {
      const b = index.getX(i + 1);
      index.setX(i + 1, index.getX(i + 2));
      index.setX(i + 2, b);
    }
  }
  result.computeVertexNormals();
  result.computeBoundingSphere();
  return result;
}

/** Interpolate along the existing fixed-length turn curve at a paper UV coordinate. */
export function paperCurveSample(points: { x: number; z: number }[], u: number) {
  const index = Math.max(0, Math.min(points.length - 1, u * (points.length - 1)));
  const low = Math.floor(index);
  const high = Math.min(points.length - 1, low + 1);
  const fraction = index - low;
  const prev = points[Math.max(0, low - 1)];
  const next = points[high];
  return {
    x: points[low].x + (points[high].x - points[low].x) * fraction,
    z: points[low].z + (points[high].z - points[low].z) * fraction,
    facing: Math.abs((next.x - prev.x) / Math.max(1e-6, Math.hypot(next.x - prev.x, next.z - prev.z))),
  };
}

export function createPaperStackGeometry(book: BookGeometry, count: number, side: -1 | 1) {
  const columns = paperColumns(book);
  const outline = [
    ...columns.map(p => ({ x: side * p.x, y: -book.height / 2 + p.inset })),
    ...columns.toReversed().map(p => ({ x: side * p.x, y: book.height / 2 - p.inset })),
  ];
  const shape = new Shape();
  shape.moveTo(outline[0].x, outline[0].y);
  for (const p of outline.slice(1)) shape.lineTo(p.x, p.y);
  shape.closePath();
  const body = new ExtrudeGeometry(shape, { depth: count * book.sheet, bevelEnabled: false, steps: 1 });
  const positions: number[] = [];
  for (let leaf = 0; leaf < count; leaf++) {
    const z = leaf * book.sheet + 0.008;
    // Only exposed edges carry sheet lines; the binding stays uninterrupted.
    for (let i = 1; i < outline.length; i++) {
      const a = outline[i - 1], b = outline[i];
      positions.push(a.x, a.y, z, b.x, b.y, z);
    }
  }
  const edges = new BufferGeometry();
  edges.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return { body, edges };
}
