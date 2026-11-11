import type { Metadata } from 'next';
import { ImportPage } from '@/features/import/import-page';

export const metadata: Metadata = { title: 'Import from Excel' };

export default function Page() {
  return <ImportPage />;
}
