'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

const PAGE_WIDTH = 380;
const PAGE_HEIGHT = 520;
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

const pageMarkup = `
  <div class="pf-page pf-cover" data-density="hard">
    <div class="pf-cover-inner">
      <div class="pf-kicker">SHIGUANG JOURNAL</div>
      <div>
        <div class="pf-cover-title">拾光</div>
        <div class="pf-cover-subtitle">点击封面打开</div>
      </div>
      <div class="pf-footnote">成熟翻页引擎测试本</div>
    </div>
  </div>
  <div class="pf-page">
    <div class="pf-page-inner">
      <div class="pf-eyebrow">INNER COVER</div>
      <div class="pf-title">打开以后，先看书是否真的成立</div>
      <div class="pf-body">这一版不再由我们手写纸张运动。封面、软页折角、阴影、拖拽和落页都交给成熟翻页引擎处理。</div>
      <div class="pf-footer"><span>拾光手帐</span><span>01</span></div>
    </div>
  </div>
  <div class="pf-page">
    <div class="pf-page-inner">
      <div class="pf-eyebrow">RIGHT PAGE</div>
      <div class="pf-title">现在翻这一张</div>
      <div class="pf-body">重点观察右侧纸张：它应该从右侧抬起、弯折、越过书脊，并持续作为同一张纸落到左侧，而不是在动画末尾突然消失。</div>
      <div class="pf-footer"><span>拾光手帐</span><span>02</span></div>
    </div>
  </div>
  <div class="pf-page">
    <div class="pf-page-inner">
      <div class="pf-eyebrow">LEFT PILE</div>
      <div class="pf-title">翻完后，纸必须留在这里</div>
      <div class="pf-body">如果这张软页翻完后稳定叠在左侧，说明成熟翻页引擎的运动模型符合我们的底线，再考虑把手帐真实内容接进去。</div>
      <div class="pf-footer"><span>拾光手帐</span><span>03</span></div>
    </div>
  </div>
  <div class="pf-page">
    <div class="pf-page-inner">
      <div class="pf-eyebrow">NEXT SPREAD</div>
      <div class="pf-title">先验证翻页，再谈视觉融合</div>
      <div class="pf-body">这一页故意保持简单。只有翻页结构可靠以后，才把现有封面、纸张纹理、真实手帐跨页和欣赏模式接回去。</div>
      <div class="pf-footer"><span>拾光手帐</span><span>04</span></div>
    </div>
  </div>
  <div class="pf-page pf-back" data-density="hard">
    <div class="pf-back-inner">拾光 · 测试结束</div>
  </div>
`;

const pageCss = `
  .pf-book-root {
    width: 100%;
    height: 100%;
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
    background: #8a6954;
    color: #fff8ec;
    border: 1px solid rgba(68,47,33,.32);
  }
  .pf-cover-inner {
    height: 100%;
    padding: 52px 42px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    box-sizing: border-box;
    background: linear-gradient(135deg, rgba(255,255,255,.06), transparent 34%), radial-gradient(circle at 70% 22%, rgba(255,232,194,.13), transparent 30%);
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
  .pf-back {
    background: #80604d;
    color: #fff8ec;
  }
  .pf-back-inner {
    height: 100%;
    display: grid;
    place-items: center;
    font-size: 15px;
    opacity: .78;
  }
`;

export default function Book3DTest() {
  const hostRef = useRef<HTMLDivElement>(null);
  const pageFlipRef = useRef<PageFlipInstance | null>(null);
  const [ready, setReady] = useState(false);
  const [state, setState] = useState('正在加载成熟翻页引擎…');
  const [pageIndex, setPageIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let instance: PageFlipInstance | null = null;
    const host = hostRef.current;
    if (!host) return;

    const root = document.createElement('div');
    root.className = 'pf-book-root';
    root.innerHTML = pageMarkup;
    host.appendChild(root);

    const init = async () => {
      try {
        const PageFlipCtor = await loadPageFlip();
        if (cancelled) return;

        instance = new PageFlipCtor(root, {
          width: PAGE_WIDTH,
          height: PAGE_HEIGHT,
          size: 'stretch',
          minWidth: 280,
          maxWidth: PAGE_WIDTH,
          minHeight: 383,
          maxHeight: PAGE_HEIGHT,
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

        const pages = root.querySelectorAll<HTMLElement>('.pf-page');
        instance.loadFromHTML(pages);

        instance.on('changeState', (event) => {
          if (cancelled) return;
          const nextState = String(event.data);
          if (nextState === 'flipping' || nextState === 'user_fold') {
            setState('纸页正在真实折叠；翻完后会保留在左侧书页堆中');
          } else if (nextState === 'read') {
            setState('点击右页继续翻；也可以拖动右下角');
          }
        });

        instance.on('flip', (event) => {
          if (cancelled) return;
          const nextPage = Number(event.data);
          if (Number.isFinite(nextPage)) setPageIndex(nextPage);
        });

        pageFlipRef.current = instance;
        setReady(true);
        setState('先点击封面打开，再翻一张软页测试落页效果');
      } catch (error) {
        console.error('Failed to initialise StPageFlip experiment', error);
        if (!cancelled) {
          setReady(false);
          setState('翻页引擎网络加载失败，但页面本身已恢复；稍后刷新即可重试');
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
  }, []);

  const goNext = () => pageFlipRef.current?.flipNext('bottom');
  const goPrev = () => pageFlipRef.current?.flipPrev('bottom');
  const reset = () => {
    pageFlipRef.current?.turnToPage(0);
    setPageIndex(0);
    setState('已回到封面；点击封面重新测试');
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
      <div style={{ width: 'min(1120px, 100%)', margin: '0 auto' }}>
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
                display: 'inline-flex',
                padding: '6px 10px',
                borderRadius: 999,
                background: '#ffffffa8',
                border: '1px solid #d9d0c5',
                fontSize: 12,
                marginBottom: 10,
              }}
            >
              成熟翻页引擎对照实验 · StPageFlip（无 npm 依赖）
            </div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 650, letterSpacing: '-0.02em' }}>
              先保证页面稳定打开
            </h1>
            <p style={{ margin: '8px 0 0', opacity: 0.72, fontSize: 14 }}>
              {state} · 当前页 {pageIndex + 1}
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={goPrev} disabled={!ready} style={buttonStyle}>
              上一页
            </button>
            <button type="button" onClick={goNext} disabled={!ready} style={buttonStyle}>
              下一页
            </button>
            <button type="button" onClick={reset} disabled={!ready} style={buttonStyle}>
              重新测试
            </button>
          </div>
        </div>

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
              filter: 'drop-shadow(0 26px 28px rgba(54, 43, 32, 0.22))',
            }}
          />
        </section>
      </div>
    </main>
  );
}

const buttonStyle: CSSProperties = {
  border: '1px solid #cdbfaf',
  borderRadius: 999,
  padding: '9px 14px',
  background: '#fffaf2',
  color: '#53483f',
  cursor: 'pointer',
  fontSize: 13,
};
