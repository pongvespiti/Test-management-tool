import type { Metadata } from 'next';
import { GeneralSettingsPage } from '@/features/settings/general-settings-page';

export const metadata: Metadata = { title: 'Settings' };

export default function Page() {
  return <GeneralSettingsPage />;
}
