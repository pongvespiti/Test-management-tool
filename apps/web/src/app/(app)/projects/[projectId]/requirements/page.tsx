import type { Metadata } from 'next';
import { RequirementsPage } from '@/features/requirements/requirements-page';

export const metadata: Metadata = { title: 'Requirements' };

export default function Page() {
  return <RequirementsPage />;
}
