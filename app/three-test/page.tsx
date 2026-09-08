import ThreeTestClient from './ThreeTestClient';
import packageInfo from '@/package.json';

export default function ThreeTestPage() {
  return <ThreeTestClient appVersion={packageInfo.version} />;
}
