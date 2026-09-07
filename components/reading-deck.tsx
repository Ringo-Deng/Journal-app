'use client';
import {
  useRef,
  useState,
  useEffect,
  useCallback,
  type PointerEvent,
  type CSSProperties,
} from 'react';
import {
  BookOpen,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { SpreadPreview } from './page-turn';
import ReadingLeaf from './reading-leaf';
import { shouldCompleteTurn } from '@/lib/page-motion';
import { bookFormat, coverInfo, type Book, type Asset } from '@/lib/journal';

type Turn = { from: number; to: number; progress: number };
type ViewerState = 'cover' | 'opening' | 'reading';
type Drag = {
  id: number;
  x: number;
  y: number;
  lastX: number;
  time: number;
  velocity: number;
  width: number;
  direction: number;
  active: boolean;
};
function animateProgress(
  frame: { current: number },
  from: number,
  end: number,
  duration: number,
  update: (p: number) => void,
  done: () => void,
) {
  const start = performance.now();
  function tick(now: number) {
    const t = duration ? Math.min(1, (now - start) / duration) : 1;
    const eased =
      from === 0 && end === 1 ? t * t * (3 - 2 * t) : 1 - Math.pow(1 - t, 3);
    update(from + (end - from) * eased);
    if (t < 1) frame.current = requestAnimationFrame(tick);
    else done();
  }
  frame.current = requestAnimationFrame(tick);
}
export default function ReadingDeck({
  book,
  assets,
  page,
  onSelect,
}: {
  book: Book;
  assets: Asset[];
  page: number;
  onSelect: (page: number) => void;
}) {
  const [grid, setGrid] = useState(false);
  const [viewerState, setViewerState] = useState<ViewerState>('cover');
  const [turn, setTurn] = useState<Turn | null>(null);
  const turnRef = useRef<Turn | null>(null);
  const animating = useRef(false);
  const animation = useRef(0);
  const center = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const offset = book.flyleaf ? 1 : 0;
  const sheets = [
    ...(book.flyleaf ? [{ spread: book.flyleaf, flyleaf: true }] : []),
    ...book.spreads.map((spread) => ({ spread, flyleaf: false })),
  ];
  const count = sheets.length;
  const current = Math.max(0, Math.min(page, count - 1));
  const cover = coverInfo(book.cover);
  const coverAsset = book.coverAsset
    ? assets.find((asset) => asset.originalSrc === book.coverAsset)?.src ||
      book.coverAsset
    : '';
  const readingReady = viewerState === 'reading';
  const openCover = useCallback(() => {
    if (viewerState !== 'cover' || !count) return;
    onSelect(0);
    setViewerState('opening');
  }, [count, onSelect, viewerState]);
  const updateTurn = useCallback((value: Turn | null) => {
    turnRef.current = value;
    setTurn(value);
  }, []);
  /* 拖拽跟手进度按帧合并，避免每次 pointermove 都重渲染。 */
  const dragFrame = useRef(0);
  const updateTurnThrottled = useCallback((value: Turn) => {
    turnRef.current = value;
    if (!dragFrame.current)
      dragFrame.current = requestAnimationFrame(() => {
        dragFrame.current = 0;
        if (turnRef.current) setTurn({ ...turnRef.current });
      });
  }, []);
  const settle = useCallback(
    (complete: boolean) => {
      cancelAnimationFrame(dragFrame.current);
      dragFrame.current = 0;
      const initial = turnRef.current;
      if (!initial) return;
      animating.current = true;
      const end = complete ? 1 : 0,
        distance = Math.abs(end - initial.progress);
      const duration = window.matchMedia('(prefers-reduced-motion: reduce)')
        .matches
        ? 0
        : Math.max(180, 900 * distance);
      animateProgress(
        animation,
        initial.progress,
        end,
        duration,
        (progress) => updateTurn({ ...initial, progress }),
        () => {
          if (complete) onSelect(initial.to);
          updateTurn(null);
          animating.current = false;
        },
      );
    },
    [onSelect, updateTurn],
  );
  const move = useCallback(
    (next: number) => {
      if (
        next < 0 ||
        next >= count ||
        next === current ||
        animating.current ||
        turnRef.current
      )
        return;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        onSelect(next);
        return;
      }
      updateTurn({ from: current, to: next, progress: 0 });
      settle(true);
    },
    [count, current, onSelect, settle, updateTurn],
  );
  useEffect(
    () => () => {
      cancelAnimationFrame(animation.current);
      cancelAnimationFrame(dragFrame.current);
    },
    [],
  );
  useEffect(() => {
    setGrid(false);
    setViewerState('cover');
    updateTurn(null);
    animating.current = false;
    drag.current = null;
  }, [book.id, updateTurn]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
        target.isContentEditable
      )
        return;
      if (!grid && e.key === 'ArrowRight' && viewerState === 'cover') {
        e.preventDefault();
        e.stopImmediatePropagation();
        openCover();
      } else if (
        readingReady &&
        !grid &&
        ['ArrowLeft', 'ArrowRight'].includes(e.key)
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        move(current + (e.key === 'ArrowRight' ? 1 : -1));
      }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [grid, current, move, openCover, readingReady, viewerState]);
  function pointerDown(e: PointerEvent<HTMLDivElement>) {
    if (
      !readingReady ||
      e.button !== 0 ||
      !e.isPrimary ||
      animating.current ||
      turnRef.current
    )
      return;
    const width =
      center.current?.getBoundingClientRect().width ||
      e.currentTarget.clientWidth;
    suppressClick.current = false;
    drag.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      lastX: e.clientX,
      time: e.timeStamp,
      velocity: 0,
      width,
      direction: 0,
      active: false,
    };
  }
  function pointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x,
      dy = e.clientY - d.y;
    if (!d.active) {
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
        drag.current = null;
        return;
      }
      if (Math.abs(dx) < 8) return;
      d.direction = dx < 0 ? 1 : -1;
      const target = current + d.direction;
      if (target < 0 || target >= count) {
        drag.current = null;
        suppressClick.current = true;
        return;
      }
      d.active = true;
      suppressClick.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    e.preventDefault();
    const dt = e.timeStamp - d.time;
    if (dt > 0) d.velocity = (-(e.clientX - d.lastX) * d.direction) / dt;
    d.lastX = e.clientX;
    d.time = e.timeStamp;
    const progress = Math.max(
      0,
      Math.min(1, (-dx * d.direction) / (d.width * 0.78)),
    );
    updateTurnThrottled({ from: current, to: current + d.direction, progress });
  }
  function pointerEnd(e: PointerEvent<HTMLDivElement>, cancel = false) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    if (d.active) {
      const velocity = e.timeStamp - d.time > 100 ? 0 : d.velocity;
      settle(
        !cancel && shouldCompleteTurn(turnRef.current?.progress || 0, velocity),
      );
    }
  }
  const content = (
    <section
      className={`reading-deck notebook-${book.cover} deck-large viewer-${viewerState} ${grid ? 'deck-grid-mode' : ''}`}
      aria-label="手帐连续翻阅"
      style={
        {
          '--spread-ratio': bookFormat(book).ratio,
          '--book-scale': bookFormat(book).scale,
        } as CSSProperties
      }
    >
      <fieldset className="deck-view-switch" aria-label="欣赏方式">
        <button
          aria-label="连续翻阅"
          aria-pressed={!grid}
          disabled={!readingReady}
          onClick={() => setGrid(false)}
        >
          <BookOpen />
        </button>
        <button
          aria-label="全部跨页"
          aria-pressed={grid}
          disabled={!readingReady || !!turn}
          onClick={() => setGrid(true)}
        >
          <LayoutGrid />
        </button>
      </fieldset>
      <header className="deck-heading">
        <h1>{book.title || '拾光集'}</h1>
        <p>
          {book.spreads.length} 个跨页 · {book.spreads.length * 2} 页
        </p>
      </header>
      {!count ? (
        <p className="deck-empty">
          这本手帐还没有内页，去工作台添加第一篇记录吧。
        </p>
      ) : grid ? (
        <div className="deck-grid">
          {sheets.map((sheet, i) => (
            <button
              className="deck-thumbnail"
              key={sheet.spread.id}
              aria-label={sheet.flyleaf ? '打开扉页' : `打开第 ${i - offset + 1} 个跨页`}
              onClick={() => {
                onSelect(i);
                setGrid(false);
              }}
            >
              <div className="deck-thumbnail-paper">
                <SpreadPreview
                  book={book}
                  spread={sheet.spread}
                  assets={assets}
                  flyleaf={sheet.flyleaf}
                  pageIndex={sheet.flyleaf ? undefined : i - offset}
                />
              </div>
              <span>{sheet.flyleaf ? '扉页' : `第 ${i - offset + 1} 个跨页`}</span>
            </button>
          ))}
        </div>
      ) : (
        <>
          <div
            className={`deck-stage bound-book ${turn ? 'is-turning' : ''}`}
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={(e) => pointerEnd(e)}
            onPointerCancel={(e) => pointerEnd(e, true)}
            onPointerLeave={() => {
              if (!drag.current?.active) drag.current = null;
            }}
            onLostPointerCapture={(e) => {
              if (drag.current?.active) pointerEnd(e, true);
            }}
          >
            <div className="deck-book-core">
              <div className="deck-page-block" aria-hidden="true" />
              <div ref={center} className="deck-sheet deck-current" role="group" aria-label={sheets[current].flyleaf?'当前扉页':`当前第 ${current-offset+1} 个跨页`}>
                <SpreadPreview
                  book={book}
                  spread={sheets[current].spread}
                  assets={assets}
                  flyleaf={sheets[current].flyleaf}
                  pageIndex={sheets[current].flyleaf ? undefined : current - offset}
                />
                <span className="deck-sheet-shade" />
                <button className="deck-corner deck-corner-left" aria-label="向前翻页" disabled={!readingReady||current===0||!!turn} onClick={()=>{if(suppressClick.current){suppressClick.current=false;return;}move(current-1);}}/>
                <button className="deck-corner deck-corner-right" aria-label="向后翻页" disabled={!readingReady||current===count-1||!!turn} onClick={()=>{if(suppressClick.current){suppressClick.current=false;return;}move(current+1);}}/>
              </div>
              {turn && (
                <div className="deck-flip-surface" aria-hidden="true">
                  <ReadingLeaf
                    book={book}
                    from={sheets[turn.from].spread}
                    to={sheets[turn.to].spread}
                    fromFlyleaf={sheets[turn.from].flyleaf}
                    toFlyleaf={sheets[turn.to].flyleaf}
                    fromIndex={sheets[turn.from].flyleaf ? undefined : turn.from - offset}
                    toIndex={sheets[turn.to].flyleaf ? undefined : turn.to - offset}
                    assets={assets}
                    next={turn.to > turn.from}
                    progress={turn.progress}
                  />
                </div>
              )}
            </div>
            <div className="deck-cover-scene">
              <button
                className="deck-rigid-cover"
                style={{ '--cover-base': cover.colorway.color } as CSSProperties}
                aria-label={viewerState === 'cover' ? '打开手帐封面' : '手帐封面正在打开'}
                disabled={viewerState !== 'cover'}
                onClick={openCover}
                onAnimationEnd={() => {
                  if (viewerState === 'opening') setViewerState('reading');
                }}
              >
                <span className={`deck-cover-face deck-cover-front texture-${cover.material.id}`}>
                  {!coverAsset && <span className="cover-title-stamp">{book.title}<i>SHIGUANG JOURNAL</i></span>}
                  {coverAsset && <img className="cover-art" src={coverAsset} alt="封面装饰" />}
                </span>
                <span className={`deck-cover-face deck-cover-back texture-${cover.material.id}`}>
                  <span className="cover-inside-edge" aria-hidden="true" />
                  <span className="cover-binding" aria-hidden="true" />
                </span>
                <span className="deck-cover-edge" aria-hidden="true" />
              </button>
            </div>
          </div>
          <footer className="deck-controls">
            <button
              aria-label="上一个跨页"
              disabled={!readingReady || current === 0 || !!turn}
              onClick={() => move(current - 1)}
            >
              <ChevronLeft />
            </button>
            <span aria-live="polite">
              {readingReady ? `${current + 1} / ${count}` : '点击封面打开'}
            </span>
            <button
              aria-label="下一个跨页"
              disabled={!readingReady || current === count - 1 || !!turn}
              onClick={() => move(current + 1)}
            >
              <ChevronRight />
            </button>
          </footer>

        </>
      )}
    </section>
  );
  return content;
}
