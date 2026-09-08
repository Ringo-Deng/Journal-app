import type { Metadata } from 'next';
import packageJson from '../package.json';
import RuntimeCompatibility from '@/components/runtime-compatibility';
import './globals.css';

export const metadata: Metadata = {
  title: '拾光 · 私人手帐',
  description: '用照片与只言片语，收藏每一天。',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="stylesheet" href="/api/fonts.css" data-user-fonts="true" />
      </head>
      <body>
        <RuntimeCompatibility />
        <div
          aria-label={`当前版本 v${packageJson.version}`}
          style={{
            position: 'fixed',
            top: 8,
            left: 10,
            zIndex: 2147483647,
            fontSize: 11,
            lineHeight: 1,
            padding: '4px 6px',
            borderRadius: 6,
            background: 'rgba(255,255,255,0.72)',
            border: '1px solid rgba(0,0,0,0.08)',
            color: 'rgba(0,0,0,0.48)',
            pointerEvents: 'none',
            backdropFilter: 'blur(6px)',
          }}
        >
          v{packageJson.version}
        </div>
        {children}
      </body>
    </html>
  );
}
