'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DoubleSide,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
} from 'three';

/**
 * The turning-sheet motion is adapted from the cylindrical page-curl approach
 * used by oguzhanT/turngl (MIT License, 2026). See THIRD_PARTY_NOTICES.md.
 *
 * The important invariant is geometric rather than state-based: the page is
 * built from x=0 (the spine) to x=PAGE_WIDTH. Every animation frame computes
 * each vertex from its original distance to x=0. Vertices on the spine have
 * distance 0, so they stay at x=0/z=0 for the entire flip and cannot detach.
 */

const PAGE_WIDTH = 3.72;
const PAGE_HEIGHT = 5.04;
const PAGE_SEGMENTS = 40;
const PAGE_Z = 0.19;
const CURL_LEAD = 0.24;
const CURL_DEPTH = 0.58;

type Phase = 'closed' | 'opening' | 'open' | 'flipping' | 'flipped';

function StaticPage({ side, z = 0.145 }: { side: 'left' | 'right'; z?: number }) {
  return (
    <mesh position={[side === 'left' ? -PAGE_WIDTH / 2 : PAGE_WIDTH / 2, 0, z]} receiveShadow>
      <planeGeometry args={[PAGE_WIDTH - 0.08, PAGE_HEIGHT - 0.08]} />
      <meshStandardMaterial color="#fffaf0" roughness={0.96} />
    </mesh>
  );
}

function CylindricalTurningPage({
  enabled,
  progressRef,
  onFlip,
}: {
  enabled: boolean;
  progressRef: { current: number };
  onFlip: () => void;
}) {
  const pageMesh = useRef<Mesh>(null);

  const page = useMemo(() => {
    const geometry = new PlaneGeometry(PAGE_WIDTH, PAGE_HEIGHT, PAGE_SEGMENTS, 2);
    geometry.translate(PAGE_WIDTH / 2, 0, 0);

    const positions = geometry.attributes.position;
    const normalizedX = new Float32Array(positions.count);
    const originalY = new Float32Array(positions.count);

    for (let i = 0; i < positions.count; i += 1) {
      normalizedX[i] = MathUtils.clamp(positions.getX(i) / PAGE_WIDTH, 0, 1);
      originalY[i] = positions.getY(i);
    }

    const material = new MeshStandardMaterial({
      color: '#fffdf6',
      roughness: 0.94,
      metalness: 0,
      side: DoubleSide,
    });

    return { geometry, material, normalizedX, originalY };
  }, []);

  useEffect(
    () => () => {
      page.geometry.dispose();
      page.material.dispose();
    },
    [page],
  );

  useFrame(() => {
    const mesh = pageMesh.current;
    if (!mesh) return;

    const raw = MathUtils.clamp(progressRef.current, 0, 1);
    // Ease both take-off and landing. Unlike the previous bone rig, this easing
    // drives vertex positions directly and there is no second damping system
    // that can continue moving after the logical flip is complete.
    const progress = raw * raw * (3 - 2 * raw);
    const positions = page.geometry.attributes.position;

    for (let i = 0; i < positions.count; i += 1) {
      const t = page.normalizedX[i];
      const distanceFromSpine = t * PAGE_WIDTH;

      // Outer columns lead the inner columns slightly, producing the characteristic
      // rolling curl rather than a rigid door rotation. At progress 0 all angles
      // are 0; at progress 1 all angles are PI.
      const adjusted = progress * (1 + CURL_LEAD) - CURL_LEAD * 0.5;
      const vertexProgress = MathUtils.clamp(
        adjusted + (t - 0.5) * CURL_LEAD,
        0,
        1,
      );
      const angle = vertexProgress * Math.PI;

      const x = distanceFromSpine * Math.cos(angle);
      const z = distanceFromSpine * Math.sin(angle) * CURL_DEPTH;

      // A very small diagonal lift keeps the free corner from looking perfectly
      // machine-bent. It is zero at the spine and zero again at both end states.
      const turnPulse = Math.sin(progress * Math.PI);
      const verticalBias =
        Math.sin(t * Math.PI) *
        (page.originalY[i] / PAGE_HEIGHT) *
        0.075 *
        turnPulse;

      positions.setXYZ(i, x, page.originalY[i] + verticalBias, z);
    }

    positions.needsUpdate = true;
    page.geometry.computeVertexNormals();
  });

  return (
    <mesh
      ref={pageMesh}
      geometry={page.geometry}
      material={page.material}
      position={[0, 0, PAGE_Z]}
      castShadow
      receiveShadow
      onClick={(event) => {
        event.stopPropagation();
        if (enabled) onFlip();
      }}
    />
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
      pageProgress.current = Math.min(1, pageProgress.current + delta / 1.08);
      if (pageProgress.current >= 1) {
        pageProgress.current = 1;
        changePhase('flipped');
      }
    }

    const easedCover = MathUtils.smoothstep(coverProgress.current, 0, 1);
    cover.current.rotation.y = -Math.PI * easedCover;

    const openCenterShift = MathUtils.lerp(-PAGE_WIDTH / 2, 0, easedCover);
    root.current.position.x = MathUtils.damp(root.current.position.x, openCenterShift, 5, delta);

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

      {phase !== 'closed' && <StaticPage side="left" z={0.135} />}
      <StaticPage side="right" z={0.145} />

      <CylindricalTurningPage
        enabled={phase === 'open'}
        progressRef={pageProgress}
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
          <meshStandardMaterial color="#a98970" roughness={0.9} />
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
  open: '点击右页，测试圆柱式真实卷页',
  flipping: '纸页沿书脊连续卷动…',
  flipped: '翻页完成 · 同一张纸固定在左侧',
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
              Three.js 实验页 · MIT 圆柱卷页方案
            </div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 650, letterSpacing: '-0.02em' }}>
              封面打开 + 连续页纸卷曲
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
