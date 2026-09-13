"use client";

import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { forwardRef, useImperativeHandle, useEffect, useMemo, useRef, useState } from "react";
import {
  BackSide,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  DoubleSide,
  CanvasTexture,
  ExtrudeGeometry,
  Group,
  MathUtils,
  PlaneGeometry,
  ShapeGeometry,
  SRGBColorSpace,
  Vector3,
} from "three";
import {
  sampleSheet as samplePaper,
  type PaperStyle,
  finishBookTurn,
  settleDrag,
  advanceDrag,
  TURN_SECONDS,
  type DragTurn,
  type BookTurn,
  type BookPosition,
  dragTurnProgress,
  dragTurnSpan,
  presentationCamera,
  releaseTurn,
} from "@/lib/book3d-motion";
import {
  COVER_MATERIALS,
  createCoverTextures,
  createClothSurfaceMaps,
  type CoverMaterial,
} from "./cover-materials";
import "./book3d.css";
import BookSpine from "./BookSpine";
import { coverOutline } from "./cover-geometry";
import { createPaperGeometry, createPaperStackGeometry, paperCurveSample } from "./paper-geometry";
import { createPortal } from "react-dom";
import {
  BookSceneContext,
  useBookScene,
  type Book3DContent,
  type Book3DHandle,
} from "./book-scene-context";

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

