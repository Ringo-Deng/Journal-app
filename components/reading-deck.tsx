"use client";

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { BookOpen, LayoutGrid } from "lucide-react";
import ReadingJpgImage from "./reading-jpg-image";
import type { ReadingBook3DHandle } from "./reading-book3d";
const ReadingBook3D = lazy(() => import("./reading-book3d"));
import { bookFormat, coverInfo, type Asset, type Book } from "@/lib/journal";

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
  const [engineFailed, setEngineFailed] = useState(false);
  const [readerError, setReaderError] = useState("");
  const pageFlip = useRef<ReadingBook3DHandle>(null);

  const offset = book.flyleaf ? 1 : 0;
  const sheets = [
    ...(book.flyleaf ? [{ spread: book.flyleaf, flyleaf: true }] : []),
    ...book.spreads.map((spread) => ({ spread, flyleaf: false })),
  ];
  const count = sheets.length;
  const current = Math.max(0, Math.min(page, count - 1));
  const cover = coverInfo(book.cover);

  useEffect(() => {
    setGrid(false);
    setOpened(false);
    setEngineFailed(false);
    setReaderError("");
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
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
        target.isContentEditable ||
        grid
      )
        return;
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === "ArrowRight") next();
      else previous();
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [grid, next, previous]);

  if (!count) {
    return (
      <section
        className={`reading-deck notebook-${book.cover} deck-large viewer-cover`}
        aria-label="手帐连续翻阅"
        style={
          {
            "--spread-ratio": bookFormat(book).ratio,
            "--book-scale": bookFormat(book).scale,
            "--cover-base": cover.colorway.color,
          } as CSSProperties
        }
      >
        <header className="deck-heading">
          <h1>{book.title || "拾光集"}</h1>
        </header>
        <p className="deck-empty">这本手帐还没有内页，去工作台添加第一篇记录吧。</p>
      </section>
    );
  }

  return (
    <section
      className={`reading-deck notebook-${book.cover} deck-large ${opened ? "viewer-reading" : "viewer-cover"} ${grid ? "deck-grid-mode" : ""}`}
      aria-label="手帐连续翻阅"
      style={
        {
          "--spread-ratio": bookFormat(book).ratio,
          "--book-scale": bookFormat(book).scale,
          "--cover-base": cover.colorway.color,
        } as CSSProperties
      }
    >
      <fieldset className="deck-view-switch" aria-label="欣赏方式">
        <button aria-label="连续翻阅" aria-pressed={!grid} onClick={() => setGrid(false)}>
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
        <h1>{book.title || "拾光集"}</h1>
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
              aria-label={sheet.flyleaf ? "打开扉页" : `打开第 ${index - offset + 1} 个跨页`}
              onClick={() => {
                onSelect(index);
                setOpened(true);
                setGrid(false);
              }}
            >
              <div className="deck-thumbnail-paper">
                <ReadingJpgImage
                  book={book}
                  assets={assets}
                  index={index}
                  alt={sheet.flyleaf ? "扉页" : `第 ${index - offset + 1} 个跨页`}
                />
              </div>
              <span>{sheet.flyleaf ? "扉页" : `第 ${index - offset + 1} 个跨页`}</span>
            </button>
          ))}
        </div>
      ) : engineFailed ? (
        <div className="reading-static-fallback">
          <div className="reading-fallback-notice" role="status">
            <p>3D 阅读暂时不可用，已切换为图片阅读。</p>
            {readerError && (
              <details>
                <summary>查看原因</summary>
                <p>{readerError}</p>
              </details>
            )}
            <button
              onClick={() => {
                setEngineFailed(false);
                setReaderError("");
              }}
            >
              重试 3D 阅读
            </button>
          </div>
          {!opened ? (
            <button
              className={`reading-static-cover texture-${cover.material.id}`}
              style={{ "--cover-base": cover.colorway.color } as CSSProperties}
              aria-label="打开手帐封面"
              onClick={() => {
                setOpened(true);
                onSelect(0);
              }}
            >
              <ReadingJpgImage book={book} assets={assets} index={null} alt="手帐封面" />
            </button>
          ) : (
            <div className="reading-static-spread">
              <ReadingJpgImage book={book} assets={assets} index={current} alt="手帐跨页" />
            </div>
          )}
        </div>
      ) : (
        <Suspense fallback={<p role="status">正在打开手帐…</p>}>
          <ReadingBook3D
            key={book.id}
            ref={pageFlip}
            book={book}
            assets={assets}
            readingIndex={current}
            startOpen={opened}
            onReadingIndex={onSelect}
            onPosition={(state) => {
              if (state.opened) setOpened(true);
            }}
            onError={(error) => {
              setReaderError(error instanceof Error ? error.message : "浏览器未能保持 3D 显示。");
              setEngineFailed(true);
            }}
          />
        </Suspense>
      )}

      <style>{`
        .reading-fallback-notice { text-align: center; font-size: 13px; color: #626b59; padding: 0 16px 18px; }
        .reading-fallback-notice button { padding: 8px 14px; border: 1px solid #c3cbb9; border-radius: 6px; }
        .reading-fallback-notice details { max-width: 600px; overflow-wrap: anywhere; margin-bottom: 12px; }
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
