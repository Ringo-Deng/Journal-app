'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

const PAGE_FLIP_SOURCES = [
  'https://cdn.jsdelivr.net/npm/page-flip@2.0.7/dist/js/page-flip.browser.js',
  'https://unpkg.com/page-flip@2.0.7/dist/js/page-flip.browser.js',
] as const;

type PageFlipEvent = {
  data: number | string;
};

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

type PageFlipWindow = Window & {
  St?: {
    PageFlip?: PageFlipConstructor;
  };
};

type CoverMaterial = 'leather' | 'fabric' | 'kraft' | 'soft-leather' | 'hardboard';

type DebugSettings = {
  flippingTime: number;
  maxShadowOpacity: number;
  pageWidth: number;
  pageHeight: number;
  showPageCorners: boolean;
  hardCover: boolean;
  coverThickness: number;
  coverMaterial: CoverMaterial;
};

const DEFAULT_SETTINGS: DebugSettings = {
  flippingTime: 900,
  maxShadowOpacity: 0.42,
  pageWidth: 380,
  pageHeight: 520,
  showPageCorners: true,
  hardCover: true,
  coverThickness: 6,
  coverMaterial: 'leather',
};

const PRESETS: Array<{ label: string; patch: Partial<DebugSettings> }> = [
  { label: '轻柔', patch: { flippingTime: 1050, maxShadowOpacity: 0.3 } },
  { label: '利落', patch: { flippingTime: 680, maxShadowOpacity: 0.36 } },
  { label: '慢翻', patch: { flippingTime: 1320, maxShadowOpacity: 0.26 } },
];

function getPageFlipConstructor(): PageFlipConstructor | null {
  return (window as PageFlipWindow).St?.PageFlip ?? null;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-page-flip-src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), {
        once: true,
      });
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.pageFlipSrc = src;
    script.addEventListener(
      'load',
      () => {
        script.dataset.loaded = 'true';
        resolve();
      },
      { once: true },
    );
    script.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), {
      once: true,
    });
    document.head.appendChild(script);
  });
}

