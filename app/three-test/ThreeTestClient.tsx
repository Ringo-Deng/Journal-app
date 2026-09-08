'use client';

import Book3DTest from '@/components/book3d/Book3DTest';

export default function ThreeTestClient({ appVersion }: { appVersion: string }) {
  return <Book3DTest appVersion={appVersion} />;
}
