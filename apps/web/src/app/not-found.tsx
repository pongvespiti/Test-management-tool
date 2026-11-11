import type { Metadata } from 'next';
import { FullPage } from '@/components/common/full-page';
import { NotFoundState } from '@/components/common/not-found-state';

export const metadata: Metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <FullPage>
      <NotFoundState />
    </FullPage>
  );
}
