import type { Metadata } from 'next';
import { SuitesSettingsPage } from '@/features/suites/suites-settings-page';

export const metadata: Metadata = { title: 'Suites & fields' };

export default function Page() {
  return <SuitesSettingsPage />;
}
