'use client';

import { useEffect, useRef, useState } from 'react';

const PAGE_FLIP_SOURCES = [
  'https://cdn.jsdelivr.net/npm/page-flip@2.0.7/dist/js/page-flip.browser.js',
  'https://unpkg.com/page-flip@2.0.7/dist/js/page-flip.browser.js',
] as const;

type PageFlipEvent = { data: number | string };
type PageFlipInstance = {
  loadFromHTML(items: NodeListOf<HTMLElement> | HTMLElement[]): void;
  on(event: string, callback: (event: PageFlipEvent) => void): void;
  destroy(): void;
};
type PageFlipConstructor = new (
  element: HTMLElement,
  settings: Record<string, number | string | boolean>,
) => PageFlipInstance;
type PageFlipWindow = Window & { St?: { PageFlip?: PageFlipConstructor } };

function getConstructor(): PageFlipConstructor | null {
  return (window as PageFlipWindow).St?.PageFlip ?? null;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[data-compare-page-flip-src="${src}"]`,
    );
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
    script.dataset.comparePageFlipSrc = src;
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

function cover(side: 'front' | 'back') {
  if (side === 'front') {
    return `
      <div class="pf-page pf-cover pf-cover--front pf-cover--fabric" data-density="hard">
        <div class="pf-cover-shell">
          <div class="pf-cover-face pf-cover-face--outside">
            <div class="pf-cover-content">
              <div class="pf-kicker">SHIGUANG JOURNAL</div>
              <div>
                <div class="pf-cover-title">拾光</div>
                <div class="pf-cover-subtitle">点击或拖动封面打开</div>
              </div>
              <div class="pf-footnote">StPageFlip · previous page-turn system</div>
            </div>
          </div>
          <div class="pf-cover-face pf-cover-face--inside">
            <div class="pf-cover-lining"><span>INNER COVER</span><span>封面内衬</span></div>
          </div>
          <span class="pf-cover-edge pf-cover-edge--outer"></span>
          <span class="pf-cover-edge pf-cover-edge--top"></span>
          <span class="pf-cover-edge pf-cover-edge--bottom"></span>
        </div>
      </div>`;
  }

  return `
    <div class="pf-page pf-cover pf-cover--back pf-cover--fabric" data-density="hard">
      <div class="pf-cover-shell">
        <div class="pf-cover-face pf-cover-face--outside">
          <div class="pf-back-inner">拾光 · 测试结束</div>
        </div>
        <div class="pf-cover-face pf-cover-face--inside">
          <div class="pf-cover-lining"><span>BACK COVER</span><span>封底内衬</span></div>
        </div>
        <span class="pf-cover-edge pf-cover-edge--outer"></span>
        <span class="pf-cover-edge pf-cover-edge--top"></span>
        <span class="pf-cover-edge pf-cover-edge--bottom"></span>
      </div>
    </div>`;
}

function paper(eyebrow: string, title: string, body: string, page: string) {
  return `
    <div class="pf-page">
      <div class="pf-page-inner">
        <div class="pf-eyebrow">${eyebrow}</div>
        <div class="pf-title">${title}</div>
        <div class="pf-body">${body}</div>
        <div class="pf-footer"><span>拾光手帐</span><span>${page}</span></div>
      </div>
    </div>`;
}

function pageMarkup() {
  return `
    ${cover('front')}
    <div class="pf-page pf-cover-lining-page pf-cover--fabric">
      <div class="pf-cover-lining pf-cover-lining--page">
        <span>SHIGUANG JOURNAL</span><span>封面内侧</span>
      </div>
    </div>
    ${paper('RIGHT PAGE', '先翻这一张', '观察纸张从右页抬起、折叠、越过书脊，再作为同一张纸落到左侧。', '01')}
    ${paper('LEFT PILE', '翻完后留在左侧', '这一套使用之前的 StPageFlip 软页折叠逻辑，重点比较弯曲轨迹、速度和落页手感。', '02')}
    ${paper('NEXT SPREAD', '继续连续翻页', '连续翻两三张，看看页角响应和纸张阴影是否更接近你之前喜欢的效果。', '03')}
    ${paper('LAST PAGE', '最后一张测试纸', '这里只用于翻页测试，不会影响正式欣赏模式，也不会修改你的手帐数据。', '04')}
    <div class="pf-page pf-cover-lining-page pf-cover--fabric">
      <div class="pf-cover-lining pf-cover-lining--page">
        <span>SHIGUANG JOURNAL</span><span>封底内侧</span>
      </div>
    </div>
    ${cover('back')}
  `;
}

const compareCss = `
  .stpageflip-compare {
    min-height: 100dvh;
    padding: 32px;
    box-sizing: border-box;
    background: linear-gradient(180deg, #f8f4ee 0%, #eee7de 100%);
    color: #3f3a35;
    font-family: PingFang SC, -apple-system, BlinkMacSystemFont, sans-serif;
  }
  .stpageflip-compare__wrap { width: min(1180px, 100%); margin: 0 auto; }
  .stpageflip-compare__head { margin-bottom: 18px; }
  .stpageflip-compare__badge {
    display: inline-flex; padding: 6px 10px; border-radius: 999px;
    background: #ffffffa8; border: 1px solid #d9d0c5; font-size: 12px;
  }
  .stpageflip-compare__title { margin: 10px 0 0; font-size: 28px; font-weight: 650; letter-spacing: -.02em; }
  .stpageflip-compare__status { margin: 8px 0 0; opacity: .68; font-size: 14px; }
  .stpageflip-compare__stage {
    min-height: 620px; display: grid; place-items: center; overflow: hidden;
    border-radius: 28px; border: 1px solid #d8cfc4;
    box-shadow: 0 24px 70px rgba(68,53,39,.14);
    background: radial-gradient(circle at 50% 36%, rgba(255,255,255,.82), rgba(232,224,214,.95) 68%, #ded4c8 100%);
    padding: 38px 20px;
  }
  .stpageflip-compare__host {
    width: min(840px, 94vw); height: min(560px, 66vh); min-height: 430px;
    filter: drop-shadow(0 26px 28px rgba(54,43,32,.16));
  }
  .pf-book-root { width: 100%; height: 100%; }
  .pf-book-root .stf__parent { position: relative; display: block; box-sizing: border-box; transform: translateZ(0); touch-action: pan-y; }
  .pf-book-root .stf__wrapper { position: relative; width: 100%; box-sizing: border-box; }
  .pf-book-root .stf__parent canvas { position: absolute; width: 100%; height: 100%; left: 0; top: 0; }
  .pf-book-root .stf__block { position: absolute; width: 100%; height: 100%; box-sizing: border-box; perspective: 2000px; }
  .pf-book-root .stf__item { display: none; position: absolute; transform-style: preserve-3d; }
  .pf-book-root .stf__outerShadow,
  .pf-book-root .stf__innerShadow,
  .pf-book-root .stf__hardShadow,
  .pf-book-root .stf__hardInnerShadow { position: absolute; left: 0; top: 0; }
  .pf-book-root .stf__hardShadow,
  .pf-book-root .stf__hardInnerShadow { display: none !important; opacity: 0 !important; background: none !important; box-shadow: none !important; }
  .pf-page {
    position: relative; overflow: hidden; box-sizing: border-box;
    background: #fffaf0; color: #4a433b;
    border: 1px solid rgba(104,86,69,.12);
    box-shadow: inset 0 0 34px rgba(102,83,62,.045);
  }
  .pf-page-inner {
    height: 100%; padding: 44px 38px 32px; display: flex; flex-direction: column; box-sizing: border-box;
    background: radial-gradient(circle at 20% 10%, rgba(255,255,255,.95), rgba(255,250,240,.9) 46%, rgba(244,234,216,.82) 100%);
  }
  .pf-eyebrow { font-size: 11px; letter-spacing: .18em; opacity: .5; margin-bottom: 16px; }
  .pf-title { font-size: 28px; line-height: 1.22; font-weight: 650; letter-spacing: -.03em; }
  .pf-body { margin-top: 18px; font-size: 14px; line-height: 1.9; opacity: .72; }
  .pf-footer { margin-top: auto; display: flex; justify-content: space-between; font-size: 11px; opacity: .4; }
  .pf-cover {
    --pf-cover-thickness: 6px;
    --pf-cover-base: #d2c5b2;
    --pf-cover-inside: #c2b49f;
    --pf-cover-edge: #94836f;
    --pf-material-texture: repeating-linear-gradient(90deg, rgba(80,67,54,.045) 0 1px, transparent 1px 4px);
    --pf-material-texture-size: 12px 12px;
    overflow: visible !important; border: 0; background: transparent; box-shadow: none;
    transform-style: preserve-3d; color: #4d453d;
  }
  .pf-cover-shell { position: absolute; inset: 0; transform-style: preserve-3d; pointer-events: none; }
  .pf-cover-face { position: absolute; inset: 0; box-sizing: border-box; overflow: hidden; border: 1px solid rgba(48,34,25,.2); border-radius: 5px; backface-visibility: hidden; -webkit-backface-visibility: hidden; }
  .pf-cover-face--outside { transform: translateZ(calc(var(--pf-cover-thickness) / 2)); background-color: var(--pf-cover-base); background-image: var(--pf-material-texture); background-size: var(--pf-material-texture-size); }
  .pf-cover-face--inside { transform: rotateY(180deg) translateZ(calc(var(--pf-cover-thickness) / 2)); background: var(--pf-cover-inside); }
  .pf-cover--back .pf-cover-face--outside { transform: rotateY(180deg) translateZ(calc(var(--pf-cover-thickness) / 2)); }
  .pf-cover--back .pf-cover-face--inside { transform: translateZ(calc(var(--pf-cover-thickness) / 2)); }
  .pf-cover-edge { position: absolute; display: block; background: var(--pf-cover-edge); transform-style: preserve-3d; }
  .pf-cover-edge--outer { top: 0; right: calc(var(--pf-cover-thickness) / -2); width: var(--pf-cover-thickness); height: 100%; transform: rotateY(90deg); }
  .pf-cover-edge--top { top: calc(var(--pf-cover-thickness) / -2); left: 0; width: 100%; height: var(--pf-cover-thickness); transform: rotateX(90deg); }
  .pf-cover-edge--bottom { bottom: calc(var(--pf-cover-thickness) / -2); left: 0; width: 100%; height: var(--pf-cover-thickness); transform: rotateX(90deg); }
  .pf-cover-content { height: 100%; padding: 52px 42px; display: flex; flex-direction: column; justify-content: space-between; box-sizing: border-box; }
  .pf-cover-lining { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; box-sizing: border-box; border: 12px solid rgba(255,255,255,.035); font-size: 12px; letter-spacing: .18em; opacity: .68; }
  .pf-cover-lining-page { background: var(--pf-cover-inside, #c2b49f) !important; color: rgba(76,66,57,.72); border: 1px solid rgba(48,34,25,.16); }
  .pf-kicker { font-size: 12px; letter-spacing: .24em; opacity: .72; }
  .pf-cover-title { font-size: 36px; font-weight: 650; letter-spacing: -.04em; }
  .pf-cover-subtitle { margin-top: 10px; font-size: 14px; opacity: .72; }
  .pf-footnote { font-size: 11px; opacity: .5; }
  .pf-back-inner { height: 100%; display: grid; place-items: center; font-size: 15px; opacity: .78; }
  @media (max-width: 720px) {
    .stpageflip-compare { padding: 20px 12px; }
    .stpageflip-compare__stage { min-height: 540px; padding: 28px 6px; }
    .stpageflip-compare__title { font-size: 22px; }
  }
`;

export default function StPageFlipCompare({ appVersion }: { appVersion: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('正在加载之前的翻页引擎…');
  const [pageIndex, setPageIndex] = useState(0);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    let instance: PageFlipInstance | null = null;
    host.replaceChildren();

    const root = document.createElement('div');
    root.className = 'pf-book-root';
    root.innerHTML = pageMarkup();
    host.appendChild(root);

    const init = async () => {
      try {
        const PageFlipCtor = await loadPageFlip();
        if (cancelled) return;

        instance = new PageFlipCtor(root, {
          width: 380,
          height: 520,
          size: 'stretch',
          minWidth: 280,
          maxWidth: 380,
          minHeight: 383,
          maxHeight: 520,
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

        instance.loadFromHTML(root.querySelectorAll<HTMLElement>('.pf-page'));
        instance.on('changeState', (event) => {
          if (cancelled) return;
          const next = String(event.data);
          setStatus(
            next === 'flipping' || next === 'user_fold'
              ? '正在使用之前的软页折叠轨迹'
              : '点击页面或拖动右下角继续翻页',
          );
        });
        instance.on('flip', (event) => {
          if (cancelled) return;
          const nextPage = Number(event.data);
          if (Number.isFinite(nextPage)) setPageIndex(nextPage);
        });
        setStatus('已恢复之前的 StPageFlip 参数 · 点击封面开始');
      } catch (error) {
        console.error('Failed to initialise StPageFlip comparison', error);
        if (!cancelled) setStatus('StPageFlip 网络加载失败，请刷新后重试');
      }
    };

    void init();
    return () => {
      cancelled = true;
      try {
        instance?.destroy();
      } catch {
        // StPageFlip may already have detached its wrapper during teardown.
      }
      host.replaceChildren();
    };
  }, []);

  return (
    <main className="three-test-cover-depth stpageflip-compare">
      <style>{compareCss}</style>
      <div className="stpageflip-compare__wrap">
        <header className="stpageflip-compare__head">
          <span className="stpageflip-compare__badge">改动后 · StPageFlip · v{appVersion}</span>
          <h1 className="stpageflip-compare__title">之前那套翻页效果</h1>
          <p className="stpageflip-compare__status">{status} · 当前物理页 {pageIndex + 1}</p>
        </header>
        <section className="stpageflip-compare__stage">
          <div ref={hostRef} className="stpageflip-compare__host" />
        </section>
      </div>
    </main>
  );
}