async function loadPageFlip(): Promise<PageFlipConstructor> {
  const existing = getPageFlipConstructor();
  if (existing) return existing;

  let lastError: unknown = null;
  for (const src of PAGE_FLIP_SOURCES) {
    try {
      await loadScript(src);
      const constructor = getPageFlipConstructor();
      if (constructor) return constructor;
      lastError = new Error(`St.PageFlip missing after loading ${src}`);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error('Unable to load StPageFlip');
}

function coverShellMarkup(side: 'front' | 'back', settings: DebugSettings): string {
  const hard = settings.hardCover ? ' data-density="hard"' : '';
  const materialClass = `pf-cover--${settings.coverMaterial}`;
  const thicknessStyle = ` style="--pf-cover-thickness: ${settings.coverThickness}px"`;

  if (side === 'front') {
    return `
      <div class="pf-page pf-cover pf-cover--front ${materialClass}"${thicknessStyle}${hard}>
        <div class="pf-cover-shell">
          <div class="pf-cover-face pf-cover-face--outside">
            <div class="pf-cover-content">
              <div class="pf-kicker">SHIGUANG JOURNAL</div>
              <div>
                <div class="pf-cover-title">拾光</div>
                <div class="pf-cover-subtitle">点击封面打开</div>
              </div>
              <div class="pf-footnote">有厚度的封面壳层实验</div>
            </div>
          </div>
          <div class="pf-cover-face pf-cover-face--inside">
            <div class="pf-cover-lining"><span>INNER COVER</span><span>封面内衬</span></div>
          </div>
          <div class="pf-cover-edge pf-cover-edge--outer"></div>
          <div class="pf-cover-edge pf-cover-edge--top"></div>
          <div class="pf-cover-edge pf-cover-edge--bottom"></div>
        </div>
      </div>
    `;
  }

  return `
    <div class="pf-page pf-cover pf-cover--back ${materialClass}"${thicknessStyle}${hard}>
      <div class="pf-cover-shell">
        <div class="pf-cover-face pf-cover-face--outside">
          <div class="pf-back-inner">拾光 · 测试结束</div>
        </div>
        <div class="pf-cover-face pf-cover-face--inside">
          <div class="pf-cover-lining"><span>BACK COVER</span><span>封底内衬</span></div>
        </div>
        <div class="pf-cover-edge pf-cover-edge--outer"></div>
        <div class="pf-cover-edge pf-cover-edge--top"></div>
        <div class="pf-cover-edge pf-cover-edge--bottom"></div>
      </div>
    </div>
  `;
}

function makePageMarkup(settings: DebugSettings): string {
  const materialClass = `pf-cover--${settings.coverMaterial}`;
  return `
    ${coverShellMarkup('front', settings)}
    <div class="pf-page pf-cover-lining-page ${materialClass}">
      <div class="pf-cover-lining pf-cover-lining--page">
        <span>SHIGUANG JOURNAL</span>
        <span>封面内侧</span>
      </div>
    </div>
    <div class="pf-page">
      <div class="pf-page-inner">
        <div class="pf-eyebrow">RIGHT PAGE</div>
        <div class="pf-title">现在翻这一张</div>
        <div class="pf-body">这里才是第一张真正的纸。重点观察右侧纸张：它应该从右侧抬起、弯折、越过书脊，并持续作为同一张纸落到左侧。</div>
        <div class="pf-footer"><span>拾光手帐</span><span>01</span></div>
      </div>
    </div>
    <div class="pf-page">
      <div class="pf-page-inner">
        <div class="pf-eyebrow">LEFT PILE</div>
        <div class="pf-title">翻完后，纸必须留在这里</div>
        <div class="pf-body">软页翻完后稳定叠在左侧；硬封面与封面内侧不再复用普通纸张的视觉样式。</div>
        <div class="pf-footer"><span>拾光手帐</span><span>02</span></div>
      </div>
    </div>
    <div class="pf-page">
      <div class="pf-page-inner">
        <div class="pf-eyebrow">NEXT SPREAD</div>
        <div class="pf-title">封面材质和纸张各自独立</div>
        <div class="pf-body">封面内侧跟随牛皮革、布艺、软皮、牛皮纸或硬纸板材质；真正的内页仍由 StPageFlip 做软纸折叠。</div>
        <div class="pf-footer"><span>拾光手帐</span><span>03</span></div>
      </div>
    </div>
    ${coverShellMarkup('back', settings)}
  `;
}

const pageCss = `
  .pf-book-root {
    width: 100%;
    height: 100%;
  }
  .pf-book-root .stf__parent {
    position: relative;
    display: block;
    box-sizing: border-box;
    transform: translateZ(0);
    -ms-touch-action: pan-y;
    touch-action: pan-y;
  }
  .pf-book-root .sft__wrapper,
  .pf-book-root .stf__wrapper {
    position: relative;
    width: 100%;
    box-sizing: border-box;
  }
  .pf-book-root .stf__parent canvas {
    position: absolute;
    width: 100%;
    height: 100%;
    left: 0;
    top: 0;
  }
  .pf-book-root .stf__block {
    position: absolute;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    perspective: 2000px;
  }
  .pf-book-root .stf__item {
    display: none;
    position: absolute;
    transform-style: preserve-3d;
  }
  .pf-book-root .stf__outerShadow,
  .pf-book-root .stf__innerShadow,
  .pf-book-root .stf__hardShadow,
  .pf-book-root .stf__hardInnerShadow {
    position: absolute;
    left: 0;
    top: 0;
  }
  .pf-book-root .stf__hardShadow,
  .pf-book-root .stf__hardInnerShadow {
    display: none !important;
    opacity: 0 !important;
    background: none !important;
    box-shadow: none !important;
  }

  .pf-page {
    position: relative;
    overflow: hidden;
    box-sizing: border-box;
    background: #fffaf0;
    color: #4a433b;
    border: 1px solid rgba(104, 86, 69, 0.12);
    box-shadow: inset 0 0 34px rgba(102, 83, 62, 0.045);
    font-family: PingFang SC, -apple-system, BlinkMacSystemFont, sans-serif;
  }
  .pf-page-inner {
    height: 100%;
    padding: 44px 38px 32px;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    background: radial-gradient(circle at 20% 10%, rgba(255,255,255,.95), rgba(255,250,240,.9) 46%, rgba(244,234,216,.82) 100%);
  }
  .pf-eyebrow {
    font-size: 11px;
    letter-spacing: .18em;
    opacity: .5;
    margin-bottom: 16px;
  }
  .pf-title {
    font-size: 28px;
    line-height: 1.22;
    font-weight: 650;
    letter-spacing: -.03em;
  }
  .pf-body {
    margin-top: 18px;
    font-size: 14px;
    line-height: 1.9;
    opacity: .72;
  }
  .pf-footer {
    margin-top: auto;
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    opacity: .4;
  }

  .pf-cover {
    --pf-cover-thickness: 6px;
    --pf-cover-base: #815f4b;
    --pf-cover-inside: #71513f;
    --pf-cover-edge: #4a3429;
    --pf-cover-highlight: rgba(255, 239, 215, .15);
    overflow: visible !important;
    border: 0;
    background: transparent;
    box-shadow: none;
    color: #fff8ec;
    transform-style: preserve-3d;
  }
  .pf-cover-shell {
    position: absolute;
    inset: 0;
    transform-style: preserve-3d;
    pointer-events: none;
  }
  .pf-cover-face {
    position: absolute;
    inset: 0;
    box-sizing: border-box;
    overflow: hidden;
    border: 1px solid rgba(48, 34, 25, .28);
    border-radius: 3px;
    transform-style: preserve-3d;
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
  }
  .pf-cover-face--outside {
    transform: translateZ(calc(var(--pf-cover-thickness) / 2));
    background-color: var(--pf-cover-base);
  }
  .pf-cover-face--inside {
    transform: rotateY(180deg) translateZ(calc(var(--pf-cover-thickness) / 2));
    background:
      linear-gradient(90deg, rgba(255,255,255,.06), transparent 18%, transparent 82%, rgba(0,0,0,.08)),
      var(--pf-cover-inside);
  }
  .pf-cover--back .pf-cover-face--outside {
    transform: rotateY(180deg) translateZ(calc(var(--pf-cover-thickness) / 2));
  }
  .pf-cover--back .pf-cover-face--inside {
    transform: translateZ(calc(var(--pf-cover-thickness) / 2));
  }

  .pf-cover-lining-page {
    background:
      linear-gradient(90deg, rgba(255,255,255,.055), transparent 16%, transparent 84%, rgba(0,0,0,.08)),
      var(--pf-cover-inside) !important;
    color: rgba(255, 248, 236, .72);
    border: 1px solid rgba(48, 34, 25, .22);
    box-shadow: inset 0 0 24px rgba(40, 28, 20, .08);
  }
  .pf-cover-lining--page {
    border: 10px solid rgba(255,255,255,.028);
    opacity: .5;
  }

  .pf-cover-edge {
    position: absolute;
    display: block;
    background:
      linear-gradient(90deg, rgba(255,255,255,.12), transparent 28%, rgba(0,0,0,.2)),
      var(--pf-cover-edge);
    transform-style: preserve-3d;
  }
  .pf-cover-edge--outer {
    top: 0;
    right: calc(var(--pf-cover-thickness) / -2);
    width: var(--pf-cover-thickness);
    height: 100%;
    transform: rotateY(90deg);
  }
  .pf-cover-edge--top {
    top: calc(var(--pf-cover-thickness) / -2);
    left: 0;
    width: 100%;
    height: var(--pf-cover-thickness);
    transform: rotateX(90deg);
  }
  .pf-cover-edge--bottom {
    bottom: calc(var(--pf-cover-thickness) / -2);
    left: 0;
    width: 100%;
    height: var(--pf-cover-thickness);
    transform: rotateX(90deg);
  }

  .pf-cover--leather {
    --pf-cover-base: #805d48;
    --pf-cover-inside: #684a39;
    --pf-cover-edge: #443026;
  }
  .pf-cover--leather .pf-cover-face--outside {
    background-color: var(--pf-cover-base);
    background-image:
      radial-gradient(circle at 20% 12%, rgba(255,255,255,.11) 0 1px, transparent 1.5px),
      radial-gradient(circle at 73% 66%, rgba(0,0,0,.09) 0 1px, transparent 1.6px),
      linear-gradient(135deg, rgba(255,255,255,.07), transparent 28%, rgba(0,0,0,.08));
    background-size: 13px 13px, 17px 17px, 100% 100%;
  }
  .pf-cover--fabric {
    --pf-cover-base: #8f8777;
    --pf-cover-inside: #787164;
    --pf-cover-edge: #555047;
  }
  .pf-cover--fabric .pf-cover-face--outside {
    background-color: var(--pf-cover-base);
    background-image:
      repeating-linear-gradient(0deg, rgba(255,255,255,.08) 0 1px, rgba(0,0,0,.045) 1px 2px, transparent 2px 4px),
      repeating-linear-gradient(90deg, rgba(255,255,255,.055) 0 1px, rgba(0,0,0,.035) 1px 2px, transparent 2px 5px);
  }
  .pf-cover--kraft {
    --pf-cover-base: #a77f55;
    --pf-cover-inside: #967049;
    --pf-cover-edge: #684a32;
  }
  .pf-cover--kraft .pf-cover-face--outside {
    background-color: var(--pf-cover-base);
    background-image:
      radial-gradient(circle at 16% 28%, rgba(80,50,28,.1) 0 1px, transparent 1.4px),
      radial-gradient(circle at 72% 62%, rgba(255,255,255,.1) 0 1px, transparent 1.5px),
      linear-gradient(100deg, rgba(255,255,255,.05), transparent 42%, rgba(80,50,28,.07));
    background-size: 19px 21px, 23px 17px, 100% 100%;
  }
  .pf-cover--soft-leather {
    --pf-cover-base: #765448;
    --pf-cover-inside: #65463d;
    --pf-cover-edge: #46312b;
  }
  .pf-cover--hardboard {
    --pf-cover-base: #a17a50;
    --pf-cover-inside: #94704b;
    --pf-cover-edge: #76583b;
  }

  .pf-cover-content {
    height: 100%;
    padding: 52px 42px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    box-sizing: border-box;
    background:
      linear-gradient(135deg, rgba(255,255,255,.06), transparent 34%),
      radial-gradient(circle at 70% 22%, var(--pf-cover-highlight), transparent 30%);
  }
  .pf-cover-lining {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    box-sizing: border-box;
    border: 12px solid rgba(255,255,255,.035);
    font-size: 12px;
    letter-spacing: .18em;
    opacity: .68;
  }
  .pf-kicker {
    font-size: 12px;
    letter-spacing: .24em;
    opacity: .72;
  }
  .pf-cover-title {
    font-size: 36px;
    font-weight: 650;
    letter-spacing: -.04em;
  }
  .pf-cover-subtitle {
    margin-top: 10px;
    font-size: 14px;
    opacity: .72;
  }
  .pf-footnote {
    font-size: 11px;
    opacity: .5;
  }
  .pf-back-inner {
    height: 100%;
    display: grid;
    place-items: center;
    font-size: 15px;
    opacity: .78;
  }
`;

export default function Book3DTest({ appVersion = 'dev' }: { appVersion?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const pageFlipRef = useRef<PageFlipInstance | null>(null);
  const [ready, setReady] = useState(false);
  const [state, setState] = useState('正在加载成熟翻页引擎…');
  const [pageIndex, setPageIndex] = useState(0);
  const [settings, setSettings] = useState<DebugSettings>(DEFAULT_SETTINGS);
  const [engineKey, setEngineKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let instance: PageFlipInstance | null = null;
    const host = hostRef.current;
    if (!host) return;

    setReady(false);
    setPageIndex(0);
    setState('正在按当前参数重建翻页引擎…');
    host.replaceChildren();

    const root = document.createElement('div');
    root.className = 'pf-book-root';
    root.innerHTML = makePageMarkup(settings);
    host.appendChild(root);

    const init = async () => {
      try {
        const PageFlipCtor = await loadPageFlip();
        if (cancelled) return;

        instance = new PageFlipCtor(root, {
          width: settings.pageWidth,
          height: settings.pageHeight,
          size: 'stretch',
          minWidth: Math.round(settings.pageWidth * 0.74),
          maxWidth: settings.pageWidth,
          minHeight: Math.round(settings.pageHeight * 0.74),
          maxHeight: settings.pageHeight,
          drawShadow: true,
          flippingTime: settings.flippingTime,
          usePortrait: false,
          autoSize: true,
          maxShadowOpacity: settings.maxShadowOpacity,
          showCover: settings.hardCover,
          mobileScrollSupport: false,
          clickEventForward: true,
          useMouseEvents: true,
          swipeDistance: 30,
          showPageCorners: settings.showPageCorners,
          disableFlipByClick: false,
        });

        const pages = root.querySelectorAll<HTMLElement>('.pf-page');
        instance.loadFromHTML(pages);

        instance.on('changeState', (event) => {
          if (cancelled) return;
          const nextState = String(event.data);
          if (nextState === 'flipping' || nextState === 'user_fold') {
            setState('纸页正在折叠 · 封面不再叠加 StPageFlip 的硬页大片阴影');
          } else if (nextState === 'read') {
            setState('参数已生效 · 可以继续翻页或换封面材质');
          }
        });

        instance.on('flip', (event) => {
          if (cancelled) return;
          const nextPage = Number(event.data);
          if (Number.isFinite(nextPage)) setPageIndex(nextPage);
        });

        pageFlipRef.current = instance;
        setReady(true);
        setState('参数已生效 · 先检查封面厚度，再连续翻两张内页');
      } catch (error) {
        console.error('Failed to initialise StPageFlip experiment', error);
        if (!cancelled) {
          setReady(false);
          setState('翻页引擎网络加载失败，但页面本身可继续使用；刷新即可重试');
        }
      }
    };

    void init();

    return () => {
      cancelled = true;
      pageFlipRef.current = null;
      try {
        instance?.destroy();
      } catch {
        // StPageFlip may already have removed its root during teardown.
      }
      host.replaceChildren();
    };
  }, [engineKey]);

  const goNext = () => pageFlipRef.current?.flipNext('bottom');
  const goPrev = () => pageFlipRef.current?.flipPrev('bottom');
  const reset = () => {
    pageFlipRef.current?.turnToPage(0);
    setPageIndex(0);
    setState('已回到封面 · 使用当前参数重新测试');
  };
  const applySettings = () => setEngineKey((value) => value + 1);
  const applyPreset = (patch: Partial<DebugSettings>) => {
    setSettings((current) => ({ ...current, ...patch }));
    setTimeout(() => setEngineKey((current) => current + 1), 0);
  };

  return (
    <main
      style={{
        minHeight: '100dvh',
        padding: '32px',
        background: 'linear-gradient(180deg, #f8f4ee 0%, #eee7de 100%)',
        color: '#3f3a35',
        fontFamily: 'PingFang SC, -apple-system, BlinkMacSystemFont, sans-serif',
      }}
    >
      <style>{pageCss}</style>
      <div style={{ width: 'min(1180px, 100%)', margin: '0 auto' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 20,
            alignItems: 'flex-end',
            marginBottom: 18,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  display: 'inline-flex',
                  padding: '6px 10px',
                  borderRadius: 999,
                  background: '#ffffffa8',
                  border: '1px solid #d9d0c5',
                  fontSize: 12,
                }}
              >
                StPageFlip 调试台 · 封面结构实验
              </div>
              <div style={versionBadgeStyle}>当前版本 v{appVersion}</div>
            </div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 650, letterSpacing: '-0.02em' }}>
              封面开始按“实体壳”来做
            </h1>
            <p style={{ margin: '8px 0 0', opacity: 0.72, fontSize: 14 }}>
              {state} · 当前页 {pageIndex + 1}
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={goPrev} disabled={!ready} style={buttonStyle}>
              上一页
            </button>
            <button type="button" onClick={goNext} disabled={!ready} style={buttonStyle}>
              下一页
            </button>
            <button type="button" onClick={reset} disabled={!ready} style={buttonStyle}>
              回到封面
            </button>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(248px, 290px)',
            gap: 16,
            alignItems: 'stretch',
          }}
        >
          <section
            style={{
              minHeight: 620,
              display: 'grid',
              placeItems: 'center',
              overflow: 'hidden',
              borderRadius: 28,
              border: '1px solid #d8cfc4',
              boxShadow: '0 24px 70px rgba(68, 53, 39, 0.14)',
              background:
                'radial-gradient(circle at 50% 36%, rgba(255,255,255,.82), rgba(232,224,214,.95) 68%, #ded4c8 100%)',
              padding: '38px 20px',
            }}
          >
            <div
              ref={hostRef}
              style={{
                width: 'min(840px, 94vw)',
                height: 'min(560px, 66vh)',
                minHeight: 430,
                filter: 'drop-shadow(0 26px 28px rgba(54, 43, 32, 0.16))',
              }}
            />
          </section>

          <aside style={panelStyle}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 650 }}>翻页 / 封面参数</div>
              <div style={{ marginTop: 5, fontSize: 11, lineHeight: 1.55, opacity: 0.58 }}>
                封面已经和软页分开处理：软页保留动态阴影，硬封面关闭引擎自带的大面积硬页阴影。
              </div>
            </div>

            <DebugSlider
              label="翻页速度"
              value={settings.flippingTime}
              min={450}
              max={1500}
              step={50}
              suffix=" ms"
              onChange={(value) => setSettings((current) => ({ ...current, flippingTime: value }))}
            />
            <DebugSlider
              label="内页动态阴影"
              value={settings.maxShadowOpacity}
              min={0.1}
              max={0.8}
              step={0.05}
              onChange={(value) =>
                setSettings((current) => ({ ...current, maxShadowOpacity: value }))
              }
            />
            <DebugSlider
              label="纸张宽度"
              value={settings.pageWidth}
              min={320}
              max={440}
              step={10}
              suffix=" px"
              onChange={(value) => setSettings((current) => ({ ...current, pageWidth: value }))}
            />
            <DebugSlider
              label="纸张高度"
              value={settings.pageHeight}
              min={450}
              max={600}
              step={10}
              suffix=" px"
              onChange={(value) => setSettings((current) => ({ ...current, pageHeight: value }))}
            />
            <DebugSlider
              label="封面厚度"
              value={settings.coverThickness}
              min={2}
              max={14}
              step={1}
              suffix=" px"
              onChange={(value) =>
                setSettings((current) => ({ ...current, coverThickness: value }))
              }
            />

            <label style={{ display: 'grid', gap: 7, fontSize: 12 }}>
              <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span>封面材质</span>
                <span style={{ opacity: 0.56 }}>{coverMaterialLabel(settings.coverMaterial)}</span>
              </span>
              <select
                value={settings.coverMaterial}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    coverMaterial: event.target.value as CoverMaterial,
                  }))
                }
                style={selectStyle}
              >
                <option value="leather">牛皮革</option>
                <option value="fabric">布艺</option>
                <option value="soft-leather">软皮</option>
                <option value="kraft">牛皮纸</option>
                <option value="hardboard">硬纸板</option>
              </select>
            </label>

            <label style={toggleRowStyle}>
              <span>显示折角提示</span>
              <input
                type="checkbox"
                checked={settings.showPageCorners}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    showPageCorners: event.target.checked,
                  }))
                }
              />
            </label>
            <label style={toggleRowStyle}>
              <span>使用硬封面壳</span>
              <input
                type="checkbox"
                checked={settings.hardCover}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, hardCover: event.target.checked }))
                }
              />
            </label>

            <button type="button" onClick={applySettings} style={primaryButtonStyle}>
              应用参数并重建
            </button>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => applyPreset(preset.patch)}
                  style={smallButtonStyle}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div
              style={{
                marginTop: 'auto',
                paddingTop: 12,
                borderTop: '1px solid rgba(98,78,61,.12)',
                fontSize: 11,
                lineHeight: 1.65,
                opacity: 0.64,
              }}
            >
              <div style={{ fontWeight: 700, opacity: 1 }}>版本 v{appVersion}</div>
              <div>
                当前：{settings.flippingTime}ms · 内页阴影 {settings.maxShadowOpacity.toFixed(2)}
              </div>
              <div>
                {settings.pageWidth}×{settings.pageHeight} · 封面 {settings.coverThickness}px ·{' '}
                {coverMaterialLabel(settings.coverMaterial)}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

