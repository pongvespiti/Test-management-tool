import type { Metadata } from 'next';
import { DefectDetailPage } from '@/features/defects/defect-detail-page';

export const metadata: Metadata = { title: 'Defect' };

export default function Page() {
  return <DefectDetailPage />;
}
