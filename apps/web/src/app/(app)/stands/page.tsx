import type { Metadata } from 'next';
import { StandsPage } from '@/features/stands/stands-page';

export const metadata: Metadata = { title: 'Test stands' };

export default function Page() {
  return <StandsPage />;
}
