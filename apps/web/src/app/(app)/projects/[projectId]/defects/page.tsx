import type { Metadata } from 'next';
import { DefectsPage } from '@/features/defects/defects-page';

export const metadata: Metadata = { title: 'Defects' };

export default function Page() {
  return <DefectsPage />;
}
