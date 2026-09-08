import Book3DTest from '@/components/book3d/Book3DTest';
import packageInfo from '@/package.json';

export default function ThreeTestPage() {
  return <Book3DTest appVersion={packageInfo.version} />;
}
