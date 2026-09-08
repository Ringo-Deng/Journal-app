'use client';

import {
  forwardRef,
  memo,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type CSSProperties,
} from 'react';
import { SpreadPreview } from './page-turn';
import { bookFormat, coverInfo, paperSettings, type Asset, type Book, type Spread } from '@/lib/journal';

const PAGE_FLIP_SOURCES = [
  'https://cdn.jsdelivr.net/npm/page-flip@2.0.7/dist/js/page-flip.browser.js',
  'https://unpkg.com/page-flip@2.0.7/dist/js/page-flip.browser.js',
] as const;

type PageFlipEvent = { data: number | string };
type PageFlipInstance = {
  loadFromHTML(items: NodeListOf<HTMLElement> | HTMLElement[]): void;
  flipNext(corner?: 'top' | 'bottom'): void;
  flipPrev(corner?: 'top' | 'bottom'): void;
  turnToPage(pageNum: number): void;
  on(event: string, callback: (event: PageFlipEvent) => void): void;
  destroy(): void;
};
type PageFlipConstructor = new (
  element: HTMLElement,
  settings: Record<string, number | string | boolean>,
) => PageFlipInstance;
type PageFlipWindow = Window & { St?: { PageFlip?: PageFlipConstructor } };

export type ReadingPageFlipHandle = {
  next(): void;
  prev(): void;
};

type PositionState = {
  atStart: boolean;
  atEnd: boolean;
  opened: boolean;
};

type ReadingPageFlipProps = {
  book: Book;
  assets: Asset[];
  readingIndex: number;
  startOpen: boolean;
  onReadingIndex: (index: number) => void;
  onReadyChange: (ready: boolean) => void;
  onOpened: () => void;
  onPosition: (state: PositionState) => void;
  onError: () => void;
};

function getConstructor(): PageFlipConstructor | null {
  return (window as PageFlipWindow).St?.PageFlip ?? null;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-reading-page-flip-src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.readingPageFlipSrc = src;
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      resolve();
    }, { once: true });
    script.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
    document.head.appendChild(script);
  });
}

