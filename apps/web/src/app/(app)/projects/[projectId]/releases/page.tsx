import type { Metadata } from 'next';
import { ReleasesPage } from '@/features/releases/releases-page';

export const metadata: Metadata = { title: 'Releases' };

export default function Page() {
  return <ReleasesPage />;
}
