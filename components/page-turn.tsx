'use client';
import {pieceAppearance,pieceClasses,pieceFrameClass,PhotoArtwork,TapeArtwork,ColoredWriting} from './piece-appearance';
import ReadingLeaf from './reading-leaf';
import NotebookPaper from './notebook-paper';
import { pageInk } from '@/lib/journal';
import {pieceDisplayOpacity} from '@/lib/vellum-sheet';
import { isPieceHidden } from '@/lib/layer-meta';
import JournalDrawing from '@/components/journal-drawing';
/* oxlint-disable next/no-img-element -- Render the existing local page images on both sides of a turning sheet. */
import { memo, type CSSProperties } from 'react';
import {
  paperSettings,
  coverInfo,
  bookFormat,
  type Book,
  type Spread,
  type Asset,
} from '@/lib/journal';
function SpreadPreviewImpl({
  book,
  spread,
  assets,
  flyleaf = false,
  movingFlyleaf = false,
  pageIndex,
}: {
  book: Book;
  spread: Spread;
  assets: Asset[];
  flyleaf?: boolean;
  movingFlyleaf?: boolean;
  pageIndex?: number;
}) {
  const paper = flyleaf
    ? { ...paperSettings(book), style: 'blank' as const }
    : paperSettings(book, spread);
  const format = bookFormat(book);
  const dark =
    parseInt(paper.color.slice(1, 3), 16) * 0.299 +
      parseInt(paper.color.slice(3, 5), 16) * 0.587 +
      parseInt(paper.color.slice(5, 7), 16) * 0.114 <
    125;
  const cover = coverInfo(book.cover);
  return (
    <div
      className={`turn-snapshot paper-${paper.style} notebook-${cover.material.id} ${flyleaf ? 'flyleaf-sheet' : ''} ${movingFlyleaf ? 'flyleaf-moving' : ''}`}
      style={
        {
          '--paper': paper.color,
          '--ink': dark ? '#f5f5ed' : '#343b34',
          '--ruling': dark ? '#ffffff35' : '#47556925',
          '--spread-ratio': format.ratio,
          '--book-scale': format.scale,
        } as CSSProperties
      }
    >
      {flyleaf ? (
        <>
          {!movingFlyleaf && (
            <div
              className={`cover-inside texture-${cover.material.id}`}
              style={{ '--cover-base': cover.colorway.color } as CSSProperties}
            >
              <span className="cover-inside-edge" aria-hidden="true" />
              <span className="cover-binding" aria-hidden="true" />
            </div>
          )}
          <div className="paper-page right-paper">
            <span className="flyleaf-page-layer flyleaf-page-layer-back" aria-hidden="true" />
            <span className="flyleaf-page-layer flyleaf-page-layer-mid" aria-hidden="true" />
            <div className="paper-ruling" />
          </div>
        </>
      ) : (
        <>
          <NotebookPaper book={book} spread={spread} pageIndex={pageIndex ?? 0}/>
        </>
      )}
      <div className="paper-grain" />
      {spread.elements.filter((p)=>!isPieceHidden(p)).map((p) => (
        <div
          key={p.id}
          className={`piece piece-${p.kind} ${p.doodleMotif ? 'hand-doodle' : ''} ${p.role || ''} ${pieceFrameClass(p)} ${p.stretch ? 'piece-stretched' : ''} ${pieceClasses(p)}`}
          style={{
            ...pieceAppearance(p),
            left: p.x + '%',
            top: p.y + '%',
            width: p.w + '%',
            transform: `rotate(${p.rotation}deg)`,
            fontSize: `${(p.fontSize || 18) / 10}cqw`,

            opacity:pieceDisplayOpacity(p),color:p.color||(!flyleaf?pageInk(book,spread,p.x>=50?'right':'left'):undefined),height:p.h?`${p.h}%`:p.kind==='doodle'?'15%':undefined,fontFamily:p.fontFamily==='serif'?'Georgia, Songti SC, serif':p.fontFamily==='sans'?'PingFang SC, sans-serif':undefined,
          }}
        >
          {p.kind === 'text' ? (
            <div className="piece-text"><ColoredWriting piece={p}/></div>
          ) : p.kind==='photo' ? <PhotoArtwork piece={p}/> : p.material==='tape' ? <TapeArtwork piece={p}/> : p.kind==='doodle' ? (<JournalDrawing piece={p}/>) : (
            <img
              src={
                p.kind === 'asset'
                  ? assets.find((a) => a.id === p.assetId)?.src || p.src
                  : p.src
              }
              alt=""
              draggable={false}
              style={{ objectPosition: `${p.crop ?? 50}% 50%`, transform:`scale(${p.flipX?-1:1},${p.flipY?-1:1})` }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
/* 跨页快照在翻页期间属性不变，memo 避免跟随父组件反复重渲染。 */
export const SpreadPreview = memo(SpreadPreviewImpl);
export default function PageTurn({
  book,
  from,
  to,
  fromFlyleaf = false,
  toFlyleaf = false,
  fromIndex,
  toIndex,
  assets,
  direction,
  progress,
}: {
  book: Book;
  from: Spread;
  to: Spread;
  fromFlyleaf?: boolean;
  toFlyleaf?: boolean;
  fromIndex?: number;
  toIndex?: number;
  assets: Asset[];
  direction: string;
  progress: number;
  settling: boolean;
}) {
  return <ReadingLeaf book={book} from={from} to={to} fromFlyleaf={fromFlyleaf} toFlyleaf={toFlyleaf} fromIndex={fromIndex} toIndex={toIndex} assets={assets} next={direction==='next'} progress={progress}/>;
}