async function loadPageFlip(): Promise<PageFlipConstructor> {
  const existing = getConstructor();
  if (existing) return existing;

  let lastError: unknown = null;
  for (const src of PAGE_FLIP_SOURCES) {
    try {
      await loadScript(src);
      const constructor = getConstructor();
      if (constructor) return constructor;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error('Unable to load StPageFlip');
}

function Slice({
  book,
  spread,
  assets,
  side,
  flyleaf = false,
  pageIndex,
}: {
  book: Book;
  spread: Spread;
  assets: Asset[];
  side: 'left' | 'right';
  flyleaf?: boolean;
  pageIndex?: number;
}) {
  return (
    <div className={`reading-flip-slice reading-flip-slice-${side}`}>
      <div className="reading-flip-spread-canvas">
        <SpreadPreview
          book={book}
          spread={spread}
          assets={assets}
          flyleaf={flyleaf}
          pageIndex={pageIndex}
        />
      </div>
    </div>
  );
}

function CoverShell({
  book,
  assets,
  side,
}: {
  book: Book;
  assets: Asset[];
  side: 'front' | 'back';
}) {
  const cover = coverInfo(book.cover);
  const coverAsset = book.coverAsset
    ? assets.find((asset) => asset.originalSrc === book.coverAsset)?.src || book.coverAsset
    : '';
  const material = cover.material.id;
  return (
    <div
      className={`reading-flip-page reading-flip-cover reading-flip-cover-${side}`}
      data-density="hard"
      style={{ '--cover-base': cover.colorway.color } as CSSProperties}
    >
      <div className="reading-flip-cover-shell">
        <div className={`reading-flip-cover-face reading-flip-cover-outside texture-${material}`}>
          {side === 'front' ? (
            <>
              {!coverAsset && (
                <span className="cover-title-stamp">
                  {book.title || '拾光集'}
                  <i>SHIGUANG JOURNAL</i>
                </span>
              )}
              {coverAsset && <img className="cover-art" src={coverAsset} alt="封面装饰" />}
            </>
          ) : (
            <span className="reading-flip-back-mark">SHIGUANG JOURNAL</span>
          )}
        </div>
        <div className={`reading-flip-cover-face reading-flip-cover-inside cover-inside texture-${material}`}>
          <span className="cover-inside-edge" aria-hidden="true" />
          <span className="cover-binding" aria-hidden="true" />
        </div>
        <span className="reading-flip-cover-edge reading-flip-cover-edge-outer" aria-hidden="true" />
        <span className="reading-flip-cover-edge reading-flip-cover-edge-top" aria-hidden="true" />
        <span className="reading-flip-cover-edge reading-flip-cover-edge-bottom" aria-hidden="true" />
      </div>
    </div>
  );
}

function readingIndexForPhysical(physical: number, count: number, finalVersoIndex: number) {
  if (count <= 1 || physical <= 2) return 0;
  if (physical >= finalVersoIndex) return count - 1;
  return Math.min(count - 1, 1 + Math.floor((physical - 3) / 2));
}

function physicalForReadingIndex(index: number) {
  return index <= 0 ? 1 : 3 + (index - 1) * 2;
}

const ReadingPageFlipBase = forwardRef<ReadingPageFlipHandle, ReadingPageFlipProps>(function ReadingPageFlip(
  {
    book,
    assets,
    readingIndex,
    startOpen,
    onReadingIndex,
    onReadyChange,
    onOpened,
    onPosition,
    onError,
  },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<PageFlipInstance | null>(null);
  const callbackRef = useRef({ onReadingIndex, onReadyChange, onOpened, onPosition, onError });
  const initialStartPage = useRef(startOpen ? physicalForReadingIndex(readingIndex) : 0).current;

  const flyleaf = book.flyleaf;
  const body = book.spreads;
  const count = (flyleaf ? 1 : 0) + body.length;
  const lastSpread = body.at(-1);
  const blankLastSpread = useMemo(
    () => lastSpread ? { ...lastSpread, elements: [] } : flyleaf ? { ...flyleaf, elements: [] } : undefined,
    [flyleaf, lastSpread],
  );
  const finalVersoIndex = 3 + body.length * 2;
  const backLiningIndex = finalVersoIndex + 1;
  const backCoverIndex = finalVersoIndex + 2;
  const material = coverInfo(book.cover).material.id;
  const paper = paperSettings(book, lastSpread);

  useImperativeHandle(ref, () => ({
    next: () => instanceRef.current?.flipNext('bottom'),
    prev: () => instanceRef.current?.flipPrev('bottom'),
  }), []);

  useEffect(() => {
    let cancelled = false;
    let instance: PageFlipInstance | null = null;
    const host = hostRef.current;
    if (!host || !flyleaf || !count) return;

    callbackRef.current.onReadyChange(false);
    const init = async () => {
      try {
        const PageFlipCtor = await loadPageFlip();
        if (cancelled) return;
        const format = bookFormat(book);
        const pageRatio = format.ratio / 2;
        const width = 380;
        const height = Math.round(width / pageRatio);
        instance = new PageFlipCtor(host, {
          startPage: initialStartPage,
          width,
          height,
          size: 'stretch',
          minWidth: 250,
          maxWidth: 460,
          minHeight: Math.round(250 / pageRatio),
          maxHeight: Math.round(460 / pageRatio),
          drawShadow: true,
          flippingTime: 900,
          usePortrait: false,
          autoSize: true,
          maxShadowOpacity: 0.42,
          showCover: true,
          mobileScrollSupport: false,
          clickEventForward: true,
          useMouseEvents: true,
          swipeDistance: 30,
          showPageCorners: true,
          disableFlipByClick: false,
        });

        const pages = host.querySelectorAll<HTMLElement>('.reading-flip-page');
        instance.loadFromHTML(pages);
        instanceRef.current = instance;

        const reportPosition = (physical: number) => {
          const opened = physical > 0;
          if (opened) callbackRef.current.onOpened();
          callbackRef.current.onPosition({
            atStart: physical <= 0,
            atEnd: physical >= backCoverIndex,
            opened,
          });
          if (opened) {
            callbackRef.current.onReadingIndex(
              readingIndexForPhysical(physical, count, finalVersoIndex),
            );
          }
        };

        instance.on('flip', (event) => {
          const physical = Number(event.data);
          if (Number.isFinite(physical)) reportPosition(physical);
        });

        reportPosition(initialStartPage);
        callbackRef.current.onReadyChange(true);
      } catch (error) {
        console.error('Failed to initialise journal page flip', error);
        if (!cancelled) {
          callbackRef.current.onReadyChange(false);
          callbackRef.current.onError();
        }
      }
    };

    void init();
    return () => {
      cancelled = true;
      instanceRef.current = null;
      try {
        instance?.destroy();
      } catch {
        // The library may already have detached its wrapper during unmount.
      }
    };
  }, [backCoverIndex, book, count, finalVersoIndex, flyleaf, initialStartPage]);

  if (!flyleaf || !count) return null;

  return (
    <div className="reading-pageflip-stage">
      <div ref={hostRef} className="reading-pageflip-book">
        <CoverShell book={book} assets={assets} side="front" />

        <div
          className={`reading-flip-page reading-flip-lining cover-inside texture-${material}`}
          style={{ '--cover-base': coverInfo(book.cover).colorway.color } as CSSProperties}
        >
          <span className="cover-inside-edge" aria-hidden="true" />
          <span className="cover-binding" aria-hidden="true" />
        </div>

        <div className="reading-flip-page reading-flip-paper-page">
          <Slice book={book} spread={flyleaf} assets={assets} side="right" flyleaf />
        </div>

        {body.flatMap((spread, index) => [
          <div className="reading-flip-page reading-flip-paper-page" key={`${spread.id}-left`}>
            <Slice book={book} spread={spread} assets={assets} side="left" pageIndex={index} />
          </div>,
          <div className="reading-flip-page reading-flip-paper-page" key={`${spread.id}-right`}>
            <Slice book={book} spread={spread} assets={assets} side="right" pageIndex={index} />
          </div>,
        ])}

        <div
          className={`reading-flip-page reading-flip-paper-page paper-${paper.style}`}
          style={{ '--paper': paper.color } as CSSProperties}
          data-physical-index={finalVersoIndex}
        >
          {blankLastSpread && (
            <Slice
              book={book}
              spread={blankLastSpread}
              assets={assets}
              side="left"
              pageIndex={Math.max(0, body.length - 1)}
            />
          )}
        </div>

        <div
          className={`reading-flip-page reading-flip-lining reading-flip-back-lining cover-inside texture-${material}`}
          style={{ '--cover-base': coverInfo(book.cover).colorway.color } as CSSProperties}
          data-physical-index={backLiningIndex}
        >
          <span className="cover-inside-edge" aria-hidden="true" />
          <span className="cover-binding" aria-hidden="true" />
        </div>

        <CoverShell book={book} assets={assets} side="back" />
      </div>

      <style>{`
        .reading-pageflip-stage {
          width: min(920px, 100%);
          min-height: min(68vh, 650px);
          display: grid;
          place-items: center;
          margin: 0 auto;
          perspective: 2200px;
        }
        .reading-pageflip-book {
          width: 100%;
          height: min(66vh, 620px);
          min-height: 470px;
        }
        .reading-pageflip-book .stf__parent {
          position: relative;
          display: block;
          box-sizing: border-box;
          transform: translateZ(0);
          touch-action: pan-y;
        }
        .reading-pageflip-book .stf__wrapper {
          position: relative;
          width: 100%;
          box-sizing: border-box;
        }
        .reading-pageflip-book .stf__parent canvas {
          position: absolute;
          width: 100%;
          height: 100%;
          left: 0;
          top: 0;
        }
        .reading-pageflip-book .stf__block {
          position: absolute;
          width: 100%;
          height: 100%;
          box-sizing: border-box;
          perspective: 2200px;
        }
        .reading-pageflip-book .stf__item {
          display: none;
          position: absolute;
          transform-style: preserve-3d;
        }
        .reading-pageflip-book .stf__outerShadow,
        .reading-pageflip-book .stf__innerShadow,
        .reading-pageflip-book .stf__hardShadow,
        .reading-pageflip-book .stf__hardInnerShadow {
          position: absolute;
          left: 0;
          top: 0;
        }
        .reading-pageflip-book .stf__hardShadow,
        .reading-pageflip-book .stf__hardInnerShadow {
          display: none !important;
          opacity: 0 !important;
          background: none !important;
          box-shadow: none !important;
        }
        .reading-flip-page {
          position: relative;
          overflow: hidden;
          box-sizing: border-box;
          background: var(--paper, #fffaf0);
          transform-style: preserve-3d;
        }
        .reading-flip-paper-page {
          border: 1px solid rgba(91, 77, 63, .1);
          box-shadow: inset 0 0 28px rgba(80, 66, 51, .035);
        }
        .reading-flip-slice {
          position: absolute;
          inset: 0;
          overflow: hidden;
        }
        .reading-flip-spread-canvas {
          position: absolute;
          top: 0;
          width: 200%;
          height: 100%;
        }
        .reading-flip-slice-left .reading-flip-spread-canvas { left: 0; }
        .reading-flip-slice-right .reading-flip-spread-canvas { left: -100%; }
        .reading-flip-spread-canvas > .turn-snapshot {
          width: 100%;
          height: 100%;
        }
        .reading-flip-cover {
          --reading-cover-depth: 8px;
          --reading-cover-half: 4px;
          overflow: visible !important;
          background: transparent !important;
          border: 0 !important;
          color: #f4eadc;
        }
        .reading-flip-cover-shell,
        .reading-flip-cover-face,
        .reading-flip-cover-edge {
          transform-style: preserve-3d;
        }
        .reading-flip-cover-shell {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }
        .reading-flip-cover-face {
          position: absolute;
          inset: 0;
          overflow: hidden;
          box-sizing: border-box;
          border: 1px solid rgba(44, 34, 26, .22);
          border-radius: 5px;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
        }
        .reading-flip-cover-outside {
          transform: translateZ(var(--reading-cover-half));
        }
        .reading-flip-cover-inside {
          transform: rotateY(180deg) translateZ(var(--reading-cover-half));
        }
        .reading-flip-cover-back .reading-flip-cover-outside {
          transform: rotateY(180deg) translateZ(var(--reading-cover-half));
        }
        .reading-flip-cover-back .reading-flip-cover-inside {
          transform: translateZ(var(--reading-cover-half));
        }
        .reading-flip-cover-edge {
          position: absolute;
          display: block;
          background: linear-gradient(90deg, #3d3026, #9a8064 45%, #5c4938);
          box-shadow: inset 0 0 0 1px rgba(0,0,0,.18);
        }
        .reading-flip-cover-edge-outer {
          top: 0;
          right: calc(var(--reading-cover-half) * -1);
          width: var(--reading-cover-depth);
          height: 100%;
          transform: rotateY(90deg);
        }
        .reading-flip-cover-edge-top,
        .reading-flip-cover-edge-bottom {
          left: 2px;
          width: calc(100% - 4px);
          height: var(--reading-cover-depth);
          transform: rotateX(90deg);
        }
        .reading-flip-cover-edge-top { top: calc(var(--reading-cover-half) * -1); }
        .reading-flip-cover-edge-bottom { bottom: calc(var(--reading-cover-half) * -1); }
        .reading-flip-lining {
          border: 1px solid rgba(45, 34, 26, .14);
          box-shadow:
            inset 12px 0 20px -16px rgba(28, 20, 15, .58),
            inset -1px 0 rgba(255,255,255,.07);
        }
        .reading-flip-back-lining {
          box-shadow:
            inset -12px 0 20px -16px rgba(28, 20, 15, .58),
            inset 1px 0 rgba(255,255,255,.07);
        }
        .reading-flip-back-mark {
          position: absolute;
          left: 50%;
          bottom: 9%;
          transform: translateX(-50%);
          font-size: 10px;
          letter-spacing: .18em;
          opacity: .46;
          white-space: nowrap;
        }
        .reading-flip-cover .cover-art {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        @media (max-width: 760px) {
          .reading-pageflip-stage { min-height: 520px; }
          .reading-pageflip-book { height: 520px; min-height: 420px; }
        }
      `}</style>
    </div>
  );
});

const ReadingPageFlip = memo(
  ReadingPageFlipBase,
  (previous, next) => previous.book === next.book && previous.assets === next.assets,
);

export default ReadingPageFlip;
