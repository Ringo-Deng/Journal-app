'use client';

import { useEffect, useRef } from 'react';
import Book3DTest from '@/components/book3d/Book3DTest';

const THICKNESS_LABEL = '封面厚度';

export default function ThreeTestClient({ appVersion }: { appVersion: string }) {
  const scopeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scope = scopeRef.current;
    if (!scope) return;

    const findThicknessInput = () =>
      Array.from(scope.querySelectorAll<HTMLInputElement>('input[type="range"]')).find((input) =>
        input.closest('label')?.textContent?.includes(THICKNESS_LABEL),
      );

    const syncThickness = () => {
      const root = scope.querySelector<HTMLElement>('.pf-book-root');
      const input = findThicknessInput();
      if (!root || !input) return;

      // StPageFlip rewrites the hard-page element's entire inline cssText on every frame.
      // Keep the cover depth on the untouched book root so it survives the animation.
      root.style.setProperty('--pf-book-cover-thickness', `${input.value}px`);
    };

    const handleInput = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || target.type !== 'range') return;
      if (!target.closest('label')?.textContent?.includes(THICKNESS_LABEL)) return;
      syncThickness();
    };

    scope.addEventListener('input', handleInput);
    const observer = new MutationObserver(syncThickness);
    observer.observe(scope, { childList: true, subtree: true });
    const frame = requestAnimationFrame(syncThickness);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      scope.removeEventListener('input', handleInput);
    };
  }, []);

  return (
    <div ref={scopeRef} className="three-test-cover-depth">
      <Book3DTest appVersion={appVersion} />
      <style>{`
        /*
         * Hard pages are redrawn by StPageFlip with element.style.cssText = ...,
         * so page-local custom properties disappear as soon as the cover moves.
         * Inherit the thickness from .pf-book-root instead.
         */
        .three-test-cover-depth .pf-cover {
          --pf-cover-thickness: var(--pf-book-cover-thickness, 6px) !important;
        }

        .three-test-cover-depth .pf-cover,
        .three-test-cover-depth .pf-cover-shell,
        .three-test-cover-depth .pf-cover-face,
        .three-test-cover-depth .pf-cover-edge {
          transform-style: preserve-3d !important;
        }

        .three-test-cover-depth .pf-cover-edge,
        .three-test-cover-depth .pf-cover-shell::before {
          backface-visibility: visible !important;
          -webkit-backface-visibility: visible !important;
          background:
            linear-gradient(
              90deg,
              rgba(41, 29, 23, .98) 0 12%,
              rgba(190, 157, 111, .98) 12% 48%,
              rgba(225, 202, 165, .96) 48% 65%,
              rgba(151, 116, 78, .98) 65% 88%,
              rgba(48, 33, 25, .98) 88% 100%
            ) !important;
          box-shadow:
            inset 1px 0 rgba(255,255,255,.22),
            inset -1px 0 rgba(0,0,0,.28) !important;
        }

        /* Add the missing spine-side wall. The original shell only had the
           outer/top/bottom walls, which made an edge-on cover still read as a plane. */
        .three-test-cover-depth .pf-cover-shell::before {
          content: '';
          position: absolute;
          top: 0;
          left: calc(var(--pf-cover-thickness) / -2);
          width: var(--pf-cover-thickness);
          height: 100%;
          transform: rotateY(90deg);
          transform-origin: center center;
          pointer-events: none;
        }

        .three-test-cover-depth .pf-cover-edge--outer,
        .three-test-cover-depth .pf-cover-edge--top,
        .three-test-cover-depth .pf-cover-edge--bottom {
          opacity: 1 !important;
        }

        .three-test-cover-depth .pf-cover-face--outside {
          box-shadow:
            inset 0 0 0 1px rgba(255,255,255,.06),
            inset 0 0 0 2px rgba(0,0,0,.08) !important;
        }
      `}</style>
    </div>
  );
}
