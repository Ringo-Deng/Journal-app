'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { Group, MathUtils } from 'three';

function PageLines({ side }: { side: 'left' | 'right' }) {
  const x = side === 'left' ? -0.04 : 0.04;
  return (
    <>
      {Array.from({ length: 9 }, (_, index) => (
        <mesh key={index} position={[x, 1.7 - index * 0.42, 0.151]} receiveShadow>
          <boxGeometry args={[3.18, 0.014, 0.008]} />
          <meshStandardMaterial color="#d8d1c2" roughness={0.94} />
        </mesh>
      ))}
    </>
  );
}

function PageBlock({ side }: { side: 'left' | 'right' }) {
  const left = side === 'left';
  return (
    <group
      position={[left ? -1.91 : 1.91, 0, -0.05]}
      rotation={[0, left ? 0.045 : -0.045, 0]}
    >
      <mesh castShadow receiveShadow>
        <boxGeometry args={[3.76, 5.02, 0.29]} />
        <meshStandardMaterial color="#f6f0df" roughness={0.9} metalness={0} />
      </mesh>
      <mesh position={[0, 0, 0.151]} receiveShadow>
        <planeGeometry args={[3.66, 4.92]} />
        <meshStandardMaterial color="#fffaf0" roughness={0.95} metalness={0} />
      </mesh>
      <PageLines side={side} />
    </group>
  );
}

function BookModel() {
  const book = useRef<Group>(null);

  useFrame((state, delta) => {
    if (!book.current) return;
    const targetX = -0.2 + state.pointer.y * 0.07;
    const targetY = state.pointer.x * 0.14;
    book.current.rotation.x = MathUtils.damp(book.current.rotation.x, targetX, 5, delta);
    book.current.rotation.y = MathUtils.damp(book.current.rotation.y, targetY, 5, delta);
    book.current.position.y = Math.sin(state.clock.getElapsedTime() * 0.7) * 0.025;
  });

  return (
    <group ref={book} rotation={[-0.2, 0, 0]}>
      <mesh position={[-2.06, 0, -0.3]} castShadow receiveShadow>
        <boxGeometry args={[4.08, 5.32, 0.2]} />
        <meshStandardMaterial color="#866552" roughness={0.76} metalness={0} />
      </mesh>
      <mesh position={[2.06, 0, -0.3]} castShadow receiveShadow>
        <boxGeometry args={[4.08, 5.32, 0.2]} />
        <meshStandardMaterial color="#866552" roughness={0.76} metalness={0} />
      </mesh>

      <mesh position={[0, 0, -0.25]} castShadow receiveShadow>
        <cylinderGeometry args={[0.2, 0.2, 5.22, 24]} />
        <meshStandardMaterial color="#6f5142" roughness={0.82} />
      </mesh>

      <PageBlock side="left" />
      <PageBlock side="right" />

      <mesh position={[0, 0, 0.12]} castShadow>
        <boxGeometry args={[0.08, 4.9, 0.08]} />
        <meshStandardMaterial color="#d9cfbb" roughness={0.95} />
      </mesh>
    </group>
  );
}

function BookScene() {
  return (
    <>
      <color attach="background" args={['#eee8df']} />
      <ambientLight intensity={1.4} />
      <directionalLight position={[-4, 5, 7]} intensity={1.8} />
      <spotLight
        position={[4.5, 5.5, 8]}
        angle={0.55}
        penumbra={0.7}
        intensity={65}
        castShadow
      />
      <BookModel />
      <mesh position={[0, 0, -0.78]} receiveShadow>
        <planeGeometry args={[18, 14]} />
        <meshStandardMaterial color="#e5ddd2" roughness={1} />
      </mesh>
    </>
  );
}

export default function Book3DTest() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        padding: '32px',
        background: 'linear-gradient(180deg, #f8f4ee 0%, #eee7de 100%)',
        color: '#3f3a35',
        fontFamily: 'PingFang SC, -apple-system, BlinkMacSystemFont, sans-serif',
      }}
    >
      <div style={{ width: 'min(1120px, 100%)', margin: '0 auto' }}>
        <div style={{ marginBottom: 18 }}>
          <div
            style={{
              display: 'inline-flex',
              padding: '6px 10px',
              borderRadius: 999,
              background: '#ffffffa8',
              border: '1px solid #d9d0c5',
              fontSize: 12,
              marginBottom: 10,
            }}
          >
            Three.js 实验页 · 不读写手帐数据
          </div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 650, letterSpacing: '-0.02em' }}>
            拾光手帐 · 3D 书本基础模型
          </h1>
          <p style={{ margin: '8px 0 0', opacity: 0.68, fontSize: 14 }}>
            移动鼠标观察轻微透视。这个页面只验证 3D 书体、厚度、纸页与光影，不替换现有翻页。
          </p>
        </div>

        <section
          style={{
            height: 'min(72vh, 760px)',
            minHeight: 520,
            overflow: 'hidden',
            borderRadius: 28,
            border: '1px solid #d8cfc4',
            boxShadow: '0 24px 70px rgba(68, 53, 39, 0.14)',
            background: '#eee8df',
          }}
        >
          <Canvas
            shadows
            dpr={[1, 2]}
            camera={{ position: [0, 0.15, 9], fov: 38, near: 0.1, far: 50 }}
            gl={{ antialias: true }}
          >
            <BookScene />
          </Canvas>
        </section>
      </div>
    </main>
  );
}
