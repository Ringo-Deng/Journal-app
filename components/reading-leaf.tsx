'use client';
import type { CSSProperties } from 'react';
import { SpreadPreview } from './page-turn';
import { leafFrame } from '@/lib/page-motion';
import type { Book, Spread, Asset } from '@/lib/journal';
/* page-turn.tsx 反向 import 本文件形成循环依赖，不能在模块顶层读取
   SpreadPreview（TDZ 会让浏览器端模块初始化直接抛错）；
   它本身已是 memo 组件，JSX 渲染时经 live binding 取用即可。 */

export default function ReadingLeaf({
  book,
  from,
  to,
  fromFlyleaf = false,
  toFlyleaf = false,
  fromIndex,
  toIndex,
  assets,
  next,
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
  next: boolean;
  progress: number;
}) {
  const frame = leafFrame(progress, next, 10);
  const segments = frame.segments;
  return (
    <div
      className={`page-turn-layer reading-page-turn ${next ? 'next' : 'previous'}`}
      aria-hidden="true"
    >
      <div className={`turn-reveal ${next ? 'slice-right' : 'slice-left'}`}>
        <SpreadPreview book={book} spread={to} assets={assets} flyleaf={toFlyleaf} pageIndex={toIndex} />
        <div className="leaf-cast-shadow" style={{ opacity: frame.lift * 0.24 }} />
      </div>
      <div
        className="turn-moving curved-leaf"
        style={{ transform: `rotateY(${frame.rotation}deg)` }}
      >
        {segments.map((segment, i) => (
          <div
            key={i}
            className="leaf-strip"
            data-leaf-index={i}
            style={
              {
                width: `${100 / segments.length}%`,
                transform: `translate3d(${segment.x * 50}cqw,0,${segment.z * 50}cqw) rotateY(${segment.angle}deg)`,
                '--texture-width': '100cqw',
                '--front-visible': segment.frontVisible?'visible':'hidden',
                '--back-visible': segment.backVisible?'visible':'hidden',
              } as CSSProperties
            }
          >
            <div
              className="turn-face front"
              style={
                {
                  '--texture-left': `${-segment.front / segments.length * 50}cqw`,
                } as CSSProperties
              }
            >
              <SpreadPreview book={book} spread={from} assets={assets} flyleaf={fromFlyleaf} movingFlyleaf={fromFlyleaf} pageIndex={fromIndex} />
              <div
                className="leaf-light"
                style={{
                  opacity: frame.lift * (0.025 + (0.065 * i) / segments.length),
                }}
              />
            </div>
            <div
              className="turn-face back"
              style={
                { '--texture-left': `${-segment.back / segments.length * 50}cqw` } as CSSProperties
              }
            >
              <SpreadPreview book={book} spread={to} assets={assets} flyleaf={toFlyleaf} movingFlyleaf={toFlyleaf} pageIndex={toIndex} />
              <div
                className="leaf-light"
                style={{
                  opacity: frame.lift * (0.025 + 0.065 * (1 - i / segments.length)),
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
