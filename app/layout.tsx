import type { Metadata } from 'next';
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
      <head><link rel="stylesheet" href="/api/fonts.css" data-user-fonts="true" /></head>
      <body>{children}</body>
    </html>
  );
}
