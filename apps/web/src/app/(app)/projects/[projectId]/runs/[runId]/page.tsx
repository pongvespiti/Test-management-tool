import type { Metadata } from 'next';
import { RunPage } from '@/features/runs/run-page';

export const metadata: Metadata = { title: 'Test run' };

export default function Page() {
  return <RunPage />;
}
