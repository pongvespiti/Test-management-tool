import type { Metadata } from 'next';
import { EnvListsPage } from '@/features/settings/env-lists-page';

export const metadata: Metadata = { title: 'Environment lists' };

export default function Page() {
  return <EnvListsPage />;
}
