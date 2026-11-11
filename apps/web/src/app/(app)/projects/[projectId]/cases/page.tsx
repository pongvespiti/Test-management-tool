import type { Metadata } from 'next';
import { CasesPage } from '@/features/cases/cases-page';

export const metadata: Metadata = { title: 'Test cases' };

export default function Page() {
  return <CasesPage />;
}
