"use client";

import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BackSide,
  DoubleSide,
  CanvasTexture,
  Group,
  MathUtils,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
} from "three";
import {
  BOOK,
  sampleSheet,
  stackTop,
  nextBookTurn,
  finishBookTurn,
  settleDrag,
  advanceDrag,
  bindingProfile,
  TURN_SECONDS,
  type DragTurn,
  type BookTurn,
  type BookPosition,
  dragTurnProgress,
  dragTurnSpan,
  releaseTurn,
} from "@/lib/book3d-motion";
import "./book3d.css";

type Motion = BookTurn;
type BookState = BookPosition & { motion: Motion | null };
const initialState: BookState = { opened: false, turned: 0, backClosed: false, motion: null };
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
  onPointerDown,
}: {
  page: number | "lining";
  side: -1 | 1;
  z: number;
  onPointerDown: (event: ThreeEvent<PointerEvent>) => void;
}) {
  const map = usePaperTexture(page);
  return (
    <mesh position={[(side * BOOK.width) / 2, 0, z]} receiveShadow onPointerDown={onPointerDown}>
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

function BookBinding({
  leftCount,
  rightCount,
  leaf,
  progress,
}: {
  leftCount: number;
  rightCount: number;
  leaf: number | null;
  progress: { current: number };
}) {
  const geometry = useMemo(() => new PlaneGeometry(0.28, BOOK.height, 32, 1), []);
  const last = useRef("");
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(() => {
    const left = stackTop(leftCount) + 0.008;
    const right = stackTop(rightCount) + 0.008;
    const hinge = leaf === null ? Math.max(left, right) : sampleSheet(progress.current, leaf)[0].z;
    const key = `${left}/${right}/${hinge}`;
    if (last.current === key) return;
    last.current = key;
    const profile = bindingProfile(left, right, hinge);
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) positions.setZ(i, profile[i % 33].z + 0.001);
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
  });
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial color="#fffdf6" side={DoubleSide} roughness={0.98} />
    </mesh>
  );
}

