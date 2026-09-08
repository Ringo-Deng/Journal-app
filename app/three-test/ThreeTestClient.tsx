'use client';

import { useState } from 'react';
import Book3DTest from '@/components/book3d/Book3DTest';
import StPageFlipCompare from './StPageFlipCompare';

const toggleStyle = {
  position: 'fixed' as const,
  top: 18,
  right: 18,
  zIndex: 10000,
  border: '1px solid rgba(88, 72, 58, .18)',
  borderRadius: 999,
  padding: '10px 16px',
  background: 'rgba(255, 252, 247, .92)',
  boxShadow: '0 8px 28px rgba(57, 44, 33, .14)',
  backdropFilter: 'blur(12px)',
  color: '#443b33',
  fontSize: 13,
  fontWeight: 650,
  cursor: 'pointer',
};

export default function ThreeTestClient({ appVersion }: { appVersion: string }) {
  const [showAfter, setShowAfter] = useState(false);

  return (
    <>
      {showAfter ? (
        <StPageFlipCompare appVersion={appVersion} />
      ) : (
        <Book3DTest appVersion={appVersion} />
      )}
      <button
        type="button"
        onClick={() => setShowAfter((value) => !value)}
        style={toggleStyle}
        aria-label={showAfter ? '切换到改动前翻页效果' : '切换到改动后翻页效果'}
      >
        {showAfter ? '改动后 · 查看改动前' : '改动前 · 查看改动后'}
      </button>
    </>
  );
}
