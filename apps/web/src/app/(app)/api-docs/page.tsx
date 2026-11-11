import type { Metadata } from 'next';
import { ApiDocsPage } from '@/features/account/api-docs-page';

export const metadata: Metadata = { title: 'REST API' };

export default function Page() {
  return <ApiDocsPage />;
}
