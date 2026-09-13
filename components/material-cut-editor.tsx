"use client";
/* oxlint-disable next/no-img-element -- The editor renders local source pixels directly to canvas. */
import "./material-cut-editor.css";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import {
  Check,
  Loader2,
  Move,
  PenTool,
  Redo2,
  RotateCcw,
  RotateCw,
  Scissors,
  Trash2,
  Undo2,
} from "lucide-react";
import {
  materialCutExportGeometry,
  materialCutMaskBounds,
  materialCutPathLength,
  materialCutTornWidthFactor,
  materialCutVisibleMask,
  sampleMaterialCutPath,
  splitMaterialCutMask,
  styleMaterialCutPath,
  type MaterialCutEdge,
  type MaterialCutPoint,
} from "@/lib/material-cut";
import type { PageMaterialCutPlacement } from "@/lib/page-material-cut";

type CutMode = "line" | "free" | "move";
type Tear = { path: MaterialCutPoint[]; seed: number };
type CutPiece = {
  id: string;
  mask: Uint8Array;
  baseMask: Uint8Array;
  x: number;
  y: number;
  angle: number;
  tips: MaterialCutPoint[];
  tears: Tear[];
};
type Snapshot = { pieces: CutPiece[]; selected: string | null };
type SourceState = {
  image: HTMLImageElement;
  canvas: HTMLCanvasElement;
  alpha: Uint8Array;
  baseMask: Uint8Array;
  width: number;
  height: number;
};
type CutGesture = {
  type: "cut";
  pointerId: number;
  tool: "line" | "free";
  points: MaterialCutPoint[];
};
type MoveGesture = {
  type: "move";
  pointerId: number;
  id: string;
  start: MaterialCutPoint;
  x: number;
  y: number;
  before: Snapshot;
  moved: boolean;
};
type Gesture = CutGesture | MoveGesture;

export type MaterialCutOutput = {
  data: string;
  width: number;
  height: number;
  name: string;
  placement: PageMaterialCutPlacement;
};
export type MaterialCutGuard = { dirty: boolean; busy: boolean };
export type MaterialCutSaveProgress = { saveId: string; index: number; total: number };

const STAGE_WIDTH = 820,
  STAGE_HEIGHT = 540,
  MAX_PIECES = 48;
const edgeNames: Record<MaterialCutEdge, string> = {
  straight: "平直",
  torn: "手撕",
  wave: "波浪",
  zigzag: "锯齿",
};
const strengthValues = { small: 2, medium: 5, large: 9 } as const;
const paperCoreValues = { small: 5, medium: 11, large: 20 } as const;
const paperCoreOptions = [
  { value: 0, label: "无白边" },
  { value: paperCoreValues.small, label: "少" },
  { value: paperCoreValues.medium, label: "中" },
  { value: paperCoreValues.large, label: "多" },
] as const;
const renderedPieceCache = new WeakMap<CutPiece, Map<number, HTMLCanvasElement>>();

function makeCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}
function clonePieces(pieces: CutPiece[]) {
  return pieces.map((piece) => ({
    ...piece,
    tips: piece.tips.map((point) => ({ ...point })),
    tears: piece.tears.map((tear) => ({ ...tear, path: tear.path.map((point) => ({ ...point })) })),
  }));
}
function localPoint(piece: CutPiece, point: MaterialCutPoint, source: SourceState) {
  const angle = (-piece.angle * Math.PI) / 180,
    c = Math.cos(angle),
    s = Math.sin(angle),
    x = point.x - piece.x,
    y = point.y - piece.y;
  return { x: x * c - y * s + source.width / 2, y: x * s + y * c + source.height / 2 };
}
function worldPoint(piece: CutPiece, point: MaterialCutPoint, source: SourceState) {
  const angle = (piece.angle * Math.PI) / 180,
    c = Math.cos(angle),
    s = Math.sin(angle),
    x = point.x - source.width / 2,
    y = point.y - source.height / 2;
  return { x: piece.x + x * c - y * s, y: piece.y + x * s + y * c };
}
function maskHas(piece: CutPiece, point: MaterialCutPoint, source: SourceState) {
  const x = Math.floor(point.x),
    y = Math.floor(point.y);
  return (
    x >= 0 && x < source.width && y >= 0 && y < source.height && !!piece.mask[y * source.width + x]
  );
}
function visibleBounds(piece: CutPiece, source: SourceState) {
  return materialCutMaskBounds(piece.mask, source.width, source.height, source.alpha);
}
function outputPlacement(
  piece: CutPiece,
  source: SourceState,
  bounds = visibleBounds(piece, source),
): PageMaterialCutPlacement | null {
  if (!bounds) return null;
  const radians = (piece.angle * Math.PI) / 180,
    c = Math.abs(Math.cos(radians)),
    s = Math.abs(Math.sin(radians)),
    width = bounds.x1 - bounds.x0 + 1,
    height = bounds.y1 - bounds.y0 + 1,
    center = worldPoint(
      piece,
      { x: (bounds.x0 + bounds.x1 + 1) / 2, y: (bounds.y0 + bounds.y1 + 1) / 2 },
      source,
    );
  return {
    centerX: (center.x - STAGE_WIDTH / 2) / source.width,
    centerY: (center.y - STAGE_HEIGHT / 2) / source.height,
    width: (width * c + height * s) / source.width,
    height: (width * s + height * c) / source.height,
  };
}
function pathOn(context: CanvasRenderingContext2D, path: MaterialCutPoint[]) {
  context.beginPath();
  path.forEach((point, index) =>
    index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y),
  );
}

