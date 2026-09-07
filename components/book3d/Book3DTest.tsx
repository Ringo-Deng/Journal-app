'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bone,
  BoxGeometry,
  Float32BufferAttribute,
  Group,
  MathUtils,
  MeshStandardMaterial,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
  Vector3,
} from 'three';

/**
 * The segmented SkinnedMesh/Bone page-rig approach is adapted from
 * Adyaman Singh's `krishna-s-teachings` project (MIT License, 2025).
 * See THIRD_PARTY_NOTICES.md for the retained license notice.
 *
 * Important behaviour retained from the reference implementation:
 * the turning sheet stays mounted on the spine for its entire lifecycle.
 * We do not swap it for a second static mesh after the turn completes.
 */

const PAGE_WIDTH = 3.72;
const PAGE_HEIGHT = 5.04;
const PAGE_DEPTH = 0.018;
const PAGE_SEGMENTS = 30;
const SEGMENT_WIDTH = PAGE_WIDTH / PAGE_SEGMENTS;

type Phase = 'closed' | 'opening' | 'open' | 'flipping' | 'flipped';

function StaticPage({ side, z = 0.145 }: { side: 'left' | 'right'; z?: number }) {
  return (
    <mesh position={[side === 'left' ? -PAGE_WIDTH / 2 : PAGE_WIDTH / 2, 0, z]} receiveShadow>
      <planeGeometry args={[PAGE_WIDTH - 0.08, PAGE_HEIGHT - 0.08]} />
      <meshStandardMaterial color="#fffaf0" roughness={0.96} />
    </mesh>
  );
}

function SkinnedFlexiblePage({
  enabled,
  progressRef,
  onFlip,
}: {
  enabled: boolean;
  progressRef: { current: number };
  onFlip: () => void;
}) {
  const pageGroup = useRef<Group>(null);
  const pageMesh = useRef<SkinnedMesh>(null);

  const rig = useMemo(() => {
    const geometry = new BoxGeometry(
      PAGE_WIDTH,
      PAGE_HEIGHT,
      PAGE_DEPTH,
      PAGE_SEGMENTS,
      2,
    );
    // The page starts at the spine (x = 0) and extends to the right.
    // Rotating this group around x = 0 therefore keeps the sheet physically
    // attached to the spine throughout the whole turn.
    geometry.translate(PAGE_WIDTH / 2, 0, 0);

    const positions = geometry.attributes.position;
    const vertex = new Vector3();
    const skinIndexes: number[] = [];
    const skinWeights: number[] = [];

    for (let i = 0; i < positions.count; i += 1) {
      vertex.fromBufferAttribute(positions, i);
      const scaled = MathUtils.clamp(vertex.x / SEGMENT_WIDTH, 0, PAGE_SEGMENTS);
      const skinIndex = Math.min(PAGE_SEGMENTS - 1, Math.floor(scaled));
      const skinWeight = MathUtils.clamp(scaled - skinIndex, 0, 1);

      skinIndexes.push(skinIndex, skinIndex + 1, 0, 0);
      skinWeights.push(1 - skinWeight, skinWeight, 0, 0);
    }

    geometry.setAttribute('skinIndex', new Uint16BufferAttribute(skinIndexes, 4));
    geometry.setAttribute('skinWeight', new Float32BufferAttribute(skinWeights, 4));

    const bones: Bone[] = [];
    for (let i = 0; i <= PAGE_SEGMENTS; i += 1) {
      const bone = new Bone();
      bone.position.x = i === 0 ? 0 : SEGMENT_WIDTH;
      bones.push(bone);
      if (i > 0) bones[i - 1].add(bone);
    }

    const skeleton = new Skeleton(bones);
    const materials = [
      new MeshStandardMaterial({ color: '#e7decf', roughness: 0.98 }),
      new MeshStandardMaterial({ color: '#d7cbb8', roughness: 0.98 }),
      new MeshStandardMaterial({ color: '#eee5d7', roughness: 0.98 }),
      new MeshStandardMaterial({ color: '#eee5d7', roughness: 0.98 }),
      new MeshStandardMaterial({ color: '#fffdf6', roughness: 0.93 }),
      new MeshStandardMaterial({ color: '#f7f0e4', roughness: 0.95 }),
    ];

    const mesh = new SkinnedMesh(geometry, materials);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.add(skeleton.bones[0]);
    mesh.bind(skeleton);

    return { mesh, geometry, materials };
  }, []);

  useEffect(
    () => () => {
      rig.geometry.dispose();
      rig.materials.forEach((material) => material.dispose());
    },
    [rig],
  );

  useFrame((_, delta) => {
    const group = pageGroup.current;
    const mesh = pageMesh.current;
    if (!group || !mesh) return;

    const progress = MathUtils.smoothstep(progressRef.current, 0, 1);
    const turnPulse = Math.sin(Math.PI * progress);

    // One continuous sheet from start to finish. The hinge rotation is exact,
    // so when progress reaches 1 the same mesh rests at -PI on the left page.
    // Never hide or replace this object at the end of the animation.
    group.rotation.y = -Math.PI * progress;

    const bones = mesh.skeleton.bones;
    for (let i = 0; i < bones.length; i += 1) {
      const bone = bones[i];

      // Keep the root rigid at the spine. Only the paper away from the spine
      // flexes, which prevents the inner edge from visually peeling away.
      if (i === 0) {
        bone.rotation.y = 0;
        bone.rotation.x = 0;
        continue;
      }

      const normalized = i / Math.max(1, bones.length - 1);
      const insideCurve = i < 8 ? Math.sin(i * 0.2 + 0.25) : 0;
      const outsideCurve = i >= 8 ? Math.cos(i * 0.3 + 0.09) : 0;
      const turningCurve = Math.sin(normalized * Math.PI) * turnPulse;

      // Near-spine rigidity + softer outer half. Every term fades to zero at
      // both ends, so the page is flat before the turn and flat again after it.
      const flexibility = MathUtils.lerp(0.34, 1, MathUtils.smoothstep(normalized, 0.05, 1));
      const bendY =
        (-0.026 * insideCurve + 0.011 * outsideCurve - 0.046 * turningCurve) *
        turnPulse *
        flexibility;

      const foldIntensity =
        i > 8 ? Math.sin(normalized * Math.PI - 0.5) * turnPulse : 0;
      const foldX = 0.028 * foldIntensity * flexibility;

      bone.rotation.y = MathUtils.damp(bone.rotation.y, bendY, 12, delta);
      bone.rotation.x = MathUtils.damp(bone.rotation.x, foldX, 12, delta);
    }
  });

  return (
    <group
      ref={pageGroup}
      position={[0, 0, 0.19]}
      onClick={(event) => {
        event.stopPropagation();
        if (enabled) onFlip();
      }}
    >
      <primitive object={rig.mesh} ref={pageMesh} />
    </group>
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
      // Slightly slower than the previous 0.9 s turn. smoothstep in the page
      // component eases both take-off and landing without adding a second state.
      pageProgress.current = Math.min(1, pageProgress.current + delta / 1.05);
      if (pageProgress.current >= 1) changePhase('flipped');
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

      <SkinnedFlexiblePage
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
  open: '点击右页，测试骨骼式柔性翻页',
  flipping: '纸页正在弯曲翻动…',
  flipped: '翻页完成 · 同一张纸仍固定在左侧',
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
              Three.js 实验页 · MIT 骨骼翻页方案
            </div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 650, letterSpacing: '-0.02em' }}>
              封面打开 + SkinnedMesh 柔性纸页
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
