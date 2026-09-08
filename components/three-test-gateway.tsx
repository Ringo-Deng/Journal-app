'use client';

import { lazy, Suspense, useEffect, useState } from 'react';

const ThreeTestClient = lazy(() => import('@/app/three-test/ThreeTestClient'));

const TEST_HASH = '#three-test';

export default function ThreeTestGateway({ appVersion }: { appVersion: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const sync = () => setOpen(window.location.hash === TEST_HASH);
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  if (!open) return null;

  const close = () => {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    setOpen(false);
  };

  return (
    <div
      role="dialog"
      aria-label="翻页测试"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483647,
        overflow: 'auto',
        background: '#f3eee6',
      }}
    >
      <button
        type="button"
        onClick={close}
        style={{
          position: 'fixed',
          top: 18,
          right: 18,
          zIndex: 2147483647,
          border: '1px solid rgba(80, 65, 52, 0.18)',
          borderRadius: 999,
          padding: '9px 14px',
          background: 'rgba(255, 252, 247, 0.92)',
          color: '#51473e',
          fontSize: 13,
          cursor: 'pointer',
          boxShadow: '0 8px 24px rgba(67, 51, 38, 0.08)',
          backdropFilter: 'blur(10px)',
        }}
      >
        返回手帐
      </button>
      <Suspense
        fallback={
          <div
            style={{
              minHeight: '100vh',
              display: 'grid',
              placeItems: 'center',
              color: '#756a60',
              fontSize: 14,
            }}
          >
            正在打开翻页测试…
          </div>
        }
      >
        <ThreeTestClient appVersion={appVersion} />
      </Suspense>
    </div>
  );
}