function tearRibbon(tear: Tear, width: number) {
  const points = sampleMaterialCutPath(tear.path, 1.2),
    lengths = [0];
  for (let i = 1; i < points.length; i++)
    lengths.push(
      lengths[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y),
    );
  const total = lengths[lengths.length - 1] || 1,
    closed =
      points.length > 2 &&
      Math.hypot(
        points[0].x - points[points.length - 1].x,
        points[0].y - points[points.length - 1].y,
      ) < 2;
  return points.map((point, index) => {
    const loopLength = Math.max(1, points.length - 1),
      loopPoint = (next: number) => points[((next % loopLength) + loopLength) % loopLength],
      before = closed ? loopPoint(index - 7) : points[Math.max(0, index - 7)],
      after = closed ? loopPoint(index + 7) : points[Math.min(points.length - 1, index + 7)],
      dx = after.x - before.x,
      dy = after.y - before.y,
      length = Math.hypot(dx, dy) || 1;
    const distance = lengths[index],
      taper = closed ? 1 : Math.min(1, distance / 18, (total - distance) / 18),
      nx = -dy / length,
      ny = dx / length;
    const left =
        width * materialCutTornWidthFactor(distance, total, tear.seed, 1, closed) * taper,
      right =
        width *
        0.78 *
        materialCutTornWidthFactor(distance, total, tear.seed, -1, closed) *
        taper;
    return {
      point,
      nx,
      ny,
      left,
      right,
      a: { x: point.x + nx * left, y: point.y + ny * left },
      b: { x: point.x - nx * right, y: point.y - ny * right },
    };
  });
}

function paintTornCore(context: CanvasRenderingContext2D, tear: Tear, width: number) {
  if (width <= 0) return;
  const ribbon = tearRibbon(tear, width);
  if (ribbon.length < 2) return;
  const polygon = [...ribbon.map((item) => item.a), ...ribbon.map((item) => item.b).reverse()];
  context.save();
  context.globalCompositeOperation = "source-over";
  context.lineJoin = "round";
  context.lineCap = "round";
  pathOn(context, polygon);
  context.closePath();
  context.strokeStyle = "#e4dace";
  context.lineWidth = 1.5;
  context.globalAlpha = 0.62;
  context.stroke();
  context.globalAlpha = 1;
  context.fillStyle = "#fffaf0";
  context.fill();
  const core = tearRibbon(tear, width * 0.58);
  pathOn(context, [...core.map((item) => item.a), ...core.map((item) => item.b).reverse()]);
  context.closePath();
  context.fillStyle = "#fff";
  context.globalAlpha = 0.72;
  context.fill();
  for (let i = 2; i < ribbon.length - 2; ) {
    const item = ribbon[i],
      value = (Math.sin(i * 127.1 + tear.seed * 19.7) * 43758.5453) % 1,
      amount = Math.abs(value);
    for (const side of [-1, 1]) {
      const reach = side > 0 ? item.left : item.right,
        sideAmount = Math.abs(
          (Math.sin(i * 41.7 + tear.seed * 11.3 + side * 3.1) * 27183.919) % 1,
        ),
        inside = reach * (0.2 + 0.52 * amount),
        outside = reach * (1.01 + 0.32 * sideAmount),
        bend = (sideAmount - 0.5) * 6;
      context.beginPath();
      context.moveTo(
        item.point.x + side * item.nx * inside,
        item.point.y + side * item.ny * inside,
      );
      context.lineTo(
        item.point.x + side * item.nx * outside - item.ny * bend,
        item.point.y + side * item.ny * outside + item.nx * bend,
      );
      context.lineWidth = 0.35 + sideAmount * 0.85;
      context.strokeStyle = (i + side) % 11 ? "#fff" : "#d9cfc2";
      context.globalAlpha = (i + side) % 11 ? 0.42 + amount * 0.18 : 0.25;
      context.stroke();
    }
    i += 2 + Math.floor(amount * 5);
  }
  context.restore();
}

function maskCanvas(piece: CutPiece, source: SourceState) {
  const canvas = makeCanvas(source.width, source.height),
    context = canvas.getContext("2d")!,
    image = context.createImageData(source.width, source.height);
  for (let i = 0; i < piece.mask.length; i++)
    image.data[i * 4 + 3] = piece.mask[i] && source.alpha[i] ? 255 : 0;
  context.putImageData(image, 0, 0);
  return canvas;
}

