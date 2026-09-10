"use client";

/* oxlint-disable jsx-a11y/no-static-element-interactions -- the demo canvas uses pointer capture for direct manipulation. */
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { Check, Layers, Lock, MousePointer2, RotateCcw, Unlock, X } from "lucide-react";
import {
  clampSelectionMove,
  idsInSelectionRect,
  mergeSelection,
  selectionBounds,
  selectionRect,
  selectionRectSize,
  type SelectionGeometryItem,
  type SelectionPoint,
} from "@/lib/selection-geometry";

type DemoItem = SelectionGeometryItem & {
  name: string;
  rotation: number;
  z: number;
  kind: "image" | "note" | "tape" | "text";
  src?: string;
  text?: string;
  tone?: string;
};

type MarqueeGesture = {
  pointerId: number;
  start: SelectionPoint;
  current: SelectionPoint;
  baseSelection: string[];
  toggle: boolean;
  started: boolean;
};

type MoveGesture = {
  pointerId: number;
  start: SelectionPoint;
  original: DemoItem[];
  movingIds: string[];
  started: boolean;
  delta: SelectionPoint;
};

const INITIAL_ITEMS: DemoItem[] = [
  {
    id: "grid-tape",
    name: "粉色格纹胶带",
    kind: "tape",
    x: 8,
    y: 9,
    w: 28,
    h: 7,
    rotation: -5,
    z: 5,
    tone: "pink-grid",
  },
  {
    id: "ticket",
    name: "旅行票根",
    kind: "note",
    x: 12,
    y: 29,
    w: 31,
    h: 46,
    rotation: -1,
    z: 3,
    tone: "ticket",
    text: "TICKET\n\nVoyage  ·  Sunday\n\nA little trip worth keeping.",
  },
  {
    id: "runner-stamp",
    name: "蓝色邮票",
    kind: "image",
    src: "/materials/asset-069-cut.png",
    x: 35,
    y: 18,
    w: 15,
    h: 20,
    rotation: 8,
    z: 7,
  },
  {
    id: "tiny-label",
    name: "日期标签",
    kind: "note",
    x: 31,
    y: 22,
    w: 17,
    h: 10,
    rotation: -8,
    z: 6,
    tone: "label",
    text: "09 / 10",
  },
  {
    id: "photo-card",
    name: "今日卡片",
    kind: "note",
    x: 58,
    y: 15,
    w: 29,
    h: 28,
    rotation: 0,
    z: 2,
    tone: "photo-card",
    text: "TODAY\n走到街角，看见一阵风。",
    groupId: "today-card",
  },
  {
    id: "photo-flower",
    name: "卡片上的花",
    kind: "image",
    src: "/materials/asset-024-cut.png",
    x: 73,
    y: 5,
    w: 14,
    h: 29,
    rotation: 6,
    z: 8,
    groupId: "today-card",
  },
  {
    id: "plant",
    name: "植物贴纸",
    kind: "image",
    src: "/materials/asset-034-cut.png",
    x: 64,
    y: 44,
    w: 21,
    h: 42,
    rotation: -5,
    z: 4,
  },
  {
    id: "quote",
    name: "手写短句",
    kind: "text",
    x: 47,
    y: 54,
    w: 22,
    h: 12,
    rotation: -3,
    z: 9,
    text: "写在这里，也写进今天。",
  },
  {
    id: "locked-tape",
    name: "绿色胶带",
    kind: "tape",
    x: 44,
    y: 77,
    w: 22,
    h: 6,
    rotation: 4,
    z: 1,
    tone: "sage",
    locked: true,
  },
];

function modifierPressed(event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) {
  return event.shiftKey || event.metaKey || event.ctrlKey;
}

function pointInCanvas(event: { clientX: number; clientY: number }, canvas: HTMLElement) {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(bounds.width, event.clientX - bounds.left)),
    y: Math.max(0, Math.min(bounds.height, event.clientY - bounds.top)),
  };
}

