import test from 'node:test';
import assert from 'node:assert/strict';
import { leafFrame, leafSegments, shouldCompleteTurn } from '../lib/page-motion.ts';
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
test('a leaf starts and lands flat, with the destination on its reverse', () => {
  for (const next of [true, false])
    for (const p of [0, 1]) {
      const segments = leafSegments(p, next);
      for (const [i, s] of segments.entries()) {
        near(s.z, 0);
        near(s.angle, 0);
        near(s.x, next ? i / 12 : 1 - (i + 1) / 12);
        assert.equal(s.front, next ? 12 + i : 11 - i);
        assert.equal(s.back, next ? 11 - i : 12 + i);
      }
    }
});
test('curved segments stay connected and reverse turns are exact reflections', () => {
  for (const p of [0.15, 0.4, 0.65, 0.9]) {
    const next = leafSegments(p, true),
      prev = leafSegments(p, false);
    for (let i = 0; i < 12; i++) {
      const a = next[i],
        b = prev[i],
        dx = Math.cos((a.angle * Math.PI) / 180) / 12,
        dz = -Math.sin((a.angle * Math.PI) / 180) / 12;
      near(b.x, 1 - a.x - dx);
      near(b.z, a.z + dz);
      near(b.angle, -a.angle);
      if (i < 11) {
        near(next[i + 1].x, a.x + dx);
        near(next[i + 1].z, a.z + dz);
      }
    }
  }
});
test('the complete frame exposes the destination face before the live page handoff', () => {
  for (const next of [true, false]) {
    const start=leafFrame(0,next,10),middle=leafFrame(.5,next,10),end=leafFrame(1,next,10);
    near(start.rotation,0);
    near(end.rotation,next?-180:180);
    near(start.lift,0);
    near(end.lift,0);
    near(middle.lift,1);
    assert.ok(start.segments.every(segment=>segment.frontVisible&&!segment.backVisible));
    assert.ok(end.segments.every(segment=>!segment.frontVisible&&segment.backVisible));
  }
});
test('a short drag returns, deliberate turn lands, pulling back cancels', () => {
  assert.equal(shouldCompleteTurn(0.2, 0), false);
  assert.equal(shouldCompleteTurn(0.6, 0), true);
  assert.equal(shouldCompleteTurn(0.15, 0.7), true);
  assert.equal(shouldCompleteTurn(0.6, -0.7), false);
});
