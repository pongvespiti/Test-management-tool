import type { Metadata } from 'next';
import { ApiTokensPage } from '@/features/account/api-tokens-page';

export const metadata: Metadata = { title: 'API tokens' };

export default function Page() {
  return <ApiTokensPage />;
}
