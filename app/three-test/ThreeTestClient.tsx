'use client';

import { useLayoutEffect, useRef } from 'react';
import Book3DTest from '@/components/book3d/Book3DTest';

const THICKNESS_LABEL = '封面厚度';

export default function ThreeTestClient({ appVersion }: { appVersion: string }) {
  const scopeRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
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

    const ensureBackCoverStructure = () => {
      const root = scope.querySelector<HTMLElement>('.pf-book-root');
      if (!root || root.dataset.backStructureReady === 'true') return;

      const backCover = root.querySelector<HTMLElement>('.pf-cover--back');
      if (!backCover) return;

      const materialClass =
        Array.from(backCover.classList).find(
          (className) => className.startsWith('pf-cover--') && className !== 'pf-cover--back',
        ) ?? 'pf-cover--leather';

      // StPageFlip's showCover layout is:
      // [front cover], [1,2], [3,4] ... [back cover].
      // The final back cover must remain the last *single* spread so the engine can
      // actually flip it shut. Therefore the last normal spread must contain two
      // logical pages: the verso of the final loose sheet on the left, and the
      // pasted back-cover lining on the right.
      const finalVerso = document.createElement('div');
      finalVerso.className = 'pf-page pf-final-verso';
      finalVerso.innerHTML = `
        <div class="pf-page-inner">
          <div class="pf-eyebrow">LAST LEFT PAGE</div>
          <div class="pf-title">最后一张纸留在左边</div>
          <div class="pf-body">这一面仍然是纸张；右侧才是固定在硬封底上的封底内衬。</div>
          <div class="pf-footer"><span>拾光手帐</span><span>04</span></div>
        </div>
      `;

      const backLining = document.createElement('div');
      backLining.className = `pf-page pf-cover-lining-page pf-back-lining-page ${materialClass}`;
      backLining.innerHTML = `
        <div class="pf-cover-lining pf-cover-lining--page">
          <span>SHIGUANG JOURNAL</span>
          <span>封底内侧</span>
        </div>
      `;

      backCover.before(finalVerso, backLining);
      root.dataset.backStructureReady = 'true';
    };

    const syncControls = () => {
      ensureBackCoverStructure();
      syncThickness();
    };

    const handleInput = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || target.type !== 'range') return;
      if (!target.closest('label')?.textContent?.includes(THICKNESS_LABEL)) return;
      syncThickness();
    };

    scope.addEventListener('input', handleInput);
    const observer = new MutationObserver(syncControls);
    observer.observe(scope, { childList: true, subtree: true });
    const frame = requestAnimationFrame(syncControls);

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

        /* Add the missing spine-side wall. */
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

        /*
         * Texture maps live as repo assets under /public/textures/covers.
         * They are part of the rotating cover face, so grain/weave/fibres travel
         * with the hard cover instead of sitting as a screen-space overlay.
         */
        .three-test-cover-depth .pf-cover-face--outside {
          position: absolute;
          isolation: isolate;
          background-image: none !important;
          background-color: var(--pf-material-base, var(--pf-cover-base)) !important;
          box-shadow:
            inset 0 0 0 1px rgba(255,255,255,.06),
            inset 0 0 0 2px rgba(0,0,0,.08) !important;
        }

        .three-test-cover-depth .pf-cover-face--outside::before,
        .three-test-cover-depth .pf-cover-face--outside::after {
          content: '';
          position: absolute;
          inset: 0;
          pointer-events: none;
        }

        .three-test-cover-depth .pf-cover-face--outside::after {
          z-index: 1;
          background-image: var(--pf-material-texture);
          background-repeat: repeat;
          background-position: center;
          background-size: var(--pf-material-texture-size, 240px 240px);
          opacity: var(--pf-material-texture-opacity, .96);
          mix-blend-mode: var(--pf-material-texture-blend, normal);
        }

        .three-test-cover-depth .pf-cover-face--outside::before {
          z-index: 2;
          background: var(
            --pf-material-light,
            linear-gradient(135deg, rgba(255,255,255,.08), transparent 32%, rgba(0,0,0,.08))
          );
        }

        .three-test-cover-depth .pf-cover-content,
        .three-test-cover-depth .pf-back-inner {
          position: relative;
          z-index: 3;
        }

        /* Vegetable-tanned / full-grain leather: irregular pores + stronger grain. */
        .three-test-cover-depth .pf-cover--leather {
          --pf-material-base: #76523f;
          --pf-cover-inside: #684a39;
          --pf-cover-edge: #443026;
          --pf-material-texture: url('/textures/covers/leather-grain.svg');
          --pf-material-texture-size: 285px 285px;
          --pf-material-texture-opacity: .94;
          --pf-material-light:
            radial-gradient(circle at 24% 16%, rgba(255,239,214,.2), transparent 27%),
            linear-gradient(125deg, rgba(255,255,255,.05), transparent 36%, rgba(31,18,12,.11));
        }

        /* Woven cloth: visible warp/weft, matte surface, almost no specular sheen. */
        .three-test-cover-depth .pf-cover--fabric {
          --pf-material-base: #898276;
          --pf-cover-inside: #756f65;
          --pf-cover-edge: #514c45;
          --pf-material-texture: url('/textures/covers/fabric-weave.svg');
          --pf-material-texture-size: 128px 128px;
          --pf-material-texture-opacity: 1;
          --pf-material-light: linear-gradient(140deg, rgba(255,255,255,.07), transparent 42%, rgba(35,32,28,.08));
        }

        /* Existing kraft option now uses an actual paper-noise texture map. */
        .three-test-cover-depth .pf-cover--kraft {
          --pf-material-base: #a47a50;
          --pf-cover-inside: #936c47;
          --pf-cover-edge: #64472f;
          --pf-material-texture: url('/textures/covers/kraft-paper.svg');
          --pf-material-texture-size: 260px 260px;
          --pf-material-texture-opacity: .98;
          --pf-material-light: linear-gradient(130deg, rgba(255,244,220,.08), transparent 46%, rgba(70,43,24,.08));
        }

        /* Soft leather: broader wrinkles and smoother/highlighted grain. */
        .three-test-cover-depth .pf-cover--soft-leather {
          --pf-material-base: #765448;
          --pf-cover-inside: #65463d;
          --pf-cover-edge: #46312b;
          --pf-material-texture: url('/textures/covers/soft-leather.svg');
          --pf-material-texture-size: 320px 320px;
          --pf-material-texture-opacity: .96;
          --pf-material-light:
            radial-gradient(ellipse at 30% 14%, rgba(255,238,220,.24), transparent 34%),
            linear-gradient(118deg, rgba(255,255,255,.08), transparent 43%, rgba(38,22,17,.1));
        }

        /* Hard board: coarse fibres and a drier, flatter finish. */
        .three-test-cover-depth .pf-cover--hardboard {
          --pf-material-base: #a17a50;
          --pf-cover-inside: #94704b;
          --pf-cover-edge: #76583b;
          --pf-material-texture: url('/textures/covers/hardboard-fiber.svg');
          --pf-material-texture-size: 300px 300px;
          --pf-material-texture-opacity: 1;
          --pf-material-light: linear-gradient(135deg, rgba(255,245,220,.07), transparent 48%, rgba(72,47,28,.07));
        }

        .three-test-cover-depth .pf-cover--fabric .pf-cover-edge,
        .three-test-cover-depth .pf-cover--fabric .pf-cover-shell::before {
          filter: saturate(.68) brightness(.92);
        }

        .three-test-cover-depth .pf-cover--hardboard .pf-cover-edge,
        .three-test-cover-depth .pf-cover--hardboard .pf-cover-shell::before,
        .three-test-cover-depth .pf-cover--kraft .pf-cover-edge,
        .three-test-cover-depth .pf-cover--kraft .pf-cover-shell::before {
          background:
            linear-gradient(
              90deg,
              #5e412a 0 10%,
              #9f7851 10% 24%,
              #c19a68 24% 46%,
              #d5b786 46% 58%,
              #aa8157 58% 80%,
              #67482f 80% 100%
            ) !important;
        }
      `}</style>
    </div>
  );
}
