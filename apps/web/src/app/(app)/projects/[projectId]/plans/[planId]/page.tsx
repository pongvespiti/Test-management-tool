import type { Metadata } from 'next';
import { PlanDetailPage } from '@/features/plans/plan-detail-page';

export const metadata: Metadata = { title: 'Test plan' };

export default function Page() {
  return <PlanDetailPage />;
}
