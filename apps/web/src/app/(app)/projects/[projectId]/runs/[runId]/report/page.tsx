import type { Metadata } from 'next';
import { RunReportPage } from '@/features/runs/run-report-page';

export const metadata: Metadata = { title: 'Run report' };

export default function Page() {
  return <RunReportPage />;
}
