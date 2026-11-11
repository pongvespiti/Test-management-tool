import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './globals.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { AppProviders } from '@/providers/app-providers';

export const metadata: Metadata = {
  title: { default: 'TMT — Test Management', template: '%s · TMT' },
  description: 'Test case library, test runs, defects and reports',
  icons: { icon: '/favicon.svg' },
};

export const viewport: Viewport = {
  themeColor: '#1971c2',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