function makeTexture(page: number | "lining", reverse = false) {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = page === "lining" ? "#e6dfd0" : "#faf5e9";
  ctx.fillRect(0, 0, 768, 1024);
  // Deterministic fine grain; no image downloads or private journal data.
  for (let y = 0; y < 1024; y += 3) {
    for (let x = 0; x < 768; x += 3) {
      ctx.fillStyle = `rgba(60,42,23,${((x * 13 + y * 7) % 19) / 900})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  if (typeof page === "number") {
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

function usePaperTexture(page: number | "lining", reverse = false) {
  const { content } = useBookScene();
  const texture = useMemo(() => {
    if (!content || page === "lining") return makeTexture(page, reverse);
    const result = new CanvasTexture(content.page(page));
    result.colorSpace = SRGBColorSpace;
    result.anisotropy = 8;
    if (reverse) {
      result.repeat.x = -1;
      result.offset.x = 1;
    }
    return result;
  }, [page, reverse, content]);
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
  const { BOOK } = useBookScene();
  const map = usePaperTexture(page);
  const geometry = useMemo(() => createPaperGeometry(BOOK, side), [BOOK, side]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} position={[0, 0, z]} receiveShadow onPointerDown={onPointerDown}>
      <meshStandardMaterial map={map} roughness={0.93} />
    </mesh>
  );
}

function PaperStack({ side, count }: { side: -1 | 1; count: number }) {
  const { BOOK } = useBookScene();
  const geometry = useMemo(() => count ? createPaperStackGeometry(BOOK, count, side) : null, [BOOK, count, side]);
  useEffect(() => () => { geometry?.body.dispose(); geometry?.edges.dispose(); }, [geometry]);
  if (!geometry) return null;
  return (
    <group position={[0, 0, BOOK.base]}>
      <mesh geometry={geometry.body} castShadow receiveShadow>
        <meshStandardMaterial color="#f1eadb" roughness={0.96} />
      </mesh>
      <lineSegments geometry={geometry.edges} raycast={() => {}}>
        <lineBasicMaterial color="#d2c7b2" />
      </lineSegments>
    </group>
  );
}

function TurningPage({
  leaf,
  progress,
  paperStyle,
  dragControl,
  reducedMotion,
}: {
  dragControl?: DragTurn;
  reducedMotion: boolean;
  leaf: number;
  progress: { current: number };
  paperStyle: PaperStyle;
}) {
  const { BOOK } = useBookScene();
  const front = usePaperTexture(leaf * 2);
  const back = usePaperTexture(leaf * 2 + 1, true);
  const geometry = useMemo(() => {
    const result = createPaperGeometry(BOOK);
    result.setAttribute(
      "color",
      new Float32BufferAttribute(new Float32Array(result.attributes.position.count * 3).fill(1), 3),
    );
    return result;
  }, [BOOK]);
  const lastProgress = useRef(-1);
  const twist = useRef(0);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame((_, delta) => {
    const targetTwist =
      paperStyle === "bound" && !reducedMotion ? (dragControl?.verticalBias ?? 0.45) : 0;
    const nextTwist = MathUtils.damp(twist.current, targetTwist, 12, Math.min(delta, 0.05));
    if (lastProgress.current === progress.current && Math.abs(nextTwist - twist.current) < 0.00001)
      return;
    twist.current = nextTwist;
    lastProgress.current = progress.current;
    const rows =
      paperStyle === "bound"
        ? Array.from({ length: 9 }, (_, row) =>
            samplePaper(progress.current, leaf, BOOK, paperStyle, (1 - row / 4) * twist.current),
          )
        : [samplePaper(progress.current, leaf, BOOK, paperStyle)];
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const points = rows.length === 1 ? rows[0] : rows[Math.floor(i / (geometry.parameters.widthSegments + 1))];
      const point = paperCurveSample(points, geometry.attributes.uv.getX(i));
      positions.setX(i, point.x);
      positions.setZ(i, point.z);
      // A restrained tone change follows each strip's orientation, on both faces.
      const tone =
        paperStyle !== "original"
          ? 1 - 0.16 * Math.sin(Math.PI * progress.current) * (1 - point.facing)
          : 1;
      geometry.attributes.color.setXYZ(i, tone, tone, tone);
    }
    geometry.attributes.color.needsUpdate = true;
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
  });
  return (
    <group>
      <mesh geometry={geometry} castShadow>
        {paperStyle !== "original" ? (
          <meshPhysicalMaterial
            map={front}
            vertexColors
            roughness={0.93}
            sheen={0.16}
            sheenColor="#fff6e5"
            shadowSide={DoubleSide}
          />
        ) : (
          <meshStandardMaterial map={front} roughness={0.93} shadowSide={DoubleSide} />
        )}
      </mesh>
      <mesh geometry={geometry}>
        {paperStyle !== "original" ? (
          <meshPhysicalMaterial
            map={back}
            vertexColors
            roughness={0.93}
            sheen={0.16}
            sheenColor="#fff6e5"
            side={BackSide}
          />
        ) : (
          <meshStandardMaterial map={back} roughness={0.93} side={BackSide} />
        )}
      </mesh>
    </group>
  );
}

/** Soft page-to-page shade, following Sketchbook's gutter fade rather than a hard black edge. */
function PageShade({
  progress,
  leftCount,
  rightCount,
}: {
  progress: { current: number };
  leftCount: number;
  rightCount: number;
}) {
  const { BOOK, stackTop } = useBookScene();
  const left = useRef<Mesh<PlaneGeometry, MeshBasicMaterial>>(null);
  const right = useRef<Mesh<PlaneGeometry, MeshBasicMaterial>>(null);
  const map = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    const gradient = ctx.createLinearGradient(0, 0, 128, 0);
    gradient.addColorStop(0, "rgba(54,37,20,.7)");
    gradient.addColorStop(0.65, "rgba(54,37,20,.12)");
    gradient.addColorStop(1, "rgba(54,37,20,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    ctx.globalCompositeOperation = "destination-in";
    const fade = ctx.createLinearGradient(0, 0, 0, 128);
    fade.addColorStop(0, "transparent");
    fade.addColorStop(0.07, "black");
    fade.addColorStop(0.93, "black");
    fade.addColorStop(1, "transparent");
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, 128, 128);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    return texture;
  }, []);
  useEffect(() => () => map.dispose(), [map]);
  useFrame(() => {
    const p = progress.current,
      lift = Math.sin(Math.PI * p);
    if (left.current) left.current.material.opacity = lift * 0.26 * p;
    if (right.current) right.current.material.opacity = lift * 0.26 * (1 - p);
  });
  return (
    <group>
      {([-1, 1] as const).map((side) => (
        <mesh
          key={side}
          ref={side === -1 ? left : right}
          position={[
            side * BOOK.width * 0.37,
            0,
            stackTop(side === -1 ? leftCount : rightCount) + 0.012,
          ]}
          rotation={[0, 0, side === -1 ? Math.PI : 0]}
          raycast={() => {}}
        >
          <planeGeometry args={[BOOK.width * 0.74, BOOK.height]} />
          <meshBasicMaterial
            map={map}
            transparent
            opacity={0}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

function RoundedCoverFace({ lining = false, flipped = false }: { lining?: boolean; flipped?: boolean }) {
  const { BOOK } = useBookScene();
  const width = BOOK.width + (lining ? 0.12 : 0.1);
  const height = BOOK.height + (lining ? 0.16 : 0.14);
  const geometry = useMemo(() => {
    const result = new ShapeGeometry(
      coverOutline(
        width,
        height,
        lining ? 0.16 : 0.15,
        lining ? null : flipped ? "right" : "left",
      ),
      10,
    );
    const position = result.attributes.position;
    const uv = new Float32Array(position.count * 2);
    for (let i = 0; i < position.count; i += 1) {
      uv[i * 2] = position.getX(i) / width + 0.5;
      uv[i * 2 + 1] = position.getY(i) / height + 0.5;
    }
    result.setAttribute("uv", new Float32BufferAttribute(uv, 2));
    return result;
  }, [width, height, lining, flipped]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <primitive object={geometry} attach="geometry" />;
}

function CoverBoard({ detailed }: { detailed: boolean }) {
  const { BOOK } = useBookScene();
  const rounded = useMemo(
    () => {
      if (!detailed) return null;
      const bevel = Math.min(0.012, BOOK.cover * 0.24);
      const result = new ExtrudeGeometry(
        coverOutline(BOOK.width + 0.12, BOOK.height + 0.16, 0.16),
        {
          depth: BOOK.cover - bevel * 2,
          steps: 1,
          curveSegments: 10,
          bevelEnabled: true,
          bevelSegments: 3,
          bevelSize: 0.026,
          bevelThickness: bevel,
        },
      );
      result.translate(0, 0, -(BOOK.cover - bevel * 2) / 2);
      return result;
    },
    [detailed, BOOK.width, BOOK.height, BOOK.cover],
  );
  useEffect(() => () => rounded?.dispose(), [rounded]);
  return rounded ? (
    <primitive object={rounded} attach="geometry" />
  ) : (
    <boxGeometry args={[BOOK.width + 0.12, BOOK.height + 0.16, BOOK.cover]} />
  );
}

function BookModel({
  state,
  complete,
  reducedMotion,
  beginDrag,
  material,
  disabled,
  paperStyle,
  presentationOpening,
}: {
  disabled: boolean;
  paperStyle: PaperStyle;
  state: BookState;
  material: CoverMaterial;
  complete: () => void;
  reducedMotion: boolean;
  beginDrag: (motion: Motion) => void;
  presentationOpening: { current: number };
}) {
  const { BOOK, content, stackTop, coverHeight, coverPose, nextBookTurn } = useBookScene();
  // Cover construction is independent of the approved first-edition page curl.
  // The standalone preview must use the same original turn as appreciation mode.
  const turnStyle: PaperStyle = "original";
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
  const spinePose = useRef({ front: state.opened ? 1 : 0, back: state.backClosed ? 1 : 0 });
  const elapsed = useRef(0);
  const notified = useRef(false);
  const progress = useRef(
    state.motion?.kind === "page" && state.motion.to < state.motion.from ? 1 : 0,
  );
  const surface = {
    ...COVER_MATERIALS[material],
    ...(content ? { color: content.color, edge: content.spineColor ?? content.color } : {}),
  };
  const coverTextures = useMemo(() => {
    const textures = createCoverTextures(material, content?.color, content?.plainCover);
    if (content) {
      textures.front.dispose();
      textures.front = new CanvasTexture(content.cover());
      textures.front.colorSpace = SRGBColorSpace;
      textures.front.anisotropy = 8;
    }
    return textures;
  }, [material, content]);
  useEffect(
    () => () => {
      Object.values(coverTextures).forEach((texture) => texture.dispose());
    },
    [coverTextures],
  );
  const clothMaps = useMemo(
    () => (paperStyle === "bound" && material === "fabric" ? createClothSurfaceMaps() : null),
    [paperStyle, material],
  );
  useEffect(
    () => () => {
      clothMaps?.normal.dispose();
      clothMaps?.roughness.dispose();
    },
    [clothMaps],
  );
  const liningMap = usePaperTexture("lining", true);
  const motion = state.motion;
  const startPageDrag = (event: ThreeEvent<PointerEvent>, direction: -1 | 1) => {
    event.stopPropagation();
    if (disabled || event.button !== 0 || state.motion || gesture.current || !root.current) return;
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
      current.control.verticalBias = MathUtils.clamp(
        (event.clientY - current.startY) / (current.span * 0.3),
        -1,
        1,
      );
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
    presentationOpening.current = opening;
    if (motion?.kind === "page") progress.current = motion.to > motion.from ? turn : 1 - turn;
    const frontPose = coverPose(opening, "front");
    cover.current.rotation.y = frontPose.angle;
    cover.current.position.z = frontPose.z;
    let backClosing = state.backClosed ? 1 : 0;
    if (motion?.kind === "back-cover") backClosing = MathUtils.lerp(motion.from, motion.to, turn);
    spinePose.current.front = opening;
    spinePose.current.back = backClosing;
    const backPose = coverPose(backClosing, "back");
    backCover.current.rotation.y = backPose.angle;
    backCover.current.position.z = backPose.z;
    root.current.position.x = (-BOOK.width / 2) * (1 - opening) + (BOOK.width / 2) * backClosing;
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
    <group ref={root} position={[-BOOK.width / 2, 0, 0]}>
      {paperStyle === "bound" && (
        <BookSpine
          book={BOOK}
          pose={spinePose}
          material={material}
          bump={coverTextures.bump}
          color={content?.spineColor ?? surface.color}
          plain={content?.plainSpine}
          flat={content?.plainCover}
          title={content?.title}
          edition={content ? "" : "VOL. 01"}
        />
      )}
      <group ref={backCover} position={[0, 0, coverHeight("below")]}>
        <mesh
          position={[BOOK.width / 2, 0, 0]}
          castShadow
          onPointerDown={(event) => startPageDrag(event, state.backClosed ? -1 : 1)}
        >
          <CoverBoard detailed={paperStyle === "bound"} />
          <meshStandardMaterial color={surface.edge} roughness={surface.roughness} />
        </mesh>
        <mesh
          position={[BOOK.width / 2, 0, BOOK.cover / 2 + 0.001]}
          onPointerDown={(event) => startPageDrag(event, 1)}
        >
          <RoundedCoverFace lining />
          <meshStandardMaterial map={liningMap} roughness={0.95} />
        </mesh>
        <mesh
          position={[BOOK.width / 2, 0, -(BOOK.cover / 2 + 0.001)]}
          rotation={[0, Math.PI, 0]}
          onPointerDown={(event) => startPageDrag(event, -1)}
        >
          <RoundedCoverFace flipped />
          <meshPhysicalMaterial
            map={coverTextures.back}
            bumpMap={content?.plainCover ? null : coverTextures.bump}
            normalMap={clothMaps?.normal ?? null}
            normalScale={[0.28, 0.28]}
            roughnessMap={clothMaps?.roughness ?? null}
            bumpScale={content?.plainCover ? 0 : surface.bump}
            roughness={surface.roughness}
            clearcoat={surface.clearcoat}
            clearcoatRoughness={0.7}
            sheen={surface.sheen}
            sheenColor={surface.color}
          />
        </mesh>
      </group>
      <PaperStack side={1} count={rightCount} />
      {state.opened && <PaperStack side={-1} count={leftCount} />}
      {!state.backClosed && rightCount > 0 && (
        <PageSurface
          page={rightCount ? (BOOK.leaves - rightCount) * 2 : "lining"}
          side={1}
          z={stackTop(rightCount) + 0.008}
          onPointerDown={(event) => startPageDrag(event, 1)}
        />
      )}
      {state.opened && !state.backClosed && leftCount > 0 && (
        <PageSurface
          page={leftCount ? leftCount * 2 - 1 : "lining"}
          side={-1}
          z={stackTop(leftCount) + 0.008}
          onPointerDown={(event) => startPageDrag(event, -1)}
        />
      )}
      {turning && (
        <TurningPage
          key={`${leaf}-${turnStyle}`}
          leaf={leaf}
          progress={progress}
          paperStyle={turnStyle}
          dragControl={motion?.drag}
          reducedMotion={reducedMotion}
        />
      )}
      {turning && turnStyle !== "original" && (
        <PageShade progress={progress} leftCount={leftCount} rightCount={rightCount} />
      )}
      <group ref={cover} position={[0, 0, coverHeight("above")]}>
        <mesh
          position={[BOOK.width / 2, 0, 0]}
          castShadow
          onPointerDown={(event) => startPageDrag(event, state.opened ? -1 : 1)}
        >
          <CoverBoard detailed={paperStyle === "bound"} />
          <meshStandardMaterial color={surface.edge} roughness={surface.roughness} />
        </mesh>
        <mesh
          position={[BOOK.width / 2, 0, BOOK.cover / 2 + 0.001]}
          onPointerDown={(event) => startPageDrag(event, 1)}
        >
          <RoundedCoverFace />
          <meshPhysicalMaterial
            map={coverTextures.front}
            bumpMap={content?.plainCover ? null : coverTextures.bump}
            normalMap={clothMaps?.normal ?? null}
            normalScale={[0.28, 0.28]}
            roughnessMap={clothMaps?.roughness ?? null}
            bumpScale={content?.plainCover ? 0 : surface.bump}
            roughness={surface.roughness}
            clearcoat={surface.clearcoat}
            clearcoatRoughness={0.7}
            sheen={surface.sheen}
            sheenColor={surface.color}
          />
        </mesh>
        <mesh position={[BOOK.width / 2, 0, -(BOOK.cover / 2 + 0.001)]} rotation={[0, Math.PI, 0]}>
          <RoundedCoverFace lining flipped />
          <meshStandardMaterial map={liningMap} roughness={0.95} />
        </mesh>
      </group>

    </group>
  );
}

function WoodenDesk() {
  const { BOOK, coverHeight } = useBookScene();

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
  return (
    <group>
      <mesh position={[0, 0, coverHeight("below") - BOOK.cover / 2 - 0.15 - 0.006]} receiveShadow>
        <boxGeometry args={[38, 28, 0.3]} />
        <meshStandardMaterial map={texture} roughness={0.88} />
      </mesh>
    </group>
  );
}

function CameraFit({
  zoom,
  pan,
  presentationOpening,
}: {
  zoom: number;
  pan: { x: number; y: number };
  presentationOpening: { current: number };
}) {
  const { BOOK } = useBookScene();
  const { camera, size } = useThree();
  useFrame(() => {
    // Fit the entire open book, including its curved sheet, on portrait screens.
    const aspect = size.width / Math.max(1, size.height);
    const distance = Math.max(
      (BOOK.height / 2 + 0.9) / Math.tan((19 * Math.PI) / 180),
      4.5 / (Math.tan((19 * Math.PI) / 180) * aspect),
    );
    const x = pan.x * 4.5 * (1 - 1 / zoom);
    const y = pan.y * 3.5 * (1 - 1 / zoom);
    const view = presentationCamera(presentationOpening.current, distance, x, y);
    camera.zoom = zoom;
    camera.position.set(view.position.x, view.position.y, view.position.z);
    camera.lookAt(view.target.x, view.target.y, view.target.z);
    camera.updateProjectionMatrix();
  });
  return null;
}

type ViewProps = {
  experiment?: boolean;
  initialPaperStyle?: PaperStyle;
  toolbar?: HTMLDivElement | null;
  appVersion?: string;
  content?: Book3DContent;
  onPageTurnStart?: (direction: -1 | 1) => void;
  onPosition?: (position: BookPosition) => void;
  onError?: (error?: unknown) => void;
};
const Book3DBody = forwardRef<Book3DHandle, ViewProps>(function Book3DBody(
  {
    appVersion = "dev",
    onPageTurnStart,
    onPosition,
    onError,
    toolbar,
    experiment = false,
    initialPaperStyle,
  },
  ref,
) {
  const { BOOK, content, nextBookTurn } = useBookScene();
  const [state, setState] = useState<BookState>(() =>
    content
      ? {
          ...initialState,
          opened: content.startOpen,
          turned: content.startOpen ? content.initialLeaf : 0,
        }
      : initialState,
  );
  const presentationOpening = useRef(state.opened ? 1 : 0);
  const [paperStyle, setPaperStyle] = useState<PaperStyle>(
    initialPaperStyle ?? (experiment ? "bound" : "original"),
  );
  const [ready, setReady] = useState(!content);
  const [preparedLeaf, setPreparedLeaf] = useState<number | null>(content ? null : 0);
  const [resetting, setResetting] = useState(false);
  const preparing = resetting || (!!content && preparedLeaf !== state.turned);
  useEffect(() => {
    if (!content) return;
    let cancelled = false;
    content.prepare(state.turned).then(
      () => {
        if (!cancelled) {
          setReady(true);
          setPreparedLeaf(state.turned);
        }
      },
      (error) => {
        if (!cancelled) onError?.(error);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [content, state.turned, onError]);
  useEffect(() => {
    if (!state.motion) onPosition?.(state);
  }, [state, onPosition]);
  const lastStartedMotion = useRef<Motion | null>(null);
  useEffect(() => {
    if (state.motion !== lastStartedMotion.current && state.motion?.kind === "page") {
      onPageTurnStart?.(state.motion.to > state.motion.from ? 1 : -1);
    }
    lastStartedMotion.current = state.motion;
  }, [state.motion, onPageTurnStart]);
  const [material, setMaterial] = useState<CoverMaterial>(
    content?.material ?? (experiment ? "fabric" : "leather"),
  );
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
  const busy = state.motion !== null || preparing;
  const navigate = (direction: -1 | 1) =>
    setState((current) => {
      if (current.motion || preparing) return current;
      const motion = nextBookTurn(current, direction);
      return motion ? { ...current, motion } : current;
    });
  useImperativeHandle(ref, () => ({ next: () => navigate(1), prev: () => navigate(-1) }));
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
    if (content) return;
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
  const controls = (
    <>
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
            if (!content) {
              setState(initialState);
              resetView();
              return;
            }
            setResetting(true);
            content.prepare(0).then(
              () => {
                setPreparedLeaf(0);
                setState(initialState);
                resetView();
                setResetting(false);
              },
              () => {
                setResetting(false);
                onError?.();
              },
            );
          }}
        >
          重新开始
        </button>
      </footer>
    </>
  );
  return (
    <div className={`book3d-test ${content ? "book3d-embedded" : ""}`}>
      <div className="book3d-layout">
        {!content && (
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
        )}
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
          <span className="book3d-stage-label">{content?.title ?? "拾光集 · 第一册"}</span>
          {ready && (
            <Canvas
              shadows="percentage"
              dpr={[1, 2]}
              camera={{ position: [0, 0, 12], fov: 38, near: 0.1, far: 100 }}
              gl={{ antialias: true }}
              fallback={<p>当前浏览器无法显示 3D 书本。</p>}
            >
              <CameraFit zoom={zoom} pan={pan} presentationOpening={presentationOpening} />
              <ContextRecovery onError={onError} />
              <color attach="background" args={["#e9e4db"]} />
              <ambientLight intensity={0.72} />
              <hemisphereLight args={["#fff9eb", "#8e8272", 0.76]} />
              <directionalLight
                position={[-3, 6, 8]}
                intensity={2.05}
                castShadow
                shadow-mapSize={[2048, 2048]}
                shadow-camera-left={-8}
                shadow-camera-right={8}
                shadow-camera-top={8}
                shadow-camera-bottom={-8}
                shadow-normalBias={0.003}
                shadow-bias={-0.0001}
                shadow-radius={5}
              />
              <BookModel
                paperStyle={paperStyle}
                disabled={preparing}
                state={state}
                material={material}
                complete={complete}
                reducedMotion={reducedMotion}
                presentationOpening={presentationOpening}
                beginDrag={(motion) =>
                  setState((current) =>
                    current.motion || preparing ? current : { ...current, motion },
                  )
                }
              />
              <WoodenDesk />
            </Canvas>
          )}
          {!ready && preparing && (
            <div className="book3d-loading" role="status">
              正在铺开手帐…
            </div>
          )}
        </section>
        {!content && (
          <div className="book3d-material-controls" role="group" aria-label="封面材质">
            <span>封面材质</span>
            {(Object.keys(COVER_MATERIALS) as CoverMaterial[]).map((kind) => (
              <button
                key={kind}
                disabled={busy}
                aria-pressed={material === kind}
                onClick={() => setMaterial(kind)}
              >
                <i style={{ background: COVER_MATERIALS[kind].color }} aria-hidden="true" />
                {COVER_MATERIALS[kind].label}
              </button>
            ))}
          </div>
        )}
        {experiment && (
          <div className="book3d-material-controls" role="group" aria-label="翻页效果对比">
            <span>效果对比</span>
            <button
              disabled={busy}
              aria-pressed={paperStyle === "bound"}
              onClick={() => setPaperStyle("bound")}
            >
              精装布艺
            </button>
            <button
              disabled={busy}
              aria-pressed={paperStyle === "soft"}
              onClick={() => setPaperStyle("soft")}
            >
              柔纸曲面
            </button>
            <button
              disabled={busy}
              aria-pressed={paperStyle === "original"}
              onClick={() => setPaperStyle("original")}
            >
              原版
            </button>
            <small>
              {paperStyle === "bound"
                ? "包边与细圆角 · 织物反光 · 上下拖动看页角扭转"
                : paperStyle === "soft"
                  ? "连续弯曲 · 柔和高光 · 渐变落影"
                  : "原版书本与翻页"}
            </small>
          </div>
        )}
        {toolbar ? createPortal(controls, toolbar) : controls}
        {!content && <p className="book3d-note">翻页效果实验 · 示例内容</p>}
      </div>
    </div>
  );
});
function ContextRecovery({ onError }: { onError?: (error?: unknown) => void }) {
  const { gl } = useThree();
  useEffect(() => {
    const lost = () => onError?.();
    gl.domElement.addEventListener("webglcontextlost", lost);
    return () => gl.domElement.removeEventListener("webglcontextlost", lost);
  }, [gl, onError]);
  return null;
}
export default forwardRef<Book3DHandle, ViewProps>(function Book3DView(props, ref) {
  return (
    <BookSceneContext.Provider value={props.content}>
      <Book3DBody {...props} ref={ref} />
    </BookSceneContext.Provider>
  );
});
