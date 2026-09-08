import ThreeTestClient from './ThreeTestClient';
import packageInfo from '@/package.json';

export default function ThreeTestPage() {
  return (
    <>
      <ThreeTestClient appVersion={packageInfo.version} />
      <style>{`
        /*
         * Keep colour separate from texture. The texture SVGs are now neutral,
         * transparent surface-detail maps, so these variables define the actual
         * cover palette without the texture asset tinting everything green/grey.
         */
        .three-test-cover-depth .pf-cover--leather {
          --pf-material-base: #986743 !important;
          --pf-cover-inside: #7b5239 !important;
          --pf-cover-edge: #4c3123 !important;
          --pf-material-texture-size: 320px 320px !important;
          --pf-material-texture-opacity: .64 !important;
          --pf-material-texture-blend: multiply !important;
          --pf-material-light:
            radial-gradient(circle at 24% 14%, rgba(255,235,204,.18), transparent 31%),
            linear-gradient(128deg, rgba(255,255,255,.05), transparent 44%, rgba(58,31,18,.10)) !important;
        }

        .three-test-cover-depth .pf-cover--fabric {
          --pf-material-base: #c7baa7 !important;
          --pf-cover-inside: #b7aa97 !important;
          --pf-cover-edge: #897765 !important;
          --pf-material-texture-size: 256px 256px !important;
          --pf-material-texture-opacity: .72 !important;
          --pf-material-texture-blend: multiply !important;
          --pf-material-light:
            linear-gradient(140deg, rgba(255,255,255,.14), transparent 44%, rgba(78,61,47,.055)) !important;
          color: #4b433b !important;
        }

        .three-test-cover-depth .pf-cover--soft-leather {
          --pf-material-base: #765d54 !important;
          --pf-cover-inside: #654d46 !important;
          --pf-cover-edge: #44312c !important;
          --pf-material-texture-size: 360px 360px !important;
          --pf-material-texture-opacity: .58 !important;
          --pf-material-texture-blend: soft-light !important;
          --pf-material-light:
            radial-gradient(ellipse at 27% 15%, rgba(255,238,225,.18), transparent 36%),
            linear-gradient(118deg, rgba(255,255,255,.06), transparent 48%, rgba(40,24,20,.08)) !important;
        }

        .three-test-cover-depth .pf-cover--kraft {
          --pf-material-base: #b28d61 !important;
          --pf-cover-inside: #a17d56 !important;
          --pf-cover-edge: #725236 !important;
          --pf-material-texture-size: 320px 320px !important;
          --pf-material-texture-opacity: .62 !important;
          --pf-material-texture-blend: multiply !important;
          --pf-material-light:
            linear-gradient(132deg, rgba(255,244,220,.12), transparent 48%, rgba(76,49,28,.06)) !important;
          color: #4b3b2f !important;
        }

        .three-test-cover-depth .pf-cover--hardboard {
          --pf-material-base: #9b8877 !important;
          --pf-cover-inside: #8e7b6b !important;
          --pf-cover-edge: #655446 !important;
          --pf-material-texture-size: 360px 360px !important;
          --pf-material-texture-opacity: .56 !important;
          --pf-material-texture-blend: multiply !important;
          --pf-material-light:
            linear-gradient(136deg, rgba(255,250,240,.09), transparent 50%, rgba(67,54,43,.055)) !important;
          color: #403a35 !important;
        }

        .three-test-cover-depth .pf-cover--fabric .pf-cover-edge,
        .three-test-cover-depth .pf-cover--fabric .pf-cover-shell::before {
          filter: none !important;
        }
      `}</style>
    </>
  );
}
