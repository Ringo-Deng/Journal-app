'use client';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
  type ReactNode,
  type PointerEvent,
  useSyncExternalStore,
} from 'react';
import { createPortal } from 'react-dom';
import { Grip, ChevronDown, ChevronUp } from 'lucide-react';
type Dock = 'top' | 'bottom' | 'left' | 'right' | 'free';
type Placement = { dock: Dock; x: number; y: number; vertical?: boolean };
const key = 'shiguang-editor-toolbar-v1';
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const subscribe = () => () => {};
export default function FloatingToolbar({
  host,
  children,
}: {
  host: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  const [placement, setPlacement] = useState<Placement>({
    dock: 'top',
    x: 0.5,
    y: 0,
  });
  const [collapsed, setCollapsed] = useState(false);
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const [area, setArea] = useState({
    left: 0,
    top: 0,
    width: 800,
    height: 600,
  });
  const [size, setSize] = useState({ width: 800, height: 100 });
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    left: number;
    top: number;
    vertical: boolean;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const p = JSON.parse(localStorage.getItem(key) || 'null');
        if (
          p &&
          ['top', 'bottom', 'left', 'right', 'free'].includes(p.dock) &&
          Number.isFinite(p.x) &&
          Number.isFinite(p.y)
        )
          setPlacement({
            dock: p.dock,
            x: clamp(p.x),
            y: clamp(p.y),
            vertical: !!p.vertical,
          });
      } catch {}
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  useLayoutEffect(() => {
    if (!mounted || !host.current || !root.current) return;
    function measure() {
      const r = host.current?.getBoundingClientRect(),
        t = root.current?.getBoundingClientRect();
      if (!r || !t) return;
      const left = Math.max(8, r.left + 8),
        top = Math.max(8, r.top + 8);
      const next = {
        left,
        top,
        width: Math.max(
          160,
          Math.min(window.innerWidth - 8, r.right - 8) - left,
        ),
        height: Math.max(
          100,
          Math.min(window.innerHeight - 8, r.bottom - 8) - top,
        ),
      };
      setArea((old) =>
        Object.keys(next).every(
          (k) => old[k as keyof typeof old] === next[k as keyof typeof next],
        )
          ? old
          : next,
      );
      setSize((old) =>
        old.width === t.width && old.height === t.height
          ? old
          : { width: t.width, height: t.height },
      );
    }
    const frame = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(host.current);
    observer.observe(root.current);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [mounted, host]);
  const maxX = Math.max(0, area.width - size.width),
    maxY = Math.max(0, area.height - size.height);
  const left =
    area.left +
    (placement.dock === 'left'
      ? 0
      : placement.dock === 'right'
        ? maxX
        : placement.x * maxX);
  const top =
    area.top +
    (placement.dock === 'top'
      ? 0
      : placement.dock === 'bottom'
        ? maxY
        : placement.y * maxY);
  function save(p: Placement) {
    setPlacement(p);
    try {
      localStorage.setItem(key, JSON.stringify(p));
    } catch {}
  }
  function end(e: PointerEvent<HTMLButtonElement>) {
    if (!drag.current || drag.current.id !== e.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    const distances = [
      ['left', maxX > 28 ? placement.x * maxX : Infinity],
      ['right', maxX > 28 ? (1 - placement.x) * maxX : Infinity],
      ['top', placement.y * maxY],
      ['bottom', (1 - placement.y) * maxY],
    ] as const;
    const nearest = [...distances].sort((a, b) => a[1] - b[1])[0];
    save({ ...placement, dock: nearest[1] < 28 ? nearest[0] : 'free' });
  }
  const vertical =
    placement.dock === 'left' ||
    placement.dock === 'right' ||
    (placement.dock === 'free' && placement.vertical);
  if (!mounted) return null;
  return createPortal(
    <div
      ref={root}
      data-editor-ui="true"
      data-dock={placement.dock}
      data-vertical={!!vertical}
      className={`floating-editor-toolbar ${dragging ? 'is-dragging' : ''} ${collapsed ? 'is-collapsed' : ''}`}
      role="toolbar"
      aria-label="手帐工具条"
      style={{ left, top, maxWidth: area.width, maxHeight: area.height }}
    >
      <div className="floating-toolbar-head">
        <button
          className="toolbar-grip"
          aria-label="拖动工具条"
          title="拖动到任意位置，靠近边缘自动吸附；方向键移动，Home 回顶部"
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            drag.current = {
              id: e.pointerId,
              x: e.clientX,
              y: e.clientY,
              left,
              top,
              vertical: !!vertical,
            };
            setDragging(true);
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d || d.id !== e.pointerId) return;
            setPlacement({
              dock: 'free',
              vertical: d.vertical,
              x: clamp((d.left + e.clientX - d.x - area.left) / (maxX || 1)),
              y: clamp((d.top + e.clientY - d.y - area.top) / (maxY || 1)),
            });
          }}
          onPointerUp={end}
          onPointerCancel={end}
          onKeyDown={(e) => {
            if (e.key === 'Home') {
              e.preventDefault();
              save({ dock: 'top', x: 0.5, y: 0 });
            } else if (e.key.startsWith('Arrow')) {
              e.preventDefault();
              e.stopPropagation();
              save({
                dock: 'free',
                x: clamp(
                  (left -
                    area.left +
                    (e.key === 'ArrowLeft'
                      ? -20
                      : e.key === 'ArrowRight'
                        ? 20
                        : 0)) /
                    (maxX || 1),
                ),
                y: clamp(
                  (top -
                    area.top +
                    (e.key === 'ArrowUp'
                      ? -20
                      : e.key === 'ArrowDown'
                        ? 20
                        : 0)) /
                    (maxY || 1),
                ),
              });
            }
          }}
        >
          <Grip />
          <span>工具</span>
        </button>
        <select
          aria-label="工具条吸附位置"
          value={placement.dock}
          onChange={(e) => save({ ...placement, dock: e.target.value as Dock })}
        >
          <option value="top">顶部</option>
          <option value="bottom">底部</option>
          <option value="left">左侧</option>
          <option value="right">右侧</option>
          <option value="free">自由移动</option>
        </select>
        <button
          className="quiet"
          aria-label={collapsed ? '展开工具条' : '收起工具条'}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <ChevronDown /> : <ChevronUp />}
        </button>
      </div>
      {!collapsed && <div className="floating-toolbar-content">{children}</div>}
    </div>,
    document.body,
  );
}
