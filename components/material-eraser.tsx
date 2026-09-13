"use client";
import "./material-eraser.css";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { Check, Loader2, Redo2, RotateCcw, Undo2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";

type Point = [number, number];
type VisibleBounds = { x: number; y: number; width: number; height: number };
export type MaterialEraserStroke = { size: number; points: Point[] };
export type MaterialEraserTarget = {
  id: string;
  src: string;
  name: string;
  width: number;
  height: number;
};

const MAX_WORK_SIDE = 1600;
const MAX_WORK_PIXELS = 2_400_000;
const VISIBLE_ALPHA_THRESHOLD = 2;

function drawStroke(
  context: CanvasRenderingContext2D,
  stroke: MaterialEraserStroke,
  width: number,
  height: number,
) {
  const lineWidth = Math.max(1, stroke.size * Math.min(width, height));
  context.save();
  context.globalCompositeOperation = "destination-out";
  context.fillStyle = "#000";
  context.strokeStyle = "#000";
  context.lineWidth = lineWidth;
  context.lineCap = "round";
  context.lineJoin = "round";
  if (stroke.points.length === 1) {
    const [x, y] = stroke.points[0];
    context.beginPath();
    context.arc(x * width, y * height, lineWidth / 2, 0, Math.PI * 2);
    context.fill();
  } else {
    context.beginPath();
    stroke.points.forEach(([x, y], index) =>
      index ? context.lineTo(x * width, y * height) : context.moveTo(x * width, y * height),
    );
    context.stroke();
  }
  context.restore();
}

export default function MaterialEraser({
  open,
  target,
  onClose,
  onSave,
}: {
  open: boolean;
  target: MaterialEraserTarget | null;
  onClose: () => void;
  onSave: (target: MaterialEraserTarget, strokes: MaterialEraserStroke[]) => Promise<void>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null),
    stageRef = useRef<HTMLDivElement>(null),
    imageRef = useRef<HTMLImageElement | null>(null),
    strokesRef = useRef<MaterialEraserStroke[]>([]),
    futureRef = useRef<MaterialEraserStroke[]>([]),
    activeRef = useRef<{ pointerId: number; stroke: MaterialEraserStroke } | null>(null);
  const [loaded, setLoaded] = useState(false),
    [saving, setSaving] = useState(false),
    [brush, setBrush] = useState(5),
    [zoom, setZoom] = useState(100),
    [workSize, setWorkSize] = useState({ w: 1, h: 1 }),
    [naturalSize, setNaturalSize] = useState({ w: 1, h: 1 }),
    [viewport, setViewport] = useState({ w: 760, h: 480 }),
    [cursor, setCursor] = useState<Point | null>(null),
    [visibleBounds, setVisibleBounds] = useState<VisibleBounds | null>(null),
    [status, setStatus] = useState("正在打开素材…"),
    [, refresh] = useState(0);
  const dirty = strokesRef.current.length > 0;

  function renderAll() {
    const canvas = canvasRef.current,
      image = imageRef.current;
    if (!canvas || !image) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.globalCompositeOperation = "source-over";
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    strokesRef.current.forEach((stroke) =>
      drawStroke(context, stroke, canvas.width, canvas.height),
    );
    if (activeRef.current)
      drawStroke(context, activeRef.current.stroke, canvas.width, canvas.height);
  }
  function measureVisibleBounds() {
    const canvas = canvasRef.current,
      context = canvas?.getContext("2d");
    if (!canvas || !context) return null;
    let pixels: Uint8ClampedArray;
    try {
      pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    } catch {
      const fallback = { x: 0, y: 0, width: 1, height: 1 };
      setVisibleBounds(fallback);
      return fallback;
    }
    let left = canvas.width,
      top = canvas.height,
      right = -1,
      bottom = -1;
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        if (pixels[(y * canvas.width + x) * 4 + 3] <= VISIBLE_ALPHA_THRESHOLD) continue;
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
    const next =
      right < left
        ? null
        : {
            x: left / canvas.width,
            y: top / canvas.height,
            width: (right - left + 1) / canvas.width,
            height: (bottom - top + 1) / canvas.height,
          };
    setVisibleBounds(next);
    return next;
  }
  function syncHistory(message: string) {
    renderAll();
    const bounds = measureVisibleBounds();
    refresh((value) => value + 1);
    setStatus(bounds ? message : "这次把整张素材擦空了，请撤销一部分后再保存。");
  }

  useEffect(() => {
    if (!open || !target) return;
    let cancelled = false;
    setLoaded(false);
    setSaving(false);
    setBrush(5);
    setZoom(100);
    setCursor(null);
    setVisibleBounds(null);
    setStatus("正在打开素材…");
    strokesRef.current = [];
    futureRef.current = [];
    activeRef.current = null;
    imageRef.current = null;
    refresh((value) => value + 1);
    const image = new Image();
    image.decoding = "async";
    image.src = target.src;
    image
      .decode()
      .then(() => {
        if (cancelled) return;
        const pixelScale = Math.min(
            1,
            MAX_WORK_SIDE / Math.max(image.naturalWidth, image.naturalHeight),
            Math.sqrt(MAX_WORK_PIXELS / (image.naturalWidth * image.naturalHeight)),
          ),
          width = Math.max(1, Math.round(image.naturalWidth * pixelScale)),
          height = Math.max(1, Math.round(image.naturalHeight * pixelScale)),
          canvas = canvasRef.current;
        if (!canvas) throw Error("擦除画布没有准备好，请重新打开。");
        canvas.width = width;
        canvas.height = height;
        imageRef.current = image;
        setNaturalSize({ w: image.naturalWidth, h: image.naturalHeight });
        setWorkSize({ w: width, h: height });
        setLoaded(true);
        setStatus("按住并拖动，擦掉不需要的碎片。");
        requestAnimationFrame(() => {
          renderAll();
          measureVisibleBounds();
        });
      })
      .catch((cause) => {
        if (!cancelled)
          setStatus(cause instanceof Error ? cause.message : "素材图片无法读取，请返回后重试。");
      });
    return () => {
      cancelled = true;
      activeRef.current = null;
    };
  }, [open, target?.id, target?.src]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!open || !stage) return;
    let frame = 0;
    const measure = () => {
      const next = { w: Math.max(240, stage.clientWidth), h: Math.max(220, stage.clientHeight) };
      setViewport((current) => (current.w === next.w && current.h === next.h ? current : next));
    };
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    measure();
    observer.observe(stage);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [open]);

  useEffect(() => {
    if (!open || (!dirty && !saving)) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, open, saving]);

  const fit = Math.min((viewport.w - 28) / workSize.w, (viewport.h - 28) / workSize.h, 1.5),
    displayWidth = Math.max(1, (workSize.w * fit * zoom) / 100),
    displayHeight = Math.max(1, (workSize.h * fit * zoom) / 100),
    wrapWidth = Math.max(viewport.w, displayWidth + 28),
    wrapHeight = Math.max(viewport.h, displayHeight + 28);

  function point(event: ReactPointerEvent<HTMLCanvasElement>): Point {
    const box = event.currentTarget.getBoundingClientRect();
    return [
      Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)),
      Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)),
    ];
  }
  function pointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!loaded || saving || event.button !== 0 || activeRef.current) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    const next = point(event);
    activeRef.current = {
      pointerId: event.pointerId,
      stroke: { size: brush / 100, points: [next] },
    };
    setCursor(next);
    renderAll();
  }
  function pointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const next = point(event);
    setCursor(next);
    const active = activeRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault();
    const previous = active.stroke.points.at(-1)!;
    if (Math.hypot((next[0] - previous[0]) * workSize.w, (next[1] - previous[1]) * workSize.h) < 1)
      return;
    active.stroke.points.push(next);
    const context = event.currentTarget.getContext("2d");
    if (context)
      drawStroke(
        context,
        { ...active.stroke, points: [previous, next] },
        event.currentTarget.width,
        event.currentTarget.height,
      );
  }
  function finishPointer(event: ReactPointerEvent<HTMLCanvasElement>) {
    const active = activeRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    strokesRef.current.push(active.stroke);
    futureRef.current = [];
    activeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    renderAll();
    const bounds = measureVisibleBounds();
    refresh((value) => value + 1);
    setStatus(
      bounds
        ? "已擦除；绿色边框已按剩余内容收紧。"
        : "这次把整张素材擦空了，请撤销一部分后再保存。",
    );
  }
  function cancelPointer(event: ReactPointerEvent<HTMLCanvasElement>) {
    const active = activeRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    activeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    syncHistory("这一下没有保留，素材仍是上一步的结果。");
  }
  function undo() {
    const stroke = strokesRef.current.pop();
    if (!stroke) return;
    futureRef.current.push(stroke);
    syncHistory("已撤销上一次擦除。");
  }
  function redo() {
    const stroke = futureRef.current.pop();
    if (!stroke) return;
    strokesRef.current.push(stroke);
    syncHistory("已重做上一次擦除。");
  }
  function reset() {
    if (!dirty) return;
    strokesRef.current = [];
    futureRef.current = [];
    syncHistory("已恢复到打开素材时的样子。");
  }
  function keyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return;
    event.preventDefault();
    if (event.shiftKey) redo();
    else undo();
  }
  function requestClose() {
    if (saving) return;
    if (dirty && !window.confirm("擦除草稿还没有保存，确定放弃吗？")) return;
    onClose();
  }
  async function save() {
    if (!target || !dirty || saving) return;
    setSaving(true);
    setStatus("正在保存擦除结果…");
    try {
      await onSave(
        target,
        strokesRef.current.map((stroke) => ({
          size: stroke.size,
          points: stroke.points.map(([x, y]) => [x, y]),
        })),
      );
      strokesRef.current = [];
      futureRef.current = [];
      activeRef.current = null;
      refresh((value) => value + 1);
      onClose();
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "擦除结果保存失败，原素材没有修改。");
    } finally {
      setSaving(false);
    }
  }

  const cursorDiameter = (brush / 100) * Math.min(displayWidth, displayHeight),
    canvas = canvasRef.current,
    cursorLeft = (canvas?.offsetLeft || 14) + (cursor?.[0] || 0) * displayWidth,
    cursorTop = (canvas?.offsetTop || 14) + (cursor?.[1] || 0) * displayHeight;
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) requestClose();
      }}
    >
      <DialogContent className="material-eraser-dialog" showCloseButton={!saving}>
        <DialogTitle>素材橡皮 · {target?.name || "分离结果"}</DialogTitle>
        <DialogDescription>
          只修改这个尚未入库的分离结果。绿色细框会随剩余内容缩窄，保存后就是素材的新边界；导入原图和其他结果不变。
        </DialogDescription>
        <div className="material-eraser" tabIndex={-1} onKeyDown={keyDown}>
          <div className="material-eraser-toolbar">
            <label>
              橡皮大小{" "}
              <input
                type="range"
                min={1}
                max={20}
                value={brush}
                disabled={!loaded || saving}
                onChange={(event) => setBrush(Number(event.target.value))}
              />
              <span>{brush}%</span>
            </label>
            <button className="outline" disabled={!dirty || saving} onClick={undo}>
              <Undo2 />
              撤销
            </button>
            <button
              className="outline"
              disabled={!futureRef.current.length || saving}
              onClick={redo}
            >
              <Redo2 />
              重做
            </button>
            <button className="outline" disabled={!dirty || saving} onClick={reset}>
              <RotateCcw />
              重置本次
            </button>
            <span className="material-eraser-zoom">
              <button
                className="quiet"
                aria-label="缩小擦除画布"
                disabled={!loaded || saving}
                onClick={() => setZoom((value) => Math.max(50, value - 25))}
              >
                −
              </button>
              <b>{zoom}%</b>
              <button
                className="quiet"
                aria-label="放大擦除画布"
                disabled={!loaded || saving}
                onClick={() => setZoom((value) => Math.min(400, value + 25))}
              >
                ＋
              </button>
              <button className="quiet" disabled={!loaded || saving} onClick={() => setZoom(100)}>
                适合窗口
              </button>
            </span>
          </div>
          <div className="material-eraser-stage" ref={stageRef}>
            <div
              className="material-eraser-canvas-wrap"
              style={{ width: wrapWidth, height: wrapHeight }}
            >
              <canvas
                ref={canvasRef}
                aria-label="素材擦除画布"
                style={{ width: displayWidth, height: displayHeight }}
                tabIndex={0}
                onPointerDown={pointerDown}
                onPointerMove={pointerMove}
                onPointerUp={finishPointer}
                onPointerCancel={cancelPointer}
                onPointerEnter={(event) => setCursor(point(event))}
                onPointerLeave={() => {
                  if (!activeRef.current) setCursor(null);
                }}
              />
              {loaded && cursor && (
                <span
                  className="material-eraser-cursor"
                  aria-hidden="true"
                  style={{
                    left: cursorLeft,
                    top: cursorTop,
                    width: cursorDiameter,
                    height: cursorDiameter,
                  }}
                />
              )}
              {loaded && visibleBounds && (
                <span
                  className="material-eraser-bounds"
                  aria-hidden="true"
                  style={{
                    left: (canvas?.offsetLeft || 14) + visibleBounds.x * displayWidth,
                    top: (canvas?.offsetTop || 14) + visibleBounds.y * displayHeight,
                    width: visibleBounds.width * displayWidth,
                    height: visibleBounds.height * displayHeight,
                  }}
                />
              )}
              {!loaded && (
                <span className="material-eraser-loading">
                  <Loader2 className="spinning" />
                  {status}
                </span>
              )}
            </div>
          </div>
          <div className="material-eraser-bottom">
            <span className="material-eraser-size">
              原尺寸 {naturalSize.w} × {naturalSize.h}
            </span>
            <span className="material-eraser-status" role="status">
              {status}
            </span>
            <button className="outline" disabled={saving} onClick={requestClose}>
              返回
            </button>
            <button
              className="primary"
              disabled={!loaded || !dirty || !visibleBounds || saving}
              onClick={() => void save()}
            >
              {saving ? <Loader2 className="spinning" /> : <Check />}保存擦除结果
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