function BookModel({
  state,
  complete,
  tilt,
  reducedMotion,
  beginDrag,
}: {
  state: BookState;
  complete: () => void;
  tilt: number;
  reducedMotion: boolean;
  beginDrag: (motion: Motion) => void;
}) {
  const { camera, size } = useThree();
  const gesture = useRef<{
    id: number;
    startX: number;
    startY: number;
    span: number;
    direction: -1 | 1;
    control: DragTurn;
    element: HTMLElement;
  } | null>(null);
  const root = useRef<Group>(null);
  const cover = useRef<Group>(null);
  const backCover = useRef<Group>(null);
  const elapsed = useRef(0);
  const notified = useRef(false);
  const progress = useRef(
    state.motion?.kind === "page" && state.motion.to < state.motion.from ? 1 : 0,
  );
  const coverMap = usePaperTexture("cover");
  const liningMap = usePaperTexture("lining", true);
  const motion = state.motion;
  const startPageDrag = (event: ThreeEvent<PointerEvent>, direction: -1 | 1) => {
    event.stopPropagation();
    if (event.button !== 0 || state.motion || gesture.current || !root.current) return;
    const requested = nextBookTurn(state, direction);
    if (!requested) return;
    // Project the page's full travel into CSS pixels, including current zoom and tilt.
    const left = root.current.localToWorld(new Vector3(-BOOK.width, 0, 0)).project(camera);
    const right = root.current.localToWorld(new Vector3(BOOK.width, 0, 0)).project(camera);
    const span = dragTurnSpan((Math.abs(right.x - left.x) * size.width) / 2, size.width);
    const control: DragTurn = { progress: 0, target: null, settleFrom: 0, elapsed: 0 };
    const element = event.nativeEvent.target as HTMLElement;
    element.setPointerCapture(event.pointerId);
    gesture.current = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      span,
      direction,
      control,
      element,
    };
    beginDrag({ ...requested, drag: control });
  };
  useEffect(() => {
    const move = (event: PointerEvent) => {
      const current = gesture.current;
      if (!current || current.id !== event.pointerId) return;
      current.control.progress = dragTurnProgress(
        event.clientX - current.startX,
        current.direction,
        current.span,
      );
    };
    const finish = (event?: PointerEvent, cancelled = false) => {
      const current = gesture.current;
      if (!current || (event && current.id !== event.pointerId)) return;
      if (event && !cancelled) move(event);
      settleDrag(
        current.control,
        releaseTurn(
          current.control.progress,
          event ? Math.hypot(event.clientX - current.startX, event.clientY - current.startY) : 0,
          cancelled,
        ),
      );
      gesture.current = null;
      if (current.element.hasPointerCapture(current.id))
        current.element.releasePointerCapture(current.id);
    };
    // A capture change is not a release. Global listeners continue the drag;
    // if release happened outside the window, settle when the pointer returns.
    const trackMove = (event: PointerEvent) => {
      if (gesture.current?.id === event.pointerId && event.buttons === 0) finish(event);
      else move(event);
    };
    const up = (event: PointerEvent) => finish(event);
    const cancel = (event: PointerEvent) => finish(event, true);
    const blur = () => finish(undefined, true);
    window.addEventListener("pointermove", trackMove, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", cancel, true);

    window.addEventListener("blur", blur);
    return () => {
      blur();
      window.removeEventListener("pointermove", trackMove, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", cancel, true);

      window.removeEventListener("blur", blur);
    };
  }, []);
  useEffect(() => {
    elapsed.current = 0;
    notified.current = false;
  }, [motion]);
  useFrame((_, delta) => {
    if (!root.current || !cover.current || !backCover.current) return;
    elapsed.current = Math.min(
      1,
      elapsed.current +
        Math.min(delta, 0.05) /
          (reducedMotion ? 0.08 : motion?.kind === "page" ? TURN_SECONDS.page : TURN_SECONDS.cover),
    );
    const eased = MathUtils.smoothstep(elapsed.current, 0, 1);
    let finished = elapsed.current === 1;
    let turn = eased;
    if (motion?.drag) {
      finished = advanceDrag(
        motion.drag,
        Math.min(delta, 0.05),
        reducedMotion ? 0.08 : motion.kind === "page" ? TURN_SECONDS.page : TURN_SECONDS.cover,
      );
      turn = motion.drag.progress;
    }
    let opening = state.opened ? 1 : 0;
    if (motion?.kind === "cover") opening = MathUtils.lerp(motion.from, motion.to, turn);
    if (motion?.kind === "page") progress.current = motion.to > motion.from ? turn : 1 - turn;
    cover.current.rotation.y = -Math.PI * opening;
    cover.current.position.z = MathUtils.lerp(
      stackTop(BOOK.leaves) + 0.1,
      BOOK.base - 0.09,
      opening,
    );
    let backClosing = state.backClosed ? 1 : 0;
    if (motion?.kind === "back-cover") backClosing = MathUtils.lerp(motion.from, motion.to, turn);
    backCover.current.rotation.y = -Math.PI * backClosing;
    backCover.current.position.z = MathUtils.lerp(
      BOOK.base - 0.09,
      stackTop(BOOK.leaves) + 0.1,
      backClosing,
    );
    root.current.position.x = (-BOOK.width / 2) * (1 - opening) + (BOOK.width / 2) * backClosing;
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
    if (motion && finished && !notified.current) {
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
      <group ref={backCover} position={[0, 0, BOOK.base - 0.09]}>
        <mesh
          position={[BOOK.width / 2, 0, 0]}
          castShadow
          receiveShadow
          onPointerDown={(event) => startPageDrag(event, state.backClosed ? -1 : 1)}
        >
          <boxGeometry args={[BOOK.width + 0.18, BOOK.height + 0.2, 0.16]} />
          <meshStandardMaterial color="#78614c" roughness={0.86} />
        </mesh>
        <mesh
          position={[BOOK.width / 2, 0, 0.081]}
          receiveShadow
          onPointerDown={(event) => startPageDrag(event, 1)}
        >
          <planeGeometry args={[BOOK.width, BOOK.height]} />
          <meshStandardMaterial map={liningMap} roughness={0.95} />
        </mesh>
        <mesh
          position={[BOOK.width / 2, 0, -0.081]}
          rotation={[0, Math.PI, 0]}
          onPointerDown={(event) => startPageDrag(event, -1)}
        >
          <planeGeometry args={[BOOK.width + 0.14, BOOK.height + 0.16]} />
          <meshStandardMaterial color="#78614c" roughness={0.86} />
        </mesh>
      </group>
      <PaperStack side={1} count={rightCount} />
      {state.opened && <PaperStack side={-1} count={leftCount} />}
      {!state.backClosed && motion?.kind !== "back-cover" && (
        <PageSurface
          page={rightCount ? (BOOK.leaves - rightCount) * 2 : "lining"}
          side={1}
          z={stackTop(rightCount) + 0.008}
          onPointerDown={(event) => startPageDrag(event, 1)}
        />
      )}
      {state.opened && (
        <PageSurface
          page={leftCount ? leftCount * 2 - 1 : "lining"}
          side={-1}
          z={stackTop(leftCount) + 0.008}
          onPointerDown={(event) => startPageDrag(event, -1)}
        />
      )}
      {turning && <TurningPage key={leaf} leaf={leaf} progress={progress} />}
      <group ref={cover} position={[0, 0, stackTop(BOOK.leaves) + 0.1]}>
        <mesh
          position={[BOOK.width / 2, 0, 0]}
          castShadow
          receiveShadow
          onPointerDown={(event) => startPageDrag(event, state.opened ? -1 : 1)}
        >
          <boxGeometry args={[BOOK.width + 0.18, BOOK.height + 0.2, 0.16]} />
          <meshStandardMaterial color="#78614c" roughness={0.86} />
        </mesh>
        <mesh
          position={[BOOK.width / 2, 0, 0.081]}
          onPointerDown={(event) => startPageDrag(event, 1)}
        >
          <planeGeometry args={[BOOK.width + 0.14, BOOK.height + 0.16]} />
          <meshStandardMaterial map={coverMap} roughness={0.86} />
        </mesh>
        <mesh position={[BOOK.width / 2, 0, -0.081]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[BOOK.width, BOOK.height]} />
          <meshStandardMaterial map={liningMap} roughness={0.95} />
        </mesh>
      </group>
      {state.opened && !state.backClosed && (
        <BookBinding
          leftCount={leftCount}
          rightCount={rightCount}
          leaf={turning ? leaf : null}
          progress={progress}
        />
      )}
    </group>
  );
}

function WoodenDesk({ tilt }: { tilt: number }) {
  const desk = useRef<Group>(null);
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1536;
    canvas.height = 1024;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#b18c61";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Long, gently wandering grain with subtle board joints, all generated locally.
    for (let row = 0; row < 1024; row += 2) {
      const shade = (Math.sin(row * 1.73) + 1) / 2;
      ctx.strokeStyle = `rgba(74,43,20,${0.025 + shade * 0.07})`;
      ctx.lineWidth = 0.5 + shade;
      ctx.beginPath();
      for (let x = 0; x <= 1536; x += 8) {
        const y = row + Math.sin(x / 130 + row / 60) * 3 + Math.sin(x / 320 + row / 32) * 5;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    for (let y = 256; y < 1024; y += 256) {
      ctx.fillStyle = "rgba(67,43,24,.13)";
      ctx.fillRect(0, y, 1536, 2);
      ctx.fillStyle = "rgba(255,234,199,.16)";
      ctx.fillRect(0, y + 2, 1536, 1);
    }
    const result = new CanvasTexture(canvas);
    result.colorSpace = SRGBColorSpace;
    result.anisotropy = 8;
    return result;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  useFrame((_, delta) => {
    if (desk.current)
      desk.current.rotation.x = MathUtils.damp(
        desk.current.rotation.x,
        (-tilt * Math.PI) / 180,
        7,
        delta,
      );
  });
  return (
    <group ref={desk} rotation={[(-tilt * Math.PI) / 180, 0, 0]}>
      <mesh position={[0, 0, BOOK.base - 0.34]} receiveShadow>
        <boxGeometry args={[38, 28, 0.3]} />
        <meshStandardMaterial map={texture} roughness={0.88} />
      </mesh>
    </group>
  );
}

function CameraFit({ zoom, pan }: { zoom: number; pan: { x: number; y: number } }) {
  const { camera, size } = useThree();
  useEffect(() => {
    // Fit the entire open book, including its curved sheet, on portrait screens.
    const aspect = size.width / Math.max(1, size.height);
    const distance = Math.max(10.8, 4.5 / (Math.tan((19 * Math.PI) / 180) * aspect));
    const x = pan.x * 4.5 * (1 - 1 / zoom);
    const y = pan.y * 3.5 * (1 - 1 / zoom);
    camera.zoom = zoom;
    camera.position.set(x, y + 0.3, distance);
    camera.lookAt(x, y, 0);
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height, zoom, pan.x, pan.y]);
  return null;
}

export default function Book3DTest({ appVersion = "dev" }: { appVersion?: string }) {
  const [state, setState] = useState<BookState>(initialState);
  const [tilt, setTilt] = useState(28);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [viewMode, setViewMode] = useState<"turn" | "pan">("turn");
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setViewMode("turn");
  };
  const [reducedMotion, setReducedMotion] = useState(false);
  const busy = state.motion !== null;
  const navigate = (direction: -1 | 1) =>
    setState((current) => {
      if (current.motion) return current;
      const motion = nextBookTurn(current, direction);
      return motion ? { ...current, motion } : current;
    });
  const complete = () =>
    setState((current) => {
      const motion = current.motion;
      if (!motion) return current;
      return { ...finishBookTurn(current, motion), motion: null };
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
    ? state.motion?.kind !== "page"
      ? "轻轻翻开，慢慢合上"
      : "翻过一页，留住一刻"
    : state.backClosed
      ? "封底已合上 · 向右拖动重新打开"
      : !state.opened
        ? "点击或拖动封面，打开这本手帐"
        : state.turned === BOOK.leaves
          ? "向左拖动封底，合上这本手帐"
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
        <section
          className={`book3d-stage ${zoom > 1 && viewMode === "pan" ? "book3d-stage-pan" : "book3d-stage-turn"}`}
          aria-label="3D 书本翻页预览"
          onContextMenu={(e) => e.preventDefault()}
          onPointerDownCapture={(e) => {
            if (
              busy ||
              zoom <= 1 ||
              drag.current ||
              !(viewMode === "pan" || e.button === 2 || e.shiftKey)
            )
              return;
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
          }}
          onPointerMoveCapture={(e) => {
            const previous = drag.current;
            if (!previous || previous.id !== e.pointerId) return;
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            const dx = (e.clientX - previous.x) / rect.width;
            const dy = (e.clientY - previous.y) / rect.height;
            setPan((value) => ({
              x: MathUtils.clamp(value.x - (dx * 3) / zoom, -1, 1),
              y: MathUtils.clamp(value.y + (dy * 3) / zoom, -1, 1),
            }));
            drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
          }}
          onPointerUpCapture={(e) => {
            if (drag.current?.id !== e.pointerId) return;
            e.stopPropagation();
            drag.current = null;
            e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onClickCapture={(e) => {
            if (zoom > 1 && (viewMode === "pan" || e.shiftKey)) e.stopPropagation();
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onLostPointerCapture={() => {
            drag.current = null;
          }}
        >
          <span className="book3d-stage-label">拾光集 · 第一册</span>
          <Canvas
            shadows
            dpr={[1, 2]}
            camera={{ position: [0, 0.3, 12], fov: 38, near: 0.1, far: 100 }}
            gl={{ antialias: true }}
            fallback={<p>当前浏览器无法显示 3D 书本，请启用硬件加速后重试。</p>}
          >
            <CameraFit zoom={zoom} pan={pan} />
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
              tilt={tilt}
              reducedMotion={reducedMotion}
              beginDrag={(motion) =>
                setState((current) => (current.motion ? current : { ...current, motion }))
              }
            />
            <WoodenDesk tilt={tilt} />
          </Canvas>
          <div className="book3d-status" role="status" aria-live="polite">
            {zoom > 1 && viewMode === "pan"
              ? "拖动移动视图 · 选择「翻页」即可拖动书页"
              : state.opened && !state.backClosed && state.turned < BOOK.leaves && !busy
                ? "左右拖动书页，松手翻过或回弹 · 放大后也可翻页"
                : status}
          </div>
        </section>
        <div className="book3d-zoom-controls" aria-label="阅读缩放控制">
          <button
            aria-label="缩小手帐"
            disabled={busy || zoom <= 1}
            onClick={() => setZoom((value) => Math.max(1, value - 0.25))}
          >
            −
          </button>
          <label>
            缩放{" "}
            <input
              aria-label="手帐缩放比例"
              disabled={busy}
              type="range"
              min="100"
              max="300"
              step="25"
              value={zoom * 100}
              onChange={(e) => setZoom(Number(e.target.value) / 100)}
            />
          </label>
          <output aria-live="polite">{Math.round(zoom * 100)}%</output>
          <button
            aria-label="放大手帐"
            disabled={busy || zoom >= 3}
            onClick={() => setZoom((value) => Math.min(3, value + 0.25))}
          >
            ＋
          </button>
          <button disabled={busy} onClick={resetView}>
            恢复全景
          </button>
          {zoom > 1 && (
            <div className="book3d-interaction-mode" role="group" aria-label="鼠标操作方式">
              <button
                disabled={busy}
                aria-pressed={viewMode === "turn"}
                onClick={() => setViewMode("turn")}
              >
                翻页
              </button>
              <button
                disabled={busy}
                aria-pressed={viewMode === "pan"}
                onClick={() => setViewMode("pan")}
              >
                移动视图
              </button>
            </div>
          )}
        </div>
        <footer className="book3d-controls">
          <label className="book3d-angle">
            视角{" "}
            <input
              aria-label="书本视角"
              disabled={busy}
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
              {state.backClosed ? "打开封底" : state.turned === 0 ? "合上封面" : "← 上一页"}
            </button>
            <span className="book3d-counter">
              {state.backClosed
                ? "封 底"
                : state.opened
                  ? `${String(state.turned).padStart(2, "0")} / ${String(BOOK.leaves).padStart(2, "0")}`
                  : "封 面"}
            </span>
            <button disabled={busy || state.backClosed} onClick={() => navigate(1)}>
              {state.backClosed
                ? "已合上"
                : !state.opened
                  ? "打开手帐"
                  : state.turned === BOOK.leaves
                    ? "合上封底"
                    : "下一页 →"}
            </button>
          </div>
          <button
            className="book3d-reset"
            disabled={busy}
            onClick={() => {
              setState(initialState);
              resetView();
            }}
          >
            重新开始
          </button>
        </footer>
        <p className="book3d-note">翻页效果实验 · 示例内容</p>
      </div>
    </main>
  );
}
