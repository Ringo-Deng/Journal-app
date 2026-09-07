'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { useRef, useState } from 'react';
import {
  BufferAttribute,
  DoubleSide,
  Group,
  MathUtils,
  Mesh,
} from 'three';

const PAGE_WIDTH = 3.72;
const PAGE_HEIGHT = 5.04;
const PAGE_SEGMENTS = 32;

type Phase = 'closed' | 'opening' | 'open' | 'flipping' | 'flipped';

function StaticPage({ z = 0.16 }: { z?: number }) {
  return (
    <mesh position={[PAGE_WIDTH / 2, 0, z]} receiveShadow>
      <planeGeometry args={[PAGE_WIDTH - 0.08, PAGE_HEIGHT - 0.08]} />
      <meshStandardMaterial color="#fffaf0" roughness={0.96} side={DoubleSide} />
    </mesh>
  );
}

function FlexiblePage({
  enabled,
  progress,
  onFlip,
}: {
  enabled: boolean;
  progress: number;
  onFlip: () => void;
}) {
  const page = useRef<Mesh>(null);
  const original = useRef<Float32Array | null>(null);

  useFrame(() => {
    const mesh = page.current;
    if (!mesh) return;

    const position = mesh.geometry.attributes.position as BufferAttribute;
    if (!original.current) original.current = new Float32Array(position.array as ArrayLike<number>);
    const source = original.current;

    const lift = Math.sin(Math.PI * progress);
    const baseAngle = -Math.PI * progress;

    for (let i = 0; i < position.count; i += 1) {
      const sourceIndex = i * 3;
      const sourceX = source[sourceIndex];
      const sourceY = source[sourceIndex + 1];
      const distanceFromSpine = sourceX + PAGE_WIDTH / 2;
      const u = MathUtils.clamp(distanceFromSpine / PAGE_WIDTH, 0, 1);

      const curl =
        lift *
        0.72 *
        Math.sin(Math.PI * u) *
        (0.28 + 0.72 * u);
      const angle = baseAngle - curl;

      const x = distanceFromSpine * Math.cos(angle);
      const z =
        distanceFromSpine * Math.sin(angle) +
        lift * 0.2 * Math.sin(Math.PI * u);

      position.setXYZ(i, x, sourceY, z);
    }

    position.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
  });

  return (
    <mesh
      ref={page}
      position={[0, 0, 0.19]}
      castShadow
      receiveShadow
      onClick={(event) => {
        event.stopPropagation();
        if (enabled) onFlip();
      }}
    >
      <planeGeometry args={[PAGE_WIDTH, PAGE_HEIGHT, PAGE_SEGMENTS, 1]} />
      <meshStandardMaterial
        color="#fffdf6"
        roughness={0.94}
        metalness={0}
        side={DoubleSide}
      />
    </mesh>
  );
}