function renderPiece(piece: CutPiece, source: SourceState, paperCore: number) {
  const cached = renderedPieceCache.get(piece)?.get(paperCore);
  if (cached) return cached;
  const canvas = makeCanvas(source.width, source.height),
    context = canvas.getContext("2d")!;
  context.drawImage(source.canvas, 0, 0);
  for (const tear of piece.tears) paintTornCore(context, tear, paperCore);
  context.globalCompositeOperation = "destination-in";
  context.drawImage(maskCanvas(piece, source), 0, 0);
  const byCore = renderedPieceCache.get(piece) || new Map<number, HTMLCanvasElement>();
  byCore.set(paperCore, canvas);
  renderedPieceCache.set(piece, byCore);
  return canvas;
}

async function exportAtSize(
  piece: CutPiece,
  source: SourceState,
  paperCore: number,
  name: string,
  index: number,
  maxSide: number,
): Promise<MaterialCutOutput | null> {
  const bounds = visibleBounds(piece, source);
  if (!bounds) return null;
  const geometry = materialCutExportGeometry(
      bounds,
      source.width,
      source.height,
      source.image.naturalWidth,
      source.image.naturalHeight,
      maxSide,
    ),
    cropped = makeCanvas(geometry.width, geometry.height),
    context = cropped.getContext("2d")!;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    source.image,
    geometry.sourceX,
    geometry.sourceY,
    geometry.sourceWidth,
    geometry.sourceHeight,
    0,
    0,
    geometry.width,
    geometry.height,
  );
  context.save();
  context.scale(
    geometry.width / geometry.workCropWidth,
    geometry.height / geometry.workCropHeight,
  );
  context.translate(-bounds.x0, -bounds.y0);
  for (const tear of piece.tears) paintTornCore(context, tear, paperCore);
  context.restore();
  const mask = maskCanvas(piece, source);
  context.globalCompositeOperation = "destination-in";
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    mask,
    bounds.x0,
    bounds.y0,
    geometry.workCropWidth,
    geometry.workCropHeight,
    0,
    0,
    geometry.width,
    geometry.height,
  );
  const placement = outputPlacement(piece, source, bounds)!;
  const radians = (piece.angle * Math.PI) / 180,
    c = Math.abs(Math.cos(radians)),
    s = Math.abs(Math.sin(radians));
  let output = cropped;
  if (Math.abs(piece.angle) > 0.01) {
    const width = Math.ceil(cropped.width * c + cropped.height * s),
      height = Math.ceil(cropped.width * s + cropped.height * c);
    output = makeCanvas(width, height);
    const rotated = output.getContext("2d")!;
    rotated.imageSmoothingEnabled = true;
    rotated.imageSmoothingQuality = "high";
    rotated.translate(width / 2, height / 2);
    rotated.rotate(radians);
    rotated.drawImage(cropped, -cropped.width / 2, -cropped.height / 2);
  }
  const data = output.toDataURL("image/png");
  return {
    data,
    width: output.width,
    height: output.height,
    name: `${name.trim() || "素材"} 裁片 ${String(index + 1).padStart(2, "0")}`,
    placement,
  };
}

async function exportPiece(
  piece: CutPiece,
  source: SourceState,
  paperCore: number,
  name: string,
  index: number,
) {
  for (const maxSide of [3072, 2400, 1800, 1400]) {
    const output = await exportAtSize(piece, source, paperCore, name, index, maxSide);
    if (!output) return null;
    const comma = output.data.indexOf(","),
      bytes = Math.ceil((output.data.length - comma - 1) * 0.75);
    if (bytes < 9.5 * 1024 * 1024) return output;
  }
  throw Error("有一块裁片内容过大，请再切小一些后重试。");
}

