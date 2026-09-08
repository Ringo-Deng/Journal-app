"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { BackSide, CanvasTexture, Group, MathUtils, PlaneGeometry, SRGBColorSpace } from "three";
import { BOOK, sampleSheet, stackTop, turnTarget } from "@/lib/book3d-motion";
import "./book3d.css";

type Motion =
  | { kind: "cover"; from: number; to: number }
  | { kind: "page"; from: number; to: number };
type BookState = { opened: boolean; turned: number; motion: Motion | null };
const initialState: BookState = { opened: false, turned: 0, motion: null };
const titles = [
  "清晨的光",
  "慢一点，也很好",
  "沿途的风景",
  "留一点空白",
  "日常的小事",
  "把今天收藏",
  "窗边的午后",
  "下一次出发",
];

function makeTexture(page: number | "cover" | "lining", reverse = false) {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = page === "cover" ? "#78614c" : page === "lining" ? "#d3c3a6" : "#faf5e9";
  ctx.fillRect(0, 0, 768, 1024);
  // Deterministic fine grain; no image downloads or private journal data.
  for (let y = 0; y < 1024; y += 3) {
    for (let x = 0; x < 768; x += 3) {
      ctx.fillStyle = `rgba(60,42,23,${((x * 13 + y * 7) % 19) / 900})`;
      ctx.fillRect(x, y, 1, page === "cover" ? 3 : 1);
    }
  }
  if (page === "cover") {
    ctx.strokeStyle = "#baa07d";
    ctx.lineWidth = 2;
    ctx.strokeRect(42, 42, 684, 940);
    ctx.textAlign = "center";
    ctx.fillStyle = "#e9d9b6";
    ctx.font = "20px Georgia";
    ctx.fillText("S H I G U A N G   J O U R N A L", 384, 290);
    ctx.font = '76px "Songti SC", serif';
    ctx.fillText("拾 光", 384, 420);
    ctx.font = '24px "Songti SC", serif';
    ctx.fillText("把平凡的日子，慢慢收藏", 384, 485);
    ctx.font = "18px Georgia";
    ctx.fillText("V O L .  0 1     /     2 0 2 6", 384, 874);
  } else if (typeof page === "number") {
    const accent = ["#789080", "#b48b64", "#8a96a6", "#ae8b88"][Math.floor(page / 2) % 4];
    ctx.fillStyle = accent;
    ctx.font = "18px Georgia";
    ctx.fillText(`FIELD NOTES   /   ${String(Math.floor(page / 2) + 1).padStart(2, "0")}`, 76, 94);
    ctx.fillStyle = "#4f5148";
    ctx.font = '42px "Songti SC", serif';
    ctx.fillText(titles[Math.floor(page / 2) % titles.length], 76, 170);
    if (page % 2 === 0) {
      ctx.fillStyle = accent;
      ctx.fillRect(76, 223, 616, 355);
      ctx.fillStyle = "#e6d7b9";
      ctx.beginPath();
      ctx.arc(527, 316, 51, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#526d62";
      ctx.beginPath();
      ctx.moveTo(76, 525);
      ctx.lineTo(252, 362);
      ctx.lineTo(478, 578);
      ctx.lineTo(76, 578);
      ctx.fill();
      ctx.fillStyle = "#a7b2a0";
      ctx.beginPath();
      ctx.moveTo(296, 578);
      ctx.lineTo(533, 402);
      ctx.lineTo(692, 519);
      ctx.lineTo(692, 578);
      ctx.fill();
      ctx.font = '20px "Songti SC", serif';
      ctx.fillStyle = "#737365";
      ctx.fillText("走过的路，和那些值得记住的瞬间。", 76, 643);
    } else {
      ctx.fillStyle = "#e9e1d0";
      ctx.fillRect(76, 234, 616, 184);
      ctx.fillStyle = "#687563";
      ctx.font = '27px "Songti SC", serif';
      ctx.fillText("今天，也有值得珍藏的小事。", 112, 306);
      ctx.font = "20px Georgia";
      ctx.fillText("A little moment, a lasting memory.", 112, 364);
    }
    ctx.strokeStyle = "#dcd4c3";
    ctx.lineWidth = 1;
    for (let y = page % 2 === 0 ? 720 : 486; y < 920; y += 48) {
      ctx.beginPath();
      ctx.moveTo(76, y);
      ctx.lineTo(692, y);
      ctx.stroke();
    }
    ctx.fillStyle = "#949083";
    ctx.font = "18px Georgia";
    ctx.textAlign = "center";
    ctx.fillText(String(page + 1).padStart(2, "0"), 384, 976);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  if (reverse) {
    texture.repeat.x = -1;
    texture.offset.x = 1;
  }
  return texture;
}

function usePaperTexture(page: number | "cover" | "lining", reverse = false) {
  const texture = useMemo(() => makeTexture(page, reverse), [page, reverse]);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

function PageSurface({
  page,
  side,
  z,
  onClick,
}: {
  page: number | "lining";
  side: -1 | 1;
  z: number;
  onClick: () => void;
}) {
  const map = usePaperTexture(page);
  return (
    <mesh
      position={[(side * BOOK.width) / 2, 0, z]}
      receiveShadow
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <planeGeometry args={[BOOK.width, BOOK.height]} />
      <meshStandardMaterial map={map} roughness={0.93} />
    </mesh>
  );
}

function PaperStack({ side, count }: { side: -1 | 1; count: number }) {
  if (!count) return null;
  const depth = count * BOOK.sheet;
  return (
    <group>
      <mesh position={[(side * BOOK.width) / 2, 0, BOOK.base + depth / 2]} castShadow receiveShadow>
        <boxGeometry args={[BOOK.width, BOOK.height, depth]} />
        <meshStandardMaterial color="#e5dcc7" roughness={0.95} />
      </mesh>
      {Array.from({ length: count }, (_, i) => (
        <group key={i}>
          <mesh position={[side * BOOK.width, 0, stackTop(i) + 0.008]}>
            <boxGeometry args={[0.006, BOOK.height, 0.003]} />
            <meshStandardMaterial color="#bdb29d" roughness={1} />
          </mesh>
          <mesh position={[(side * BOOK.width) / 2, -BOOK.height / 2 - 0.001, stackTop(i) + 0.008]}>
            <boxGeometry args={[BOOK.width, 0.006, 0.003]} />
            <meshStandardMaterial color="#c4b8a2" roughness={1} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function TurningPage({ leaf, progress }: { leaf: number; progress: { current: number } }) {
  const front = usePaperTexture(leaf * 2);
  const back = usePaperTexture(leaf * 2 + 1, true);
  const geometry = useMemo(() => {
    const result = new PlaneGeometry(BOOK.width, BOOK.height, BOOK.segments, 8);
    result.translate(BOOK.width / 2, 0, 0);
    return result;
  }, []);
  const lastProgress = useRef(-1);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(() => {
    if (lastProgress.current === progress.current) return;
    lastProgress.current = progress.current;
    const points = sampleSheet(progress.current, leaf);
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const point = points[i % (BOOK.segments + 1)];
      positions.setX(i, point.x);
      positions.setZ(i, point.z);
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
  });
  return (
    <group>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial map={front} roughness={0.93} shadowSide={BackSide} />
      </mesh>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial map={back} roughness={0.93} side={BackSide} />
      </mesh>
    </group>
  );
}

function BookModel({
  state,
  complete,
  navigate,
  tilt,
  reducedMotion,
}: {
  state: BookState;
  complete: () => void;
  navigate: (direction: -1 | 1) => void;
  tilt: number;
  reducedMotion: boolean;
}) {
  const root = useRef<Group>(null);
  const cover = useRef<Group>(null);
  const elapsed = useRef(0);
  const notified = useRef(false);
  const progress = useRef(
    state.motion?.kind === "page" && state.motion.to < state.motion.from ? 1 : 0,
  );
  const coverMap = usePaperTexture("cover");
  const liningMap = usePaperTexture("lining", true);
  const motion = state.motion;
  useEffect(() => {
    elapsed.current = 0;
    notified.current = false;
  }, [motion]);
  useFrame((_, delta) => {
    if (!root.current || !cover.current) return;
    elapsed.current = Math.min(
      1,
      elapsed.current +
        Math.min(delta, 0.05) / (reducedMotion ? 0.08 : motion?.kind === "cover" ? 1.15 : 1.2),
    );
    const eased = MathUtils.smoothstep(elapsed.current, 0, 1);
    let opening = state.opened ? 1 : 0;
    if (motion?.kind === "cover") opening = MathUtils.lerp(motion.from, motion.to, eased);
    if (motion?.kind === "page") progress.current = motion.to > motion.from ? eased : 1 - eased;
    cover.current.rotation.y = -Math.PI * opening;
    cover.current.position.z = MathUtils.lerp(
      stackTop(BOOK.leaves) + 0.1,
      BOOK.base - 0.09,
      opening,
    );
    root.current.position.x = (-BOOK.width / 2) * (1 - opening);
    root.current.rotation.x = MathUtils.damp(
      root.current.rotation.x,
      (-tilt * Math.PI) / 180,
      7,
      delta,
    );
    root.current.rotation.y = MathUtils.damp(
      root.current.rotation.y,
      -0.1 * (1 - opening),
      7,
      delta,
    );
    if (motion && elapsed.current === 1 && !notified.current) {
      notified.current = true;
      complete();
    }
  });
  const turning = motion?.kind === "page";
  const leaf = turning ? Math.min(motion.from, motion.to) : 0;
  const leftCount = turning ? leaf : state.turned;
  const rightCount = turning ? BOOK.leaves - leaf - 1 : BOOK.leaves - state.turned;

  return (
    <group
      ref={root}
      rotation={[(-tilt * Math.PI) / 180, -0.1, 0]}
      position={[-BOOK.width / 2, 0, 0]}
    >
      <mesh position={[BOOK.width / 2, 0, BOOK.base - 0.09]} castShadow receiveShadow>
        <boxGeometry args={[BOOK.width + 0.18, BOOK.height + 0.2, 0.16]} />
        <meshStandardMaterial color="#78614c" roughness={0.86} />
      </mesh>
      <PaperStack side={1} count={rightCount} />
      {state.opened && <PaperStack side={-1} count={leftCount} />}
      <PageSurface
        page={rightCount ? (BOOK.leaves - rightCount) * 2 : "lining"}
        side={1}
        z={stackTop(rightCount) + 0.008}
        onClick={() => navigate(1)}
      />
      {state.opened && (
        <PageSurface
          page={leftCount ? leftCount * 2 - 1 : "lining"}
          side={-1}
          z={stackTop(leftCount) + 0.008}
          onClick={() => navigate(-1)}
        />
      )}
      {turning && <TurningPage key={leaf} leaf={leaf} progress={progress} />}
      <group ref={cover} position={[0, 0, stackTop(BOOK.leaves) + 0.1]}>
        <mesh
          position={[BOOK.width / 2, 0, 0]}
          castShadow
          receiveShadow
          onClick={(e) => {
            e.stopPropagation();
            navigate(state.opened ? -1 : 1);
          }}
        >
          <boxGeometry args={[BOOK.width + 0.18, BOOK.height + 0.2, 0.16]} />
          <meshStandardMaterial color="#78614c" roughness={0.86} />
        </mesh>
        <mesh
          position={[BOOK.width / 2, 0, 0.081]}
          onClick={(e) => {
            e.stopPropagation();
            navigate(1);
          }}
        >
          <planeGeometry args={[BOOK.width + 0.14, BOOK.height + 0.16]} />
          <meshStandardMaterial map={coverMap} roughness={0.86} />
        </mesh>
        <mesh position={[BOOK.width / 2, 0, -0.081]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[BOOK.width, BOOK.height]} />
          <meshStandardMaterial map={liningMap} roughness={0.95} />
        </mesh>
      </group>
      <mesh position={[0, 0, BOOK.base - 0.01]} castShadow receiveShadow>
        <cylinderGeometry args={[0.085, 0.085, BOOK.height + 0.12, 24]} />
        <meshStandardMaterial color="#75604b" roughness={0.95} />
      </mesh>
    </group>
  );
}

function CameraFit() {
  const { camera, size } = useThree();
  useEffect(() => {
    // Fit the entire open book, including its curved sheet, on portrait screens.
    const aspect = size.width / Math.max(1, size.height);
    const distance = Math.max(10.8, 4.5 / (Math.tan((19 * Math.PI) / 180) * aspect));
    camera.position.set(0, 0.3, distance);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height]);
  return null;
}

export default function Book3DTest({ appVersion = "dev" }: { appVersion?: string }) {
  const [state, setState] = useState<BookState>(initialState);
  const [tilt, setTilt] = useState(28);
  const [reducedMotion, setReducedMotion] = useState(false);
  const busy = state.motion !== null;
  const navigate = (direction: -1 | 1) =>
    setState((current) => {
      if (current.motion) return current;
      if (!current.opened)
        return direction === 1
          ? { ...current, motion: { kind: "cover", from: 0, to: 1 } }
          : current;
      if (current.turned === 0 && direction === -1)
        return { ...current, motion: { kind: "cover", from: 1, to: 0 } };
      const to = turnTarget(current.turned, direction);
      return to === current.turned
        ? current
        : { ...current, motion: { kind: "page", from: current.turned, to } };
    });
  const complete = () =>
    setState((current) => {
      const motion = current.motion;
      if (!motion) return current;
      return motion.kind === "cover"
        ? { ...current, opened: motion.to === 1, motion: null }
        : { ...current, turned: motion.to, motion: null };
    });
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLElement &&
        (event.target.matches("input, textarea, select") || event.target.isContentEditable)
      )
        return;
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        navigate(event.key === "ArrowRight" ? 1 : -1);
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, []);
  const status = busy
    ? state.motion?.kind === "cover"
      ? "轻轻翻开，慢慢合上"
      : "翻过一页，留住一刻"
    : !state.opened
      ? "点击封面，打开这本手帐"
      : state.turned === BOOK.leaves
        ? "已到最后一页，可以向前翻阅"
        : "点击左、右书页翻阅，也可以使用方向键";
  return (
    <main className="book3d-test">
      <div className="book3d-layout">
        <header className="book3d-header">
          <div>
            <p className="book3d-eyebrow">
              SHIGUANG / THE BOOK STUDY <span>v{appVersion}</span>
            </p>
            <h1>像翻开一本真正的手帐</h1>
            <p className="book3d-subtitle">有厚度的封面，柔软的纸页，以及纸张落下时的光影。</p>
          </div>
          <a href="/">返回手帐</a>
        </header>
        <section className="book3d-stage" aria-label="3D 书本翻页预览">
          <span className="book3d-stage-label">拾光集 · 第一册</span>
          <Canvas
            shadows
            dpr={[1, 2]}
            camera={{ position: [0, 0.3, 12], fov: 38, near: 0.1, far: 100 }}
            gl={{ antialias: true }}
            fallback={<p>当前浏览器无法显示 3D 书本，请启用硬件加速后重试。</p>}
          >
            <CameraFit />
            <color attach="background" args={["#e9e4db"]} />
            <ambientLight intensity={0.85} />
            <hemisphereLight args={["#fff9eb", "#8e8272", 1.1]} />
            <directionalLight
              position={[-3, 6, 8]}
              intensity={2.5}
              castShadow
              shadow-mapSize={[2048, 2048]}
              shadow-camera-left={-8}
              shadow-camera-right={8}
              shadow-camera-top={8}
              shadow-camera-bottom={-8}
              shadow-normalBias={0.025}
              shadow-bias={-0.0001}
              shadow-radius={4}
            />
            <BookModel
              state={state}
              complete={complete}
              navigate={navigate}
              tilt={tilt}
              reducedMotion={reducedMotion}
            />
            <mesh position={[0, 0, -2.2]} receiveShadow>
              <planeGeometry args={[200, 200]} />
              <meshStandardMaterial color="#e9e4db" roughness={1} />
            </mesh>
          </Canvas>
          <div className="book3d-status" role="status" aria-live="polite">
            {status}
          </div>
        </section>
        <footer className="book3d-controls">
          <label className="book3d-angle">
            视角{" "}
            <input
              aria-label="书本视角"
              type="range"
              min="0"
              max="48"
              value={tilt}
              onChange={(e) => setTilt(Number(e.target.value))}
            />
            <span>{tilt}°</span>
          </label>
          <div className="book3d-navigation">
            <button disabled={busy || !state.opened} onClick={() => navigate(-1)}>
              {state.turned === 0 ? "合上封面" : "← 上一页"}
            </button>
            <span className="book3d-counter">
              {state.opened
                ? `${String(state.turned).padStart(2, "0")} / ${String(BOOK.leaves).padStart(2, "0")}`
                : "封 面"}
            </span>
            <button
              disabled={busy || (state.opened && state.turned === BOOK.leaves)}
              onClick={() => navigate(1)}
            >
              {state.opened ? "下一页 →" : "打开手帐"}
            </button>
          </div>
          <button className="book3d-reset" disabled={busy} onClick={() => setState(initialState)}>
            重新开始
          </button>
        </footer>
        <p className="book3d-note">翻页效果实验 · 示例内容</p>
      </div>
    </main>
  );
}
