'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { BookOpen, LayoutGrid, ChevronLeft, ChevronRight } from 'lucide-react';
import { SpreadPreview } from './page-turn';
import ReadingPageFlip, { type ReadingPageFlipHandle } from './reading-pageflip';
import { bookFormat, coverInfo, type Asset, type Book } from '@/lib/journal';

type PositionState = {
  atStart: boolean;
  atEnd: boolean;
  opened: boolean;
};

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
  const [opened, setOpened] = useState(false);
  const [engineReady, setEngineReady] = useState(false);
  const [engineFailed, setEngineFailed] = useState(false);
  const [position, setPosition] = useState<PositionState>({
    atStart: true,
    atEnd: false,
    opened: false,
  });
  const pageFlip = useRef<ReadingPageFlipHandle>(null);

  const offset = book.flyleaf ? 1 : 0;
  const sheets = [
    ...(book.flyleaf ? [{ spread: book.flyleaf, flyleaf: true }] : []),
    ...book.spreads.map((spread) => ({ spread, flyleaf: false })),
  ];
  const count = sheets.length;
  const current = Math.max(0, Math.min(page, count - 1));
  const cover = coverInfo(book.cover);
  const coverAsset = book.coverAsset
    ? assets.find((asset) => asset.originalSrc === book.coverAsset)?.src || book.coverAsset
    : '';

  useEffect(() => {
    setGrid(false);
    setOpened(false);
    setEngineReady(false);
    setEngineFailed(false);
    setPosition({ atStart: true, atEnd: false, opened: false });
  }, [book.id]);

  const fallbackMove = useCallback(
    (next: number) => {
      if (next < 0 || next >= count || next === current) return;
      onSelect(next);
    },
    [count, current, onSelect],
  );

  const previous = useCallback(() => {
    if (engineFailed) fallbackMove(current - 1);
    else pageFlip.current?.prev();
  }, [current, engineFailed, fallbackMove]);

  const next = useCallback(() => {
    if (engineFailed) fallbackMove(current + 1);
    else pageFlip.current?.next();
  }, [current, engineFailed, fallbackMove]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
        target.isContentEditable ||
        grid
      )
        return;
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === 'ArrowRight') next();
      else previous();
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [grid, next, previous]);

  if (!count) {
    return (
      <section
        className={`reading-deck notebook-${book.cover} deck-large viewer-cover`}
        aria-label="手帐连续翻阅"
        style={
          {
            '--spread-ratio': bookFormat(book).ratio,
            '--book-scale': bookFormat(book).scale,
            '--cover-base': cover.colorway.color,
          } as CSSProperties
        }
      >
        <header className="deck-heading">
          <h1>{book.title || '拾光集'}</h1>
        </header>
        <p className="deck-empty">这本手帐还没有内页，去工作台添加第一篇记录吧。</p>
      </section>
    );
  }

  return (
    <section
      className={`reading-deck notebook-${book.cover} deck-large ${opened ? 'viewer-reading' : 'viewer-cover'} ${grid ? 'deck-grid-mode' : ''}`}
      aria-label="手帐连续翻阅"
      style={
        {
          '--spread-ratio': bookFormat(book).ratio,
          '--book-scale': bookFormat(book).scale,
          '--cover-base': cover.colorway.color,
        } as CSSProperties
      }
    >
      <fieldset className="deck-view-switch" aria-label="欣赏方式">
        <button
          aria-label="连续翻阅"
          aria-pressed={!grid}
          onClick={() => setGrid(false)}
        >
          <BookOpen />
        </button>
        <button
          aria-label="全部跨页"
          aria-pressed={grid}
          disabled={!opened}
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

      {grid ? (
        <div className="deck-grid">
          {sheets.map((sheet, index) => (
            <button
              className="deck-thumbnail"
              key={sheet.spread.id}
              aria-label={sheet.flyleaf ? '打开扉页' : `打开第 ${index - offset + 1} 个跨页`}
              onClick={() => {
                onSelect(index);
                setOpened(true);
                setPosition({ atStart: false, atEnd: false, opened: true });
                setGrid(false);
              }}
            >
              <div className="deck-thumbnail-paper">
                <SpreadPreview
                  book={book}
                  spread={sheet.spread}
                  assets={assets}
                  flyleaf={sheet.flyleaf}
                  pageIndex={sheet.flyleaf ? undefined : index - offset}
                />
              </div>
              <span>{sheet.flyleaf ? '扉页' : `第 ${index - offset + 1} 个跨页`}</span>
            </button>
          ))}
        </div>
      ) : engineFailed ? (
        <div className="reading-static-fallback">
          {!opened ? (
            <button
              className={`reading-static-cover texture-${cover.material.id}`}
              style={{ '--cover-base': cover.colorway.color } as CSSProperties}
              aria-label="打开手帐封面"
              onClick={() => {
                setOpened(true);
                setPosition({ atStart: false, atEnd: false, opened: true });
                onSelect(0);
              }}
            >
              {!coverAsset && (
                <span className="cover-title-stamp">
                  {book.title || '拾光集'}
                  <i>SHIGUANG JOURNAL</i>
                </span>
              )}
              {coverAsset && <img className="cover-art" src={coverAsset} alt="封面装饰" />}
            </button>
          ) : (
            <div className="reading-static-spread">
              <SpreadPreview
                book={book}
                spread={sheets[current].spread}
                assets={assets}
                flyleaf={sheets[current].flyleaf}
                pageIndex={sheets[current].flyleaf ? undefined : current - offset}
              />
            </div>
          )}
        </div>
      ) : (
        <ReadingPageFlip
          ref={pageFlip}
          book={book}
          assets={assets}
          readingIndex={current}
          startOpen={opened}
          onReadingIndex={onSelect}
          onReadyChange={setEngineReady}
          onOpened={() => setOpened(true)}
          onPosition={(state) => {
            setPosition(state);
            if (state.opened) setOpened(true);
          }}
          onError={() => setEngineFailed(true)}
        />
      )}

      {!grid && (
        <footer className="deck-controls">
          <button
            aria-label="上一页"
            disabled={
              engineFailed
                ? !opened || current === 0
                : !engineReady || position.atStart
            }
            onClick={previous}
          >
            <ChevronLeft />
          </button>
          <span aria-live="polite">
            {!opened
              ? '点击封面打开'
              : engineFailed
                ? `${current + 1} / ${count} · 简化模式`
                : `${current + 1} / ${count}`}
          </span>
          <button
            aria-label="下一页"
            disabled={
              engineFailed
                ? !opened || current === count - 1
                : !engineReady || position.atEnd
            }
            onClick={next}
          >
            <ChevronRight />
          </button>
        </footer>
      )}

      <style>{`
        .reading-static-fallback {
          min-height: min(68vh, 650px);
          display: grid;
          place-items: center;
          padding: 24px;
        }
        .reading-static-cover {
          width: min(360px, 70vw);
          aspect-ratio: calc(var(--spread-ratio) / 2);
          position: relative;
          overflow: hidden;
          border: 0;
          border-radius: 5px;
          box-shadow: 0 24px 50px rgba(48, 38, 28, .2);
          cursor: pointer;
        }
        .reading-static-cover .cover-art {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .reading-static-spread {
          width: min(860px, 92vw);
          aspect-ratio: var(--spread-ratio);
          overflow: hidden;
          box-shadow: 0 22px 48px rgba(48, 38, 28, .16);
        }
        .reading-static-spread > .turn-snapshot {
          width: 100%;
          height: 100%;
        }
      `}</style>
    </section>
  );
}