export default function MaterialCutEditor({
  src,
  name,
  saving,
  onCancel,
  cancelLabel = "取消裁切",
  actionLabel = "应用到手帐",
  onBeforeSave,
  onSavePiece,
  onGuardChange,
}: {
  src: string;
  name: string;
  saving: boolean;
  onCancel: () => void;
  cancelLabel?: string;
  actionLabel?: string;
  onBeforeSave?: (placements: PageMaterialCutPlacement[]) => void | Promise<void>;
  onSavePiece: (output: MaterialCutOutput, progress: MaterialCutSaveProgress) => Promise<void>;
  onGuardChange: (guard: MaterialCutGuard) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null),
    sourceRef = useRef<SourceState | null>(null),
    piecesRef = useRef<CutPiece[]>([]),
    gestureRef = useRef<Gesture | null>(null),
    historyRef = useRef<Snapshot[]>([]),
    futureRef = useRef<Snapshot[]>([]),
    serialRef = useRef(1),
    paintFrameRef = useRef<number | null>(null),
    saveSessionRef = useRef(""),
    saveStartedRef = useRef(false),
    savedOutputCountRef = useRef(0);
  const [loaded, setLoaded] = useState(false),
    [mode, setMode] = useState<CutMode>("line"),
    [edge, setEdge] = useState<MaterialCutEdge>("torn"),
    [strength, setStrength] = useState<number>(strengthValues.medium),
    [paperCore, setPaperCore] = useState<number>(paperCoreValues.large),
    [selected, setSelected] = useState<string | null>("piece-1"),
    [status, setStatus] = useState("正在打开素材…"),
    [revision, setRevision] = useState(0),
    [exporting, setExporting] = useState(false),
    [savedOutputCount, setSavedOutputCount] = useState(0),
    [saveStarted, setSaveStarted] = useState(false);
  const refresh = () => {
    if (paintFrameRef.current !== null) return;
    paintFrameRef.current = requestAnimationFrame(() => {
      paintFrameRef.current = null;
      setRevision((value) => value + 1);
    });
  };
  const snapshot = (selectedId = selected): Snapshot => ({
    pieces: clonePieces(piecesRef.current),
    selected: selectedId,
  });
  const restore = (next: Snapshot) => {
    piecesRef.current = clonePieces(next.pieces);
    gestureRef.current = null;
    setSelected(next.selected);
    refresh();
  };
  const checkpoint = () => {
    historyRef.current.push(snapshot());
    if (historyRef.current.length > 30) historyRef.current.shift();
    futureRef.current = [];
    onGuardChange({ dirty: true, busy: saving || exporting });
  };

  useEffect(
    () =>
      onGuardChange({
        dirty: historyRef.current.length > 0 || saveStarted,
        busy: saving || exporting,
      }),
    [exporting, onGuardChange, revision, saveStarted, saving],
  );

  useEffect(
    () => () => {
      if (paintFrameRef.current !== null) cancelAnimationFrame(paintFrameRef.current);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setStatus("正在打开素材…");
    historyRef.current = [];
    futureRef.current = [];
    serialRef.current = 1;
    saveSessionRef.current = "";
    saveStartedRef.current = false;
    savedOutputCountRef.current = 0;
    setSaveStarted(false);
    setSavedOutputCount(0);
    const image = new Image();
    image.decoding = "async";
    image.src = src;
    image
      .decode()
      .then(() => {
        if (cancelled) return;
        const scale = Math.min(620 / image.naturalWidth, 420 / image.naturalHeight),
          width = Math.max(8, Math.round(image.naturalWidth * scale)),
          height = Math.max(8, Math.round(image.naturalHeight * scale));
        const canvas = makeCanvas(width, height),
          context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw Error("当前浏览器无法打开裁切画布。");
        context.drawImage(image, 0, 0, width, height);
        const pixels = context.getImageData(0, 0, width, height).data,
          alpha = new Uint8Array(width * height);
        for (let i = 0; i < alpha.length; i++) alpha[i] = pixels[i * 4 + 3];
        const mask = materialCutVisibleMask(alpha, width, height);
        if (!mask) throw Error("这张图片没有可见内容，请返回后换一张图片。");
        const source = { image, canvas, alpha, baseMask: mask, width, height };
        sourceRef.current = source;
        piecesRef.current = [
          {
            id: "piece-1",
            mask,
            baseMask: mask,
            x: STAGE_WIDTH / 2,
            y: STAGE_HEIGHT / 2,
            angle: 0,
            tips: [],
            tears: [],
          },
        ];
        setSelected("piece-1");
        setLoaded(true);
        setStatus("从素材一侧划到另一侧，松手切开。");
        refresh();
      })
      .catch((cause) => {
        if (!cancelled)
          setStatus(cause instanceof Error ? cause.message : "素材图片无法读取，请返回后重新打开。");
      });
    return () => {
      cancelled = true;
      gestureRef.current = null;
    };
  }, [src]);

  function selectedPiece() {
    return piecesRef.current.find((piece) => piece.id === selected) || null;
  }
  function hit(point: MaterialCutPoint) {
    const source = sourceRef.current;
    if (!source) return null;
    for (let i = piecesRef.current.length - 1; i >= 0; i--) {
      const piece = piecesRef.current[i];
      if (maskHas(piece, localPoint(piece, point, source), source)) return piece;
    }
    return null;
  }
  function place(piece: CutPiece, x: number, y: number) {
    const source = sourceRef.current;
    if (!source) return;
    const bounds = visibleBounds(piece, source);
    if (!bounds) {
      piece.x = x;
      piece.y = y;
      return;
    }
    const candidate = { ...piece, x, y },
      corners = [
        [bounds.x0, bounds.y0],
        [bounds.x1, bounds.y0],
        [bounds.x1, bounds.y1],
        [bounds.x0, bounds.y1],
      ].map(([px, py]) => worldPoint(candidate, { x: px, y: py }, source));
    const xs = corners.map((point) => point.x),
      ys = corners.map((point) => point.y),
      left = Math.min(...xs),
      right = Math.max(...xs),
      top = Math.min(...ys),
      bottom = Math.max(...ys);
    piece.x =
      x +
      (right - left > STAGE_WIDTH - 20
        ? (STAGE_WIDTH - left - right) / 2
        : left < 10
          ? 10 - left
          : right > STAGE_WIDTH - 10
            ? STAGE_WIDTH - 10 - right
            : 0);
    piece.y =
      y +
      (bottom - top > STAGE_HEIGHT - 20
        ? (STAGE_HEIGHT - top - bottom) / 2
        : top < 10
          ? 10 - top
          : bottom > STAGE_HEIGHT - 10
            ? STAGE_HEIGHT - 10 - bottom
            : 0);
  }
  function setTool(next: CutMode, announce = true) {
    gestureRef.current = null;
    setMode(next);
    if (announce)
      setStatus(
        next === "move"
          ? "拖动任意裁片。选中后可旋转或移除；继续剪请再点剪刀。"
          : next === "free"
            ? "按住画出任意曲线；闭合一圈可以取出中间裁片。"
            : "从素材一侧划到另一侧，松手切开。",
      );
  }
  function snapTips(piece: CutPiece, path: MaterialCutPoint[]) {
    const result = path.map((point) => ({ ...point }));
    for (const index of [0, result.length - 1]) {
      let nearest: MaterialCutPoint | null = null,
        distance = 13;
      for (const tip of piece.tips) {
        const next = Math.hypot(tip.x - result[index].x, tip.y - result[index].y);
        if (next < distance) {
          distance = next;
          nearest = tip;
        }
      }
      if (nearest) result[index] = { ...nearest };
    }
    return result;
  }
  function finishCut(raw: MaterialCutPoint[]) {
    const source = sourceRef.current;
    if (!source || raw.length < 2 || materialCutPathLength(raw) < 7) {
      setStatus("拖动划出一条切线，松手完成。");
      refresh();
      return;
    }
    const samples = sampleMaterialCutPath(raw, 3),
      target = [...piecesRef.current]
        .reverse()
        .find((piece) =>
          samples.some((point) => maskHas(piece, localPoint(piece, point, source), source)),
        );
    if (!target) {
      setStatus("这一刀没有碰到素材，可以从素材外侧开始划线。");
      refresh();
      return;
    }
    const path = styleMaterialCutPath(
        snapTips(
          target,
          raw.map((point) => localPoint(target, point, source)),
        ),
        edge,
        strength,
      ),
      result = splitMaterialCutMask(target.mask, source.width, source.height, path, {
        maxPieces: MAX_PIECES,
        baseMask: target.baseMask,
      });
    if (!result.changed) {
      setStatus("这一刀经过的是透明处或已有切缝，没有新的裁切。");
      refresh();
      return;
    }
    const candidates = result.masks
      .map((mask, index) => ({ mask, size: result.sizes[index] }))
      .filter((item) =>
        materialCutMaskBounds(item.mask, source.width, source.height, source.alpha),
      );
    if (
      result.tooMany ||
      !candidates.length ||
      piecesRef.current.length - 1 + candidates.length > MAX_PIECES
    ) {
      setStatus("这刀产生的裁片太细，素材已保留；请减小切口起伏后再试。");
      refresh();
      return;
    }
    checkpoint();
    const separated = candidates.length > 1,
      tips = separated
        ? []
        : [
            ...target.tips,
            ...[path[0], path[path.length - 1]].filter((point) => maskHas(target, point, source)),
          ].slice(-12);
    const tears =
      edge === "torn"
        ? [
            ...target.tears,
            {
              path: path.map((point) => ({ ...point })),
              seed: serialRef.current * 2.37 + target.tears.length,
            },
          ]
        : target.tears;
    const replacements = candidates.map(
      (item, index): CutPiece => ({
        ...target,
        id: index ? `piece-${++serialRef.current}` : target.id,
        mask: item.mask,
        baseMask: separated ? item.mask : target.baseMask,
        tips: tips.map((point) => ({ ...point })),
        tears: tears.map((tear) => ({ ...tear, path: tear.path.map((point) => ({ ...point })) })),
      }),
    );
    const at = piecesRef.current.indexOf(target);
    piecesRef.current.splice(at, 1, ...replacements);
    const largest = candidates.reduce(
      (best, item, index) => (item.size > candidates[best].size ? index : best),
      0,
    );
    setSelected(replacements[largest].id);
    if (separated) {
      setTool("move", false);
      setStatus(`已切成 ${candidates.length} 块，全部留在原位。现在可以直接拖开。`);
    } else setStatus("切缝已保留，还连着；可从蓝色端点继续补一刀。");
    refresh();
  }
  function pointer(event: ReactPointerEvent<HTMLCanvasElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - box.left) / box.width) * STAGE_WIDTH,
      y: ((event.clientY - box.top) / box.height) * STAGE_HEIGHT,
    };
  }
  function pointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (
      !loaded ||
      saving ||
      exporting ||
      saveStartedRef.current ||
      event.button !== 0 ||
      gestureRef.current
    )
      return;
    event.preventDefault();
    event.currentTarget.focus();
    const point = pointer(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    if (mode === "move") {
      const piece = hit(point);
      if (!piece) {
        setSelected(null);
        refresh();
        return;
      }
      setSelected(piece.id);
      gestureRef.current = {
        type: "move",
        pointerId: event.pointerId,
        id: piece.id,
        start: point,
        x: piece.x,
        y: piece.y,
        before: snapshot(piece.id),
        moved: false,
      };
    } else
      gestureRef.current = { type: "cut", pointerId: event.pointerId, tool: mode, points: [point] };
    refresh();
  }
  function pointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    const point = pointer(event);
    if (gesture.type === "move") {
      const piece = piecesRef.current.find((item) => item.id === gesture.id);
      if (!piece) return;
      const dx = point.x - gesture.start.x,
        dy = point.y - gesture.start.y;
      if (!gesture.moved && Math.hypot(dx, dy) < 2) return;
      gesture.moved = true;
      place(piece, gesture.x + dx, gesture.y + dy);
    } else if (gesture.tool === "line") gesture.points = [gesture.points[0], point];
    else if (
      Math.hypot(
        point.x - gesture.points[gesture.points.length - 1].x,
        point.y - gesture.points[gesture.points.length - 1].y,
      ) > 1.5
    )
      gesture.points.push(point);
    refresh();
  }
  function pointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    gestureRef.current = null;
    if (gesture.type === "move") {
      if (gesture.moved) {
        historyRef.current.push(gesture.before);
        if (historyRef.current.length > 30) historyRef.current.shift();
        futureRef.current = [];
        onGuardChange({ dirty: true, busy: saving || exporting });
        setStatus("裁片已移动；可以继续裁切，也可以撤销。");
      }
    } else {
      const end = pointer(event),
        points = gesture.tool === "line" ? [gesture.points[0], end] : [...gesture.points, end];
      if (
        gesture.tool === "free" &&
        points.length > 8 &&
        Math.hypot(points[0].x - end.x, points[0].y - end.y) < 14
      )
        points[points.length - 1] = { ...points[0] };
      finishCut(points);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    refresh();
  }
  function cancelGesture(event?: ReactPointerEvent<HTMLCanvasElement>) {
    const gesture = gestureRef.current;
    if (!gesture) return;
    gestureRef.current = null;
    if (gesture.type === "move") restore(gesture.before);
    else refresh();
    if (event?.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function undo() {
    if (!historyRef.current.length) return;
    futureRef.current.push(snapshot());
    const previous = historyRef.current.pop()!;
    restore(previous);
    setStatus("已撤销，素材已恢复。");
  }
  function redo() {
    if (!futureRef.current.length) return;
    historyRef.current.push(snapshot());
    const next = futureRef.current.pop()!;
    restore(next);
    setStatus("已重做。");
  }
  function rotate() {
    const source = sourceRef.current,
      piece = selectedPiece();
    if (!source || !piece) return;
    const bounds = visibleBounds(piece, source);
    if (!bounds) return;
    checkpoint();
    const center = { x: (bounds.x0 + bounds.x1) / 2, y: (bounds.y0 + bounds.y1) / 2 },
      before = worldPoint(piece, center, source);
    piece.angle = (piece.angle + 15) % 360;
    const after = worldPoint(piece, center, source);
    place(piece, piece.x + before.x - after.x, piece.y + before.y - after.y);
    setTool("move", false);
    setStatus("已旋转 15°，旋转后也可以继续裁切。");
    refresh();
  }
  function remove() {
    const piece = selectedPiece();
    if (!piece) return;
    checkpoint();
    piecesRef.current = piecesRef.current.filter((item) => item.id !== piece.id);
    setSelected(piecesRef.current[piecesRef.current.length - 1]?.id || null);
    setStatus("已移除选中裁片，可以撤销找回。");
    refresh();
  }
  function reset() {
    const source = sourceRef.current;
    if (!source) return;
    checkpoint();
    piecesRef.current = [
      {
        id: `piece-${++serialRef.current}`,
        mask: new Uint8Array(source.baseMask),
        baseMask: source.baseMask,
        x: STAGE_WIDTH / 2,
        y: STAGE_HEIGHT / 2,
        angle: 0,
        tips: [],
        tears: [],
      },
    ];
    setSelected(piecesRef.current[0].id);
    setTool("line", false);
    setStatus("已恢复完整素材，可以重新裁切。");
    refresh();
  }
  function keyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.target instanceof HTMLSelectElement || event.target instanceof HTMLInputElement)
      return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if (event.key === "Escape" && gestureRef.current) {
      event.preventDefault();
      event.stopPropagation();
      cancelGesture();
      return;
    }
    if (saveStartedRef.current) return;
    const direction: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      },
      move = direction[event.key],
      piece = selectedPiece();
    if (move && mode === "move" && piece) {
      event.preventDefault();
      checkpoint();
      const step = event.shiftKey ? 16 : 4;
      place(piece, piece.x + move[0] * step, piece.y + move[1] * step);
      setStatus("已移动选中裁片。");
      refresh();
    }
  }
  async function complete() {
    const source = sourceRef.current;
    if (!source || !piecesRef.current.length || exporting || saving) return;
    setExporting(true);
    onGuardChange({ dirty: true, busy: true });
    try {
      const ordered = [...piecesRef.current].sort((a, b) =>
        a.id === selected ? -1 : b.id === selected ? 1 : 0,
      ),
        placements = ordered.map((piece) => outputPlacement(piece, source));
      if (placements.some((placement) => !placement))
        throw Error('有裁片没有可见内容，请返回后调整。');
      await onBeforeSave?.(placements as PageMaterialCutPlacement[]);
      if (!saveSessionRef.current) saveSessionRef.current = crypto.randomUUID();
      for (let index = savedOutputCountRef.current; index < ordered.length; index++) {
        setStatus(`正在生成裁片 ${index + 1} / ${ordered.length}…`);
        const output = await exportPiece(ordered[index], source, paperCore, name, index);
        if (!output) throw Error(`第 ${index + 1} 块裁片没有可见内容，请返回后调整。`);
        saveStartedRef.current = true;
        setSaveStarted(true);
        setStatus(`正在保存裁片 ${index + 1} / ${ordered.length}…`);
        await onSavePiece(output, {
          saveId: `${saveSessionRef.current}-${index}`,
          index,
          total: ordered.length,
        });
        savedOutputCountRef.current = index + 1;
        setSavedOutputCount(index + 1);
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : "裁片生成失败，原素材未修改。";
      setStatus(
        saveStartedRef.current
          ? `已保存 ${savedOutputCountRef.current} / ${piecesRef.current.length} 块，裁切草稿仍保留；可继续保存。${detail}`
          : detail,
      );
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current,
      source = sourceRef.current;
    if (!canvas || !source || !loaded) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
    context.fillStyle = "#ecebe4";
    context.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
    context.strokeStyle = "rgba(113,112,103,.16)";
    context.lineWidth = 0.7;
    for (let x = 0; x < STAGE_WIDTH; x += 20) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, STAGE_HEIGHT);
      context.stroke();
    }
    for (let y = 0; y < STAGE_HEIGHT; y += 20) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(STAGE_WIDTH, y);
      context.stroke();
    }
    for (const piece of piecesRef.current) {
      const rendered = renderPiece(piece, source, paperCore);
      context.save();
      context.translate(piece.x, piece.y);
      context.rotate((piece.angle * Math.PI) / 180);
      context.shadowColor = "rgba(52,45,38,.24)";
      context.shadowBlur = 8;
      context.shadowOffsetY = 3;
      context.drawImage(rendered, -source.width / 2, -source.height / 2);
      context.shadowColor = "transparent";
      if (piece.id === selected && mode === "move") {
        const bounds = visibleBounds(piece, source);
        if (bounds) {
          context.strokeStyle = "#657957";
          context.lineWidth = 1.2;
          context.setLineDash([5, 5]);
          context.strokeRect(
            bounds.x0 - source.width / 2 - 5,
            bounds.y0 - source.height / 2 - 5,
            bounds.x1 - bounds.x0 + 11,
            bounds.y1 - bounds.y0 + 11,
          );
          context.setLineDash([]);
        }
      }
      if (mode !== "move")
        for (const tip of piece.tips) {
          context.beginPath();
          context.arc(tip.x - source.width / 2, tip.y - source.height / 2, 4, 0, Math.PI * 2);
          context.fillStyle = "#657957";
          context.fill();
        }
      context.restore();
    }
    const gesture = gestureRef.current;
    if (gesture?.type === "cut") {
      let preview = styleMaterialCutPath(gesture.points, edge, strength);
      const target = [...piecesRef.current]
        .reverse()
        .find((piece) =>
          gesture.points.some((point) => maskHas(piece, localPoint(piece, point, source), source)),
        );
      if (target)
        preview = styleMaterialCutPath(
          gesture.points.map((point) => localPoint(target, point, source)),
          edge,
          strength,
        ).map((point) => worldPoint(target, point, source));
      pathOn(context, preview);
      context.lineWidth = 2;
      context.strokeStyle = "#4f6751";
      context.setLineDash([7, 5]);
      context.stroke();
      context.setLineDash([]);
      const end = preview[preview.length - 1];
      if (end) {
        context.beginPath();
        context.arc(end.x, end.y, 4, 0, Math.PI * 2);
        context.fillStyle = "#4f6751";
        context.fill();
      }
    }
  }, [edge, loaded, mode, paperCore, revision, selected, strength]);

  const pieceCount = piecesRef.current.length,
    disabled = !loaded || saving || exporting || saveStarted,
    remainingCount = Math.max(0, pieceCount - savedOutputCount);
  return (
    <div className="material-cut-editor" data-mode={mode} tabIndex={-1} onKeyDown={keyDown}>
      <div className="material-cut-toolbar" aria-label="自由裁切工具">
        <div className="material-cut-toolgroup" role="group" aria-label="裁切方式">
          <button
            className="outline"
            aria-pressed={mode === "line"}
            disabled={disabled}
            onClick={() => setTool("line")}
          >
            <Scissors />
            直线剪
          </button>
          <button
            className="outline"
            aria-pressed={mode === "free"}
            disabled={disabled}
            onClick={() => setTool("free")}
          >
            <PenTool />
            自由剪
          </button>
          <button
            className="outline"
            aria-pressed={mode === "move"}
            disabled={disabled}
            onClick={() => setTool("move")}
          >
            <Move />
            移动裁片
          </button>
        </div>
        <div className="material-cut-toolgroup">
          <button
            className="quiet"
            disabled={disabled || !historyRef.current.length}
            onClick={undo}
          >
            <Undo2 />
            撤销
          </button>
          <button className="quiet" disabled={disabled || !futureRef.current.length} onClick={redo}>
            <Redo2 />
            重做
          </button>
          <button
            className="quiet"
            disabled={disabled || !historyRef.current.length}
            onClick={reset}
          >
            <RotateCcw />
            恢复原图
          </button>
        </div>
        <label>
          这一刀的切口
          <select
            aria-label="切口样式"
            value={edge}
            disabled={disabled}
            onChange={(event) => {
              setEdge(event.target.value as MaterialCutEdge);
              if (mode === "move") setTool("line", false);
            }}
          >
            {Object.entries(edgeNames).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          切口起伏
          <select
            aria-label="切口起伏"
            value={strength}
            disabled={disabled || edge === "straight"}
            onChange={(event) => setStrength(Number(event.target.value))}
          >
            <option value={strengthValues.small}>小</option>
            <option value={strengthValues.medium}>中</option>
            <option value={strengthValues.large}>大</option>
          </select>
        </label>
        <div className="material-cut-setting">
          <span>手撕露白</span>
          <div className="material-cut-core-options" role="group" aria-label="手撕白纸露出">
            {paperCoreOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className="quiet"
                aria-pressed={paperCore === option.value}
                disabled={disabled || edge !== "torn"}
                onClick={() => {
                  setPaperCore(option.value);
                  setStatus(
                    option.value === 0
                      ? "已关闭白边，保留手撕轮廓。"
                      : "已调整白纸露出，已有手撕边也会同步预览。",
                  );
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="material-cut-stage-wrap">
        <canvas
          ref={canvasRef}
          width={STAGE_WIDTH}
          height={STAGE_HEIGHT}
          tabIndex={0}
          aria-label="素材自由裁切区。拖动划线裁切；切开后可移动裁片。"
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onPointerCancel={cancelGesture}
          onLostPointerCapture={cancelGesture}
        />
        {!loaded && (
          <div className="material-cut-loading">
            <Loader2 className="spinning" />
            {status}
          </div>
        )}
      </div>
      <div className="material-cut-bottom">
        <span className="material-cut-count">{pieceCount} 块裁片</span>
        {saveStarted && (
          <span className="material-cut-saved">已保存 {savedOutputCount} 块 · 草稿已锁定</span>
        )}
        <label>
          选中
          <select
            aria-label="选择裁片"
            value={selected || ""}
            disabled={disabled || !pieceCount}
            onChange={(event) => {
              setSelected(event.target.value);
              setTool("move", false);
            }}
          >
            {piecesRef.current.map((piece, index) => (
              <option value={piece.id} key={piece.id}>
                第 {index + 1} 块
              </option>
            ))}
          </select>
        </label>
        <button className="quiet" disabled={disabled || !selected} onClick={rotate}>
          <RotateCw />
          旋转 15°
        </button>
        <button className="quiet danger" disabled={disabled || !selected} onClick={remove}>
          <Trash2 />
          移除选中
        </button>
        <span className="material-cut-status" role="status" aria-live="polite">
          {saving ? "正在保存裁片…" : status}
        </span>
        <button className="outline" disabled={saving || exporting} onClick={onCancel}>
          {cancelLabel}
        </button>
        <button
          className="primary"
          disabled={!loaded || saving || exporting || !remainingCount}
          onClick={() => void complete()}
        >
          {saving || exporting ? <Loader2 className="spinning" /> : <Check />}
          {saveStarted ? `继续${actionLabel} ${remainingCount} 块` : `${actionLabel} · ${pieceCount} 块`}
        </button>
      </div>
    </div>
  );
}
