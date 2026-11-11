import type { Metadata } from 'next';
import { SessionsPage } from '@/features/sessions/sessions-page';

export const metadata: Metadata = { title: 'Exploratory sessions' };

export default function Page() {
  return <SessionsPage />;
}