function coverMaterialLabel(material: CoverMaterial): string {
  if (material === 'fabric') return '布艺';
  if (material === 'soft-leather') return '软皮';
  if (material === 'kraft') return '牛皮纸';
  if (material === 'hardboard') return '硬纸板';
  return '牛皮革';
}

function DebugSlider({
  label,
  value,
  min,
  max,
  step,
  suffix = '',
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label style={{ display: 'grid', gap: 7 }}>
      <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
        <span>{label}</span>
        <span style={{ opacity: 0.56 }}>
          {value}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ width: '100%' }}
      />
    </label>
  );
}

const versionBadgeStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 28,
  padding: '5px 11px',
  borderRadius: 9,
  background: '#4f3b2f',
  color: '#fffaf2',
  border: '1px solid rgba(66,45,32,.25)',
  boxShadow: '0 5px 14px rgba(68,47,34,.16)',
  fontSize: 13,
  fontWeight: 750,
  letterSpacing: '.02em',
};

const buttonStyle: CSSProperties = {
  border: '1px solid #cdbfaf',
  borderRadius: 999,
  padding: '9px 14px',
  background: '#fffaf2',
  color: '#53483f',
  cursor: 'pointer',
  fontSize: 13,
};

const panelStyle: CSSProperties = {
  minHeight: 620,
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  padding: '20px 18px',
  borderRadius: 24,
  border: '1px solid #d8cfc4',
  background: 'rgba(255,252,247,.86)',
  boxShadow: '0 18px 50px rgba(68,53,39,.09)',
};

const toggleRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  fontSize: 12,
};

const selectStyle: CSSProperties = {
  width: '100%',
  border: '1px solid #d4c7b8',
  borderRadius: 10,
  padding: '8px 10px',
  background: '#fffaf3',
  color: '#5b4d43',
  fontSize: 12,
};

const primaryButtonStyle: CSSProperties = {
  border: '1px solid #8f7560',
  borderRadius: 12,
  padding: '10px 12px',
  background: '#755b49',
  color: '#fffaf2',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 600,
};

const smallButtonStyle: CSSProperties = {
  border: '1px solid #d4c7b8',
  borderRadius: 10,
  padding: '8px 6px',
  background: '#fffaf3',
  color: '#5b4d43',
  cursor: 'pointer',
  fontSize: 11,
};