function BookModel({
  onPhaseChange,
}: {
  onPhaseChange: (phase: Phase) => void;
}) {
  const root = useRef<Group>(null);
  const cover = useRef<Group>(null);
  const [phase, setPhase] = useState<Phase>('closed');
  const coverProgress = useRef(0);
  const pageProgress = useRef(0);

  const changePhase = (next: Phase) => {
    setPhase(next);
    onPhaseChange(next);
  };

  useFrame((state, delta) => {
    if (!root.current || !cover.current) return;

    if (phase === 'opening') {
      coverProgress.current = Math.min(1, coverProgress.current + delta / 1.05);
      if (coverProgress.current >= 1) changePhase('open');
    }

    if (phase === 'flipping') {
      pageProgress.current = Math.min(1, pageProgress.current + delta / 0.92);
      if (pageProgress.current >= 1) changePhase('flipped');
    }

    const easedCover = MathUtils.smoothstep(coverProgress.current, 0, 1);
    cover.current.rotation.y = -Math.PI * easedCover;

    const openCenterShift = MathUtils.lerp(-PAGE_WIDTH / 2, 0, easedCover);
    root.current.position.x = MathUtils.damp(
      root.current.position.x,
      openCenterShift,
      5,
      delta,
    );

    const targetX = -0.23 + state.pointer.y * 0.045;
    const targetY = state.pointer.x * 0.075;
    root.current.rotation.x = MathUtils.damp(root.current.rotation.x, targetX, 5, delta);
    root.current.rotation.y = MathUtils.damp(root.current.rotation.y, targetY, 5, delta);
  });

  const openCover = () => {
    if (phase !== 'closed') return;
    changePhase('opening');
  };

  const flipPage = () => {
    if (phase !== 'open') return;
    changePhase('flipping');
  };

  return (
    <group ref={root} position={[-PAGE_WIDTH / 2, 0, 0]} rotation={[-0.23, 0, 0]}>
      <mesh position={[PAGE_WIDTH / 2, 0, -0.24]} castShadow receiveShadow>
        <boxGeometry args={[PAGE_WIDTH + 0.18, PAGE_HEIGHT + 0.2, 0.18]} />
        <meshStandardMaterial color="#82624f" roughness={0.8} />
      </mesh>

      <mesh position={[PAGE_WIDTH / 2, 0, -0.02]} castShadow receiveShadow>
        <boxGeometry args={[PAGE_WIDTH, PAGE_HEIGHT, 0.28]} />
        <meshStandardMaterial color="#eee6d6" roughness={0.94} />
      </mesh>

      <StaticPage z={0.145} />

      <FlexiblePage
        enabled={phase === 'open'}
        progress={pageProgress.current}
        onFlip={flipPage}
      />

      <group ref={cover} position={[0, 0, 0.31]}>
        <mesh
          position={[PAGE_WIDTH / 2, 0, 0]}
          castShadow
          receiveShadow
          onClick={(event) => {
            event.stopPropagation();
            openCover();
          }}
        >
          <boxGeometry args={[PAGE_WIDTH + 0.18, PAGE_HEIGHT + 0.2, 0.16]} />
          <meshStandardMaterial color="#8a6954" roughness={0.77} />
        </mesh>
        <mesh position={[PAGE_WIDTH / 2, 0, -0.086]} receiveShadow>
          <planeGeometry args={[PAGE_WIDTH - 0.08, PAGE_HEIGHT - 0.08]} />
          <meshStandardMaterial color="#a98970" roughness={0.9} side={DoubleSide} />
        </mesh>
      </group>

      <mesh position={[0, 0, 0.04]} castShadow receiveShadow>
        <cylinderGeometry args={[0.14, 0.14, PAGE_HEIGHT + 0.08, 28]} />
        <meshStandardMaterial color="#6f5142" roughness={0.84} />
      </mesh>
    </group>
  );
}

function BookScene({ onPhaseChange }: { onPhaseChange: (phase: Phase) => void }) {
  return (
    <>
      <color attach="background" args={['#ede7de']} />
      <ambientLight intensity={1.25} />
      <directionalLight position={[-4, 5, 7]} intensity={1.4} />
      <spotLight
        position={[4.5, 5.5, 8]}
        angle={0.5}
        penumbra={0.72}
        intensity={58}
        castShadow
      />
      <BookModel onPhaseChange={onPhaseChange} />
      <mesh position={[0, 0, -0.82]} receiveShadow>
        <planeGeometry args={[18, 14]} />
        <meshStandardMaterial color="#e4ddd3" roughness={1} />
      </mesh>
    </>
  );
}

const phaseCopy: Record<Phase, string> = {
  closed: '点击封面打开手帐',
  opening: '封面正在打开…',
  open: '点击右页，测试柔性翻页',
  flipping: '纸页正在弯曲翻动…',
  flipped: '翻页完成 · 可点击“重新测试”再看一次',
};

export default function Book3DTest() {
  const [phase, setPhase] = useState<Phase>('closed');
  const [sceneKey, setSceneKey] = useState(0);

  const reset = () => {
    setPhase('closed');
    setSceneKey((value) => value + 1);
  };

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
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 20,
            alignItems: 'flex-end',
            marginBottom: 18,
          }}
        >
          <div>
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
              封面打开 + 柔性纸页翻动
            </h1>
            <p style={{ margin: '8px 0 0', opacity: 0.7, fontSize: 14 }}>
              {phaseCopy[phase]}
            </p>
          </div>
          <button
            type="button"
            onClick={reset}
            style={{
              border: '1px solid #cdbfaf',
              borderRadius: 999,
              padding: '9px 14px',
              background: '#fffaf2',
              color: '#53483f',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            重新测试
          </button>
        </div>

        <section
          style={{
            height: 'min(72vh, 760px)',
            minHeight: 520,
            overflow: 'hidden',
            borderRadius: 28,
            border: '1px solid #d8cfc4',
            boxShadow: '0 24px 70px rgba(68, 53, 39, 0.14)',
            background: '#ede7de',
          }}
        >
          <Canvas
            key={sceneKey}
            shadows
            dpr={[1, 2]}
            camera={{ position: [0, 0.25, 9], fov: 38, near: 0.1, far: 50 }}
            gl={{ antialias: true }}
          >
            <BookScene onPhaseChange={setPhase} />
          </Canvas>
        </section>
      </div>
    </main>
  );
}
