import type { Metadata } from 'next';
import { SessionDetailPage } from '@/features/sessions/session-detail-page';

export const metadata: Metadata = { title: 'Exploratory session' };

export default function Page() {
  return <SessionDetailPage />;
}
