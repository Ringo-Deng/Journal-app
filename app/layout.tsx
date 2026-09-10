import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import packageJson from '../package.json';
import RuntimeCompatibility from '@/components/runtime-compatibility';
import ThreeTestGateway from '@/components/three-test-gateway';
import MaterialRecovery from '@/components/material-recovery';
import './globals.css';
import './cover-materials.css';
import './reading-cover-fixes.css';
import './reading-back-cover-fixes.css';
import './reading-format-fit.css';
import './material-library-refresh.css';
import './material-studio-stability.css';
import './photo-library.css';
import './notebook-cover-previews.css';
import './editor-reliability.css';
import './editor-rounded-transition.css';

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
      <body
        style={
          {
            '--app-version': `"v${packageJson.version}"`,
          } as CSSProperties
        }
      >
        <RuntimeCompatibility />
        <ThreeTestGateway appVersion={packageJson.version} />
        <MaterialRecovery />
        <style>{`
          .build-version {
            font-size: 0 !important;
          }
          .build-version::after {
            content: var(--app-version);
            font-size: 10px;
          }
        `}</style>
        {children}
      </body>
    </html>
  );
}