function geometry(items: DemoItem[], canvas: HTMLElement): SelectionGeometryItem[] {
  const { width, height } = canvas.getBoundingClientRect();
  return items.map((item) => ({
    ...item,
    x: (item.x / 100) * width,
    y: (item.y / 100) * height,
    w: (item.w / 100) * width,
    h: (item.h / 100) * height,
  }));
}

export default function SelectionTestClient({ appVersion }: { appVersion: string }) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const marqueeRef = useRef<MarqueeGesture | null>(null);
  const moveRef = useRef<MoveGesture | null>(null);
  const [items, setItems] = useState<DemoItem[]>(INITIAL_ITEMS);
  const [selected, setSelected] = useState<string[]>([]);
  const [preview, setPreview] = useState<string[]>([]);
  const [marquee, setMarquee] = useState<MarqueeGesture | null>(null);
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [overlapStack, setOverlapStack] = useState<string[]>([]);
  const [message, setMessage] = useState("从纸面空白处拖动，试试一次选中多个素材。");

  const visibleItems = items.filter((item) => !item.hidden);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const previewSet = useMemo(() => new Set(preview), [preview]);
  const selectedItems = visibleItems.filter((item) => selectedSet.has(item.id));
  const selectedUnits = new Set(
    selectedItems.map((item) =>
      editingGroup
        ? `piece:${item.id}`
        : item.groupId
          ? `group:${item.groupId}`
          : `piece:${item.id}`,
    ),
  ).size;
  const selectedBounds = selectionBounds(selectedItems);
  const selectedLocked = selectedItems.some((item) => item.locked);
  const selectedHasGroup = selectedItems.some((item) => item.groupId);
  const showSelectionActions =
    selectedUnits > 1 ||
    selectedLocked ||
    overlapStack.length > 1 ||
    Boolean(editingGroup) ||
    selectedHasGroup;

  function idsForItem(item: DemoItem) {
    if (item.groupId && editingGroup !== item.groupId) {
      return visibleItems
        .filter((candidate) => candidate.groupId === item.groupId)
        .map((candidate) => candidate.id);
    }
    return [item.id];
  }

  function setSelection(next: string[]) {
    setSelected(
      [...new Set(next)].filter((id) => items.some((item) => item.id === id && !item.hidden)),
    );
  }

  function hitIdsAt(point: SelectionPoint) {
    const canvas = canvasRef.current;
    if (!canvas) return [];
    return geometry(visibleItems, canvas)
      .filter(
        (item) =>
          point.x >= item.x &&
          point.x <= item.x + item.w &&
          point.y >= item.y &&
          point.y <= item.y + item.h,
      )
      .sort(
        (a, b) =>
          (items.find((item) => item.id === b.id)?.z || 0) -
          (items.find((item) => item.id === a.id)?.z || 0),
      )
      .map((item) => item.id);
  }

  function beginMove(event: PointerEvent<HTMLElement>, movingIds: string[]) {
    if (!canvasRef.current || !movingIds.length) return;
    const moving = items.filter((item) => movingIds.includes(item.id));
    if (moving.some((item) => item.locked)) return;
    moveRef.current = {
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      original: items,
      movingIds,
      started: false,
      delta: { x: 0, y: 0 },
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function paintMovePreview(movingIds: string[], delta: SelectionPoint) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const moving = new Set(movingIds);
    canvas.querySelectorAll<HTMLElement>("[data-demo-item]").forEach((element) => {
      if (!moving.has(element.dataset.demoItem || "")) return;
      element.style.setProperty("--drag-x", `${delta.x}px`);
      element.style.setProperty("--drag-y", `${delta.y}px`);
    });
    const selection = canvas.querySelector<HTMLElement>("[data-demo-selection]");
    selection?.style.setProperty("--drag-x", `${delta.x}px`);
    selection?.style.setProperty("--drag-y", `${delta.y}px`);
  }

  function clearMovePreview() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas
      .querySelectorAll<HTMLElement>("[data-demo-item], [data-demo-selection]")
      .forEach((element) => {
        element.style.removeProperty("--drag-x");
        element.style.removeProperty("--drag-y");
      });
  }

  function itemPointerDown(event: PointerEvent<HTMLDivElement>, item: DemoItem) {
    if (event.button !== 0) return;
    event.stopPropagation();
    const itemIds = idsForItem(item);
    const toggle = modifierPressed(event);
    let next = selected;
    const alreadySelected = itemIds.every((id) => selectedSet.has(id));

    if (toggle) {
      next = mergeSelection(selected, itemIds, true);
      setSelection(next);
      if (alreadySelected) {
        setMessage("已从选择中移除。");
        return;
      }
    } else if (!alreadySelected) {
      next = itemIds;
      setSelection(next);
    }

    const canvasPoint = canvasRef.current ? pointInCanvas(event, canvasRef.current) : null;
    setOverlapStack(canvasPoint ? hitIdsAt(canvasPoint) : []);

    if (
      item.locked ||
      itemIds.some((id) => items.find((candidate) => candidate.id === id)?.locked)
    ) {
      setMessage("这是锁定素材：框选会跳过它，仍可单独选中并解锁。");
      return;
    }
    setMessage(
      next.length > itemIds.length
        ? `已加入选择；拖动可一起移动 ${new Set(next).size} 件素材。`
        : `已选中「${item.name}」；拖动可移动。`,
    );
    beginMove(event, next);
  }

  function itemPointerMove(event: PointerEvent<HTMLElement>) {
    const gesture = moveRef.current;
    const canvas = canvasRef.current;
    if (!gesture || !canvas || gesture.pointerId !== event.pointerId) return;
    const rawDelta = { x: event.clientX - gesture.start.x, y: event.clientY - gesture.start.y };
    if (!gesture.started && Math.hypot(rawDelta.x, rawDelta.y) < 3) return;
    gesture.started = true;
    const canvasBounds = canvas.getBoundingClientRect();
    const movingGeometry = geometry(
      gesture.original.filter((item) => gesture.movingIds.includes(item.id)),
      canvas,
    );
    const delta = clampSelectionMove(
      movingGeometry,
      rawDelta,
      { width: canvasBounds.width, height: canvasBounds.height },
      28,
    );
    gesture.delta = delta;
    paintMovePreview(gesture.movingIds, delta);
  }

  function finishMove(event: PointerEvent<HTMLElement>) {
    const gesture = moveRef.current;
    const canvas = canvasRef.current;
    if (!gesture || !canvas || gesture.pointerId !== event.pointerId) return;
    clearMovePreview();
    if (gesture.started) {
      const canvasBounds = canvas.getBoundingClientRect();
      setItems(
        gesture.original.map((candidate) =>
          gesture.movingIds.includes(candidate.id)
            ? {
                ...candidate,
                x: candidate.x + (gesture.delta.x / canvasBounds.width) * 100,
                y: candidate.y + (gesture.delta.y / canvasBounds.height) * 100,
              }
            : candidate,
        ),
      );
      setMessage("位置已更新；素材仍保留可抓取区域。");
    }
    moveRef.current = null;
  }

  function cancelMove(event: PointerEvent<HTMLElement>) {
    if (moveRef.current?.pointerId !== event.pointerId) return;
    clearMovePreview();
    moveRef.current = null;
    setMessage("移动已取消。");
  }

  function canvasPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || event.pointerType === "touch") return;
    const target = event.target as Element;
    if (target.closest("[data-demo-item], [data-demo-ui]")) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const start = pointInCanvas(event, canvas);
    const gesture: MarqueeGesture = {
      pointerId: event.pointerId,
      start,
      current: start,
      baseSelection: selected,
      toggle: modifierPressed(event),
      started: false,
    };
    marqueeRef.current = gesture;
    setMarquee(gesture);
    setPreview([]);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function canvasPointerMove(event: PointerEvent<HTMLDivElement>) {
    const gesture = marqueeRef.current;
    const canvas = canvasRef.current;
    if (!gesture || !canvas || gesture.pointerId !== event.pointerId) return;
    const current = pointInCanvas(event, canvas);
    const rect = selectionRect(gesture.start, current);
    const size = selectionRectSize(rect);
    const started = gesture.started || Math.hypot(size.width, size.height) >= 4;
    const nextGesture = { ...gesture, current, started };
    marqueeRef.current = nextGesture;
    setMarquee(nextGesture);
    if (!started) return;
    setPreview(idsInSelectionRect(geometry(items, canvas), rect, editingGroup));
  }

  function finishMarquee(event: PointerEvent<HTMLDivElement>) {
    const gesture = marqueeRef.current;
    const canvas = canvasRef.current;
    if (!gesture || !canvas || gesture.pointerId !== event.pointerId) return;
    if (gesture.started) {
      const hits = idsInSelectionRect(
        geometry(items, canvas),
        selectionRect(gesture.start, gesture.current),
        editingGroup,
      );
      const next = mergeSelection(gesture.baseSelection, hits, gesture.toggle);
      setSelection(next);
      setMessage(
        next.length
          ? `已选 ${new Set(next).size} 件；拖动任意已选素材可整体移动。`
          : "选择框内没有可选素材。",
      );
    } else if (!gesture.toggle) {
      setSelection([]);
      setOverlapStack([]);
      setMessage("已取消选择。");
    }
    marqueeRef.current = null;
    setMarquee(null);
    setPreview([]);
  }

  function cancelMarquee(event: PointerEvent<HTMLDivElement>) {
    if (marqueeRef.current?.pointerId !== event.pointerId) return;
    marqueeRef.current = null;
    setMarquee(null);
    setPreview([]);
    setMessage("拖框已取消，原选择保持不变。");
  }

  function cycleLowerLayer() {
    if (overlapStack.length < 2) return;
    const currentIndex = overlapStack.findIndex((id) => selectedSet.has(id));
    const nextId = overlapStack[(currentIndex + 1 + overlapStack.length) % overlapStack.length];
    const item = items.find((candidate) => candidate.id === nextId);
    if (!item) return;
    setSelection(idsForItem(item));
    setMessage(`已切换到下层「${item.name}」。`);
  }

  function toggleLock() {
    if (!selected.length) return;
    const shouldLock = !selectedLocked;
    setItems((current) =>
      current.map((item) => (selectedSet.has(item.id) ? { ...item, locked: shouldLock } : item)),
    );
    setMessage(shouldLock ? "已锁定所选；拖框会自动跳过。" : "已解锁所选。");
  }

  function enterOrLeaveGroup() {
    const groupId = selectedItems.find((item) => item.groupId)?.groupId;
    if (editingGroup) {
      const groupMembers = visibleItems
        .filter((item) => item.groupId === editingGroup)
        .map((item) => item.id);
      setEditingGroup(null);
      setSelection(groupMembers);
      setMessage("已返回整个组合。");
    } else if (groupId) {
      setEditingGroup(groupId);
      setSelection([selectedItems[0].id]);
      setMessage("正在编辑组合内部；拖框只会选择该组合的成员。");
    }
  }

  function resetDemo() {
    setItems(INITIAL_ITEMS);
    setSelection([]);
    setPreview([]);
    setEditingGroup(null);
    setOverlapStack([]);
    setMessage("已恢复示例。请从纸面空白处拖动。");
  }

  useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, [contenteditable="true"]')) return;
      if (event.key === "Escape") {
        event.preventDefault();
        marqueeRef.current = null;
        setMarquee(null);
        setPreview([]);
        setSelection([]);
        setMessage("已取消选择。");
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        const next = items.filter((item) => !item.hidden && !item.locked).map((item) => item.id);
        setSelection(next);
        setMessage(`已选择当前跨页全部 ${next.length} 件可移动素材。`);
      }
    }
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [items]);

  const marqueeStyle = marquee?.started
    ? (() => {
        const rect = selectionRect(marquee.start, marquee.current);
        return {
          left: rect.left,
          top: rect.top,
          width: rect.right - rect.left,
          height: rect.bottom - rect.top,
        };
      })()
    : undefined;

  return (
    <main className="selection-demo">
      <header className="selection-demo__header" data-demo-ui>
        <div>
          <span className="selection-demo__eyebrow">拾光 · 交互试验台</span>
          <h1>素材选中 / 拖选 Demo</h1>
          <p>不读取、不修改正式手帐。满意后再接入编辑器。</p>
        </div>
        <div className="selection-demo__header-actions">
          <span className="selection-demo__version">v{appVersion}</span>
          <a href="/" className="selection-demo__text-button">
            返回手帐
          </a>
          <button type="button" onClick={resetDemo}>
            <RotateCcw />
            恢复示例
          </button>
        </div>
      </header>

      <section className="selection-demo__toolbar" data-demo-ui aria-label="选择工具栏">
        <span className="selection-demo__mode">
          <MousePointer2 />
          直接选择
        </span>
        <span className="selection-demo__status" role="status">
          {message}
        </span>
        <button
          type="button"
          onClick={() => {
            const next = items
              .filter((item) => !item.hidden && !item.locked)
              .map((item) => item.id);
            setSelection(next);
            setMessage(`已选择当前跨页全部 ${next.length} 件可移动素材。`);
          }}
        >
          <Check />
          全选可移动素材
        </button>
        <button type="button" disabled={!selected.length} onClick={toggleLock}>
          {selectedLocked ? <Unlock /> : <Lock />}
          {selectedLocked ? "解锁所选" : "锁定所选"}
        </button>
        <button
          type="button"
          disabled={!selected.length}
          onClick={() => {
            setSelection([]);
            setMessage("已取消选择。");
          }}
        >
          <X />
          取消选择
        </button>
      </section>

      <div className="selection-demo__workspace">
        <aside className="selection-demo__guide" data-demo-ui>
          <h2>试这几步</h2>
          <ol>
            <li>
              <b>空白处拖框</b>
              <span>素材中心进入框内即选中</span>
            </li>
            <li>
              <b>按住 Shift 再拖框</b>
              <span>追加或取消一批素材</span>
            </li>
            <li>
              <b>拖动任意已选素材</b>
              <span>整组一起移动，空隙不挡点击</span>
            </li>
            <li>
              <b>点重叠的邮票</b>
              <span>用“切换下层”选择下面的日期标签</span>
            </li>
            <li>
              <b>双击右上组合</b>
              <span>进入后只选择组合内部成员</span>
            </li>
          </ol>
          <div className="selection-demo__legend">
            <span>
              <i className="is-live" />
              拖框预览
            </span>
            <span>
              <i className="is-selected" />
              正式选中
            </span>
            <span>
              <i className="is-locked" />
              锁定跳过
            </span>
          </div>
        </aside>

        <section className="selection-demo__stage" aria-label="素材拖选测试区">
          <div
            ref={canvasRef}
            className={`selection-demo__paper ${marquee?.started ? "is-marquee-active" : ""}`}
            onPointerDown={canvasPointerDown}
            onPointerMove={canvasPointerMove}
            onPointerUp={finishMarquee}
            onPointerCancel={cancelMarquee}
          >
            <div className="selection-demo__page selection-demo__page--left" aria-hidden="true" />
            <div className="selection-demo__page selection-demo__page--right" aria-hidden="true" />
            <div className="selection-demo__fold" aria-hidden="true" />

            {visibleItems
              .slice()
              .sort((a, b) => a.z - b.z)
              .map((item) => {
                const isSelected = selectedSet.has(item.id);
                const isPreviewed = previewSet.has(item.id);
                return (
                  <div
                    key={item.id}
                    data-demo-item={item.id}
                    className={`selection-demo__item selection-demo__item--${item.kind} ${item.tone ? `selection-demo__item--${item.tone}` : ""} ${isSelected ? "is-selected" : ""} ${isPreviewed ? "is-previewed" : ""} ${item.locked ? "is-locked" : ""}`}
                    style={{
                      left: `${item.x}%`,
                      top: `${item.y}%`,
                      width: `${item.w}%`,
                      height: `${item.h}%`,
                      transform: `translate3d(var(--drag-x, 0px), var(--drag-y, 0px), 0) rotate(${item.rotation}deg)`,
                      zIndex: item.z,
                    }}
                    onPointerDown={(event) => itemPointerDown(event, item)}
                    onPointerMove={itemPointerMove}
                    onPointerUp={finishMove}
                    onPointerCancel={cancelMove}
                    onDoubleClick={(event) => {
                      event.stopPropagation();
                      if (item.groupId) {
                        setEditingGroup(item.groupId);
                        setSelection([item.id]);
                        setMessage("正在编辑组合内部；拖框只会选择该组合的成员。");
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={`${item.locked ? "已锁定" : "选择"}${item.name}`}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      const itemIds = idsForItem(item);
                      setSelection(
                        modifierPressed(event) ? mergeSelection(selected, itemIds, true) : itemIds,
                      );
                      setMessage(`已选中「${item.name}」。`);
                    }}
                  >
                    {item.kind === "image" && (
                      <img src={item.src} alt={item.name} draggable={false} />
                    )}
                    {item.kind === "note" && <span>{item.text}</span>}
                    {item.kind === "text" && <span>{item.text}</span>}
                    {item.kind === "tape" && <span aria-hidden="true" />}
                    {item.locked && (
                      <span className="selection-demo__lock-mark">
                        <Lock />
                      </span>
                    )}
                  </div>
                );
              })}

            {marqueeStyle && (
              <div className="selection-demo__marquee" style={marqueeStyle} aria-hidden="true" />
            )}

            {selectedBounds && (
              <div
                data-demo-selection
                className={`selection-demo__selection ${selectedItems.length > 1 ? "is-multi" : ""}`}
                style={{
                  left: `${selectedBounds.x}%`,
                  top: `${selectedBounds.y}%`,
                  width: `${selectedBounds.w}%`,
                  height: `${selectedBounds.h}%`,
                }}
              >
                {!selectedLocked && (
                  <>
                    <span
                      className="selection-demo__edge selection-demo__edge--top"
                      onPointerDown={(event) => beginMove(event, selected)}
                      onPointerMove={itemPointerMove}
                      onPointerUp={finishMove}
                      onPointerCancel={cancelMove}
                    />
                    <span
                      className="selection-demo__edge selection-demo__edge--right"
                      onPointerDown={(event) => beginMove(event, selected)}
                      onPointerMove={itemPointerMove}
                      onPointerUp={finishMove}
                      onPointerCancel={cancelMove}
                    />
                    <span
                      className="selection-demo__edge selection-demo__edge--bottom"
                      onPointerDown={(event) => beginMove(event, selected)}
                      onPointerMove={itemPointerMove}
                      onPointerUp={finishMove}
                      onPointerCancel={cancelMove}
                    />
                    <span
                      className="selection-demo__edge selection-demo__edge--left"
                      onPointerDown={(event) => beginMove(event, selected)}
                      onPointerMove={itemPointerMove}
                      onPointerUp={finishMove}
                      onPointerCancel={cancelMove}
                    />
                  </>
                )}
                {showSelectionActions && (
                  <div className="selection-demo__selection-label" data-demo-ui>
                    {(selectedUnits > 1 || selectedLocked) && (
                      <span>{selectedLocked ? "已锁定" : `${selectedUnits} 个素材`}</span>
                    )}
                    {overlapStack.length > 1 && (
                      <button type="button" onClick={cycleLowerLayer}>
                        切换下层
                      </button>
                    )}
                    {(editingGroup || selectedHasGroup) && (
                      <button type="button" onClick={enterOrLeaveGroup}>
                        {editingGroup ? "返回组合" : "编辑组合"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {editingGroup && (
              <div className="selection-demo__group-mode" data-demo-ui>
                <Layers />
                正在编辑组合内部
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
