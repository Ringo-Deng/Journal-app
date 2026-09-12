import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { stackSequence } from '../lib/stack-order.ts';

// The app bundler resolves extensionless TypeScript imports. Match that one
// dependency in this native Node test without changing production imports.
const transformUrl = new URL('../lib/piece-transform.ts', import.meta.url).href;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(specifier === './stack-order' && context.parentURL === transformUrl
      ? './stack-order.ts' : specifier, context);
  },
});
const {
  isCornerResizeHandle,
  resizeBox,
  reorderPiece,
  normalizeAngle,
} = await import(transformUrl).finally(() => hooks.deregister());
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const box = { x: 100, y: 80, w: 200, h: 100, rotation: 0 };
test('each edge stretches one axis and keeps the opposite edge fixed', () => {
  const e = resizeBox(box, 'e', 60, 40);
  near(e.w, 260);
  near(e.h, 100);
  near(e.x, 100);
  near(e.y, 80);
  const n = resizeBox(box, 'n', 30, -40);
  near(n.w, 200);
  near(n.h, 140);
  near(n.y + n.h, 180);
  const w = resizeBox(box, 'w', 30, 0);
  near(w.x + w.w, 300);
  near(w.w, 170);
  const s = resizeBox(box, 's', 90, 40);
  near(s.w, 200);
  near(s.h, 140);
  near(s.y, 80);
});
test('rotated resize uses local axes and keeps the opposite corner anchored', () => {
  function corner(b, hx, hy) {
    const a = (b.rotation * Math.PI) / 180;
    return [
      b.x +
        b.w / 2 +
        ((hx * b.w) / 2) * Math.cos(a) -
        ((hy * b.h) / 2) * Math.sin(a),
      b.y +
        b.h / 2 +
        ((hx * b.w) / 2) * Math.sin(a) +
        ((hy * b.h) / 2) * Math.cos(a),
    ];
  }
  for (const rotation of [-120, 35, 90])
    for (const handle of ['nw', 'ne', 'se', 'sw']) {
      const original = { ...box, rotation },
        next = resizeBox(original, handle, 35, 29);
      const hx = handle.includes('e') ? -1 : 1,
        hy = handle.includes('s') ? -1 : 1;
      const a = corner(original, hx, hy),
        b = corner(next, hx, hy);
      near(a[0], b[0]);
      near(a[1], b[1]);
    }
});
test('proportional scaling preserves the ratio and cannot invert the shape', () => {
  for (const handle of ['e', 's', 'nw', 'se'])
    for (const delta of [-500, 60]) {
      const b = resizeBox(box, handle, delta, delta, true);
      near(b.w / b.h, 2);
      assert.ok(b.w >= 12 && b.h >= 12);
    }
});
test('corner handles lock aspect ratio while edge handles remain single-axis controls', () => {
  for (const handle of ['nw', 'ne', 'se', 'sw']) assert.equal(isCornerResizeHandle(handle), true);
  for (const handle of ['n', 'e', 's', 'w']) assert.equal(isCornerResizeHandle(handle), false);
});
test('locked corner resize preserves both ratio and opposite anchor after rotation', () => {
  const corner = (value, hx, hy) => {
    const a = (value.rotation * Math.PI) / 180;
    return [
      value.x + value.w / 2 + hx * value.w / 2 * Math.cos(a) - hy * value.h / 2 * Math.sin(a),
      value.y + value.h / 2 + hx * value.w / 2 * Math.sin(a) + hy * value.h / 2 * Math.cos(a),
    ];
  };
  for (const handle of ['nw', 'ne', 'se', 'sw']) {
    const original = { ...box, rotation: 35 },
      next = resizeBox(original, handle, 35, 29, true),
      hx = handle.includes('e') ? -1 : 1,
      hy = handle.includes('s') ? -1 : 1,
      anchored = corner(original, hx, hy),
      resized = corner(next, hx, hy);
    near(next.w / next.h, original.w / original.h);
    near(anchored[0], resized[0]);
    near(anchored[1], resized[1]);
  }
});
test('layer moves change canvas order while preserving sidebar order and no-op at an edge', () => {
  const a = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const move=(id,action)=>{
    const updated=reorderPiece(a,id,action);
    assert.deepEqual(updated.map(p=>p.id),a.map(p=>p.id));
    return stackSequence(updated).map(p=>p.id);
  };
  assert.deepEqual(
    move('b', 'bottom'),
    ['b', 'a', 'c'],
  );
  assert.deepEqual(
    move('a', 'up'),
    ['b', 'a', 'c'],
  );
  assert.deepEqual(
    move('b', 'top'),
    ['a', 'c', 'b'],
  );
  assert.equal(reorderPiece(a, 'c', 'top'), a);
  assert.equal(reorderPiece(a, 'missing', 'bottom'), a);
  near(normalizeAngle(370), 10);
  near(normalizeAngle(-190), 170);
});
