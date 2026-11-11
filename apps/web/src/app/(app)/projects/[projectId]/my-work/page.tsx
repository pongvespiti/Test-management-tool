import type { Metadata } from 'next';
import { MyWorkPage } from '@/features/my-work/my-work-page';

export const metadata: Metadata = { title: 'My work' };

export default function Page() {
  return <MyWorkPage />;
}
