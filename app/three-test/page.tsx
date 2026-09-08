import ThreeTestClient from './ThreeTestClient';
import packageInfo from '@/package.json';

export default function ThreeTestPage() {
  return (
    <>
      <ThreeTestClient appVersion={packageInfo.version} />
      <style>{`
        /*
         * Material pass v2: keep colour, surface texture, sheen, print treatment
         * and the visible cover edge tied to the same material. This prevents a
         * convincing front texture from being undermined by a generic brown edge.
         */
        .three-test-cover-depth .pf-cover {
          --pf-edge-dark: #4c3123;
          --pf-edge-mid: #7d5438;
          --pf-edge-light: #bd8f69;
          --pf-material-texture-filter: none;
          --pf-cover-content-wash: transparent;
          --pf-inside-ink: rgba(255, 248, 236, .68);
          --pf-face-shadow:
            inset 0 0 0 1px rgba(255,255,255,.055),
            inset 0 0 0 2px rgba(0,0,0,.075),
            inset 0 0 18px rgba(51,35,24,.07);
        }

        .three-test-cover-depth .pf-cover-edge,
        .three-test-cover-depth .pf-cover-shell::before {
          background:
            linear-gradient(
              90deg,
              var(--pf-edge-dark) 0 11%,
              var(--pf-edge-mid) 11% 42%,
              var(--pf-edge-light) 42% 58%,
              var(--pf-edge-mid) 58% 89%,
              var(--pf-edge-dark) 89% 100%
            ) !important;
          filter: none !important;
        }

        .three-test-cover-depth .pf-cover-face--outside {
          border-color: rgba(58, 44, 33, .18) !important;
          border-radius: 5px !important;
          box-shadow: var(--pf-face-shadow) !important;
        }

        .three-test-cover-depth .pf-cover-face--outside::after {
          filter: var(--pf-material-texture-filter) !important;
          background-position: 13px 9px !important;
        }

        .three-test-cover-depth .pf-cover--back .pf-cover-face--outside::after {
          background-position: -29px 17px !important;
        }

        /*
         * The inside of the cover is not a white paper page. StPageFlip needs a
         * logical left page after opening, so that page is rendered as the pasted
         * cover lining and uses the same material family as the shell. The real
         * paper begins on the right-hand page after it.
         */
        .three-test-cover-depth .pf-cover-face--inside,
        .three-test-cover-depth .pf-cover-lining-page {
          background-color: var(--pf-cover-inside) !important;
          background-image:
            linear-gradient(98deg, rgba(0,0,0,.11), transparent 12%, transparent 84%, rgba(255,255,255,.045)),
            var(--pf-material-texture) !important;
          background-size:
            100% 100%,
            var(--pf-material-texture-size, 260px 260px) !important;
          background-position:
            center,
            -23px 17px !important;
          background-repeat: no-repeat, repeat !important;
          background-blend-mode: multiply, soft-light !important;
          color: var(--pf-inside-ink) !important;
          box-shadow:
            inset 11px 0 18px -14px rgba(30,22,17,.55),
            inset -1px 0 rgba(255,255,255,.08),
            inset 0 0 0 1px rgba(45,34,26,.12) !important;
        }

        .three-test-cover-depth .pf-cover-lining-page .pf-cover-lining--page {
          border: 0 !important;
          opacity: .62 !important;
          text-shadow: 0 1px 0 rgba(255,255,255,.06) !important;
        }

        .three-test-cover-depth .pf-cover-lining-page::after {
          content: '';
          position: absolute;
          inset: 4.5%;
          border: 1px solid rgba(255,255,255,.055);
          border-radius: 3px;
          pointer-events: none;
        }

        .three-test-cover-depth .pf-cover-content {
          background: var(--pf-cover-content-wash) !important;
        }

        .three-test-cover-depth .pf-kicker,
        .three-test-cover-depth .pf-cover-title,
        .three-test-cover-depth .pf-cover-subtitle,
        .three-test-cover-depth .pf-footnote,
        .three-test-cover-depth .pf-back-inner {
          text-rendering: geometricPrecision;
          -webkit-font-smoothing: antialiased;
        }

        .three-test-cover-depth .pf-footnote {
          opacity: .42 !important;
        }

        /* Full-grain leather: warm cognac, low-frequency grain and a soft satin sheen. */
        .three-test-cover-depth .pf-cover--leather {
          --pf-material-base: #95613f !important;
          --pf-cover-inside: #77503a !important;
          --pf-cover-edge: #4c3123 !important;
          --pf-inside-ink: rgba(245, 226, 204, .66);
          --pf-edge-dark: #3f281d;
          --pf-edge-mid: #765038;
          --pf-edge-light: #b57f59;
          --pf-material-texture-size: 360px 360px !important;
          --pf-material-texture-opacity: .52 !important;
          --pf-material-texture-blend: multiply !important;
          --pf-material-texture-filter: contrast(.92) saturate(.72);
          --pf-material-light:
            radial-gradient(circle at 22% 13%, rgba(255,226,188,.17), transparent 32%),
            linear-gradient(128deg, rgba(255,255,255,.045), transparent 46%, rgba(52,29,18,.105)) !important;
          --pf-cover-content-wash:
            linear-gradient(135deg, rgba(255,255,255,.025), transparent 36%, rgba(46,26,17,.035));
          --pf-face-shadow:
            inset 0 0 0 1px rgba(255,239,216,.05),
            inset 0 0 0 2px rgba(55,31,20,.10),
            inset 0 0 24px rgba(52,28,17,.075);
          color: #f3e5d2 !important;
        }

        .three-test-cover-depth .pf-cover--leather .pf-kicker,
        .three-test-cover-depth .pf-cover--leather .pf-cover-title,
        .three-test-cover-depth .pf-cover--leather .pf-cover-subtitle,
        .three-test-cover-depth .pf-cover--leather .pf-footnote {
          text-shadow:
            0 1px 0 rgba(255,255,255,.11),
            0 -1px 0 rgba(54,31,20,.24) !important;
        }

        /* Linen cloth: oatmeal base, larger quieter weave, fully matte surface. */
        .three-test-cover-depth .pf-cover--fabric {
          --pf-material-base: #d2c5b2 !important;
          --pf-cover-inside: #c2b49f !important;
          --pf-cover-edge: #94836f !important;
          --pf-inside-ink: rgba(76, 66, 57, .72);
          --pf-edge-dark: #827361;
          --pf-edge-mid: #b7a894;
          --pf-edge-light: #ddd2c1;
          --pf-material-texture-size: 360px 360px !important;
          --pf-material-texture-opacity: .56 !important;
          --pf-material-texture-blend: multiply !important;
          --pf-material-texture-filter: contrast(.82) saturate(.38);
          --pf-material-light:
            linear-gradient(142deg, rgba(255,255,255,.115), transparent 46%, rgba(75,61,48,.045)) !important;
          --pf-cover-content-wash:
            linear-gradient(140deg, rgba(255,255,255,.025), transparent 58%, rgba(77,65,53,.022));
          --pf-face-shadow:
            inset 0 0 0 1px rgba(255,255,255,.12),
            inset 0 0 0 2px rgba(80,67,54,.07),
            inset 0 0 16px rgba(85,69,53,.035);
          color: #4d453d !important;
        }

        .three-test-cover-depth .pf-cover--fabric .pf-kicker,
        .three-test-cover-depth .pf-cover--fabric .pf-cover-title,
        .three-test-cover-depth .pf-cover--fabric .pf-cover-subtitle,
        .three-test-cover-depth .pf-cover--fabric .pf-footnote {
          color: #50473e !important;
          text-shadow:
            0 1px 0 rgba(255,255,255,.30),
            0 -1px 0 rgba(89,72,55,.09) !important;
        }

        /* Soft leather: smoother taupe leather with broader folds and gentler highlights. */
        .three-test-cover-depth .pf-cover--soft-leather {
          --pf-material-base: #756058 !important;
          --pf-cover-inside: #635049 !important;
          --pf-cover-edge: #47352f !important;
          --pf-inside-ink: rgba(238, 225, 218, .66);
          --pf-edge-dark: #3e2f2a;
          --pf-edge-mid: #685048;
          --pf-edge-light: #9d7d72;
          --pf-material-texture-size: 420px 420px !important;
          --pf-material-texture-opacity: .47 !important;
          --pf-material-texture-blend: soft-light !important;
          --pf-material-texture-filter: contrast(.9) saturate(.58);
          --pf-material-light:
            radial-gradient(ellipse at 27% 14%, rgba(255,235,222,.16), transparent 38%),
            linear-gradient(118deg, rgba(255,255,255,.045), transparent 50%, rgba(40,24,20,.075)) !important;
          --pf-cover-content-wash:
            radial-gradient(ellipse at 32% 22%, rgba(255,255,255,.025), transparent 48%);
          --pf-face-shadow:
            inset 0 0 0 1px rgba(255,245,236,.045),
            inset 0 0 0 2px rgba(40,26,22,.08),
            inset 0 0 22px rgba(35,22,18,.055);
          color: #eee5df !important;
        }

        .three-test-cover-depth .pf-cover--soft-leather .pf-kicker,
        .three-test-cover-depth .pf-cover--soft-leather .pf-cover-title,
        .three-test-cover-depth .pf-cover--soft-leather .pf-cover-subtitle,
        .three-test-cover-depth .pf-cover--soft-leather .pf-footnote {
          text-shadow:
            0 1px 0 rgba(255,255,255,.08),
            0 -1px 0 rgba(28,18,15,.22) !important;
        }

        /* Kraft: dry paper fibres and dark printed typography, no glossy highlight. */
        .three-test-cover-depth .pf-cover--kraft {
          --pf-material-base: #b38f66 !important;
          --pf-cover-inside: #a27f5b !important;
          --pf-cover-edge: #76563a !important;
          --pf-inside-ink: rgba(67, 48, 35, .75);
          --pf-edge-dark: #694c33;
          --pf-edge-mid: #9f7b55;
          --pf-edge-light: #cfab7d;
          --pf-material-texture-size: 380px 380px !important;
          --pf-material-texture-opacity: .47 !important;
          --pf-material-texture-blend: multiply !important;
          --pf-material-texture-filter: contrast(.83) saturate(.35);
          --pf-material-light:
            linear-gradient(132deg, rgba(255,244,220,.075), transparent 51%, rgba(76,49,28,.045)) !important;
          --pf-cover-content-wash: transparent;
          --pf-face-shadow:
            inset 0 0 0 1px rgba(255,245,225,.08),
            inset 0 0 0 2px rgba(78,53,34,.065),
            inset 0 0 14px rgba(82,56,36,.035);
          color: #49382c !important;
        }

        .three-test-cover-depth .pf-cover--kraft .pf-kicker,
        .three-test-cover-depth .pf-cover--kraft .pf-cover-title,
        .three-test-cover-depth .pf-cover--kraft .pf-cover-subtitle,
        .three-test-cover-depth .pf-cover--kraft .pf-footnote {
          color: #49382c !important;
          text-shadow: 0 1px 0 rgba(255,240,211,.12) !important;
        }

        /* Hard board: muted greige board with visible coarse fibres and exposed board core. */
        .three-test-cover-depth .pf-cover--hardboard {
          --pf-material-base: #a59482 !important;
          --pf-cover-inside: #968575 !important;
          --pf-cover-edge: #6e5c4c !important;
          --pf-inside-ink: rgba(62, 54, 48, .72);
          --pf-edge-dark: #655344;
          --pf-edge-mid: #8d7661;
          --pf-edge-light: #bba58b;
          --pf-material-texture-size: 420px 420px !important;
          --pf-material-texture-opacity: .46 !important;
          --pf-material-texture-blend: multiply !important;
          --pf-material-texture-filter: contrast(.86) saturate(.22);
          --pf-material-light:
            linear-gradient(136deg, rgba(255,250,240,.06), transparent 53%, rgba(67,54,43,.04)) !important;
          --pf-cover-content-wash: transparent;
          --pf-face-shadow:
            inset 0 0 0 1px rgba(255,249,239,.06),
            inset 0 0 0 2px rgba(68,55,44,.06),
            inset 0 0 12px rgba(68,53,42,.03);
          color: #403831 !important;
        }

        .three-test-cover-depth .pf-cover--hardboard .pf-kicker,
        .three-test-cover-depth .pf-cover--hardboard .pf-cover-title,
        .three-test-cover-depth .pf-cover--hardboard .pf-cover-subtitle,
        .three-test-cover-depth .pf-cover--hardboard .pf-footnote {
          color: #403831 !important;
          text-shadow: 0 1px 0 rgba(255,255,255,.14) !important;
        }
      `}</style>
    </>
  );
}
