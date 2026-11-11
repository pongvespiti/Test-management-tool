'use client';

import type { ReactNode } from 'react';
import { ConfirmHost } from '@/components/common/confirm-host';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider } from './auth-provider';
import { QueryProvider } from './query-provider';

/** Client-side providers shared by every page. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <AuthProvider>
        <TooltipProvider>
          {children}
          <Toaster />
          <ConfirmHost />
        </TooltipProvider>
      </AuthProvider>
    </QueryProvider>
  );
}
