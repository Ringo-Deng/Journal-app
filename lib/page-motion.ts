export function leafSegments(progress: number, next: boolean, count = 12) {
  const p = Math.max(0, Math.min(1, progress));
  const curl = -52 * Math.sin(Math.PI * p);
  let x = 0,
    z = 0;
  return Array.from({ length: count }, (_, i) => {
    const angle = curl * Math.pow((i + 0.5) / count, 1.15);
    const radians = (angle * Math.PI) / 180;
    const dx = Math.cos(radians) / count,
      dz = -Math.sin(radians) / count;
    const segment = {
      x: next ? x : 1 - x - dx,
      z: next ? z : z + dz,
      angle: next ? angle : -angle,
      front: next ? count + i : count - 1 - i,
      back: next ? count - 1 - i : count + i,
    };
    x += dx;
    z += dz;
    return segment;
  });
}

export function shouldCompleteTurn(progress: number, velocity: number) {
  // Velocity is positive toward the destination, negative when pulling back.
  return velocity > 0.45 || (progress > 0.38 && velocity > -0.3);
}
