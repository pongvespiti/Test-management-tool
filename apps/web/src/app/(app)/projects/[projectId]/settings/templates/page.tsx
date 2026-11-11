import type { Metadata } from 'next';
import { TemplatesPage } from '@/features/settings/templates-page';

export const metadata: Metadata = { title: 'Report templates' };

export default function Page() {
  return <TemplatesPage />;
}
