import type { Metadata } from 'next';
import { SharedStepsPage } from '@/features/shared-steps/shared-steps-page';

export const metadata: Metadata = { title: 'Shared steps' };

export default function Page() {
  return <SharedStepsPage />;
}
