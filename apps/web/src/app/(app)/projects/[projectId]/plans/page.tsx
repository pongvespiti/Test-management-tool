import type { Metadata } from 'next';
import { PlansPage } from '@/features/plans/plans-page';

export const metadata: Metadata = { title: 'Test plans' };

export default function Page() {
  return <PlansPage />;
}
