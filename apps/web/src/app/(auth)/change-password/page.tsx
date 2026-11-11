import type { Metadata } from 'next';
import { ChangePasswordCard } from '@/features/auth/change-password-card';
import { RequireAuth } from '@/features/auth/require-auth';

export const metadata: Metadata = { title: 'Change password' };

export default function ChangePasswordPage() {
  return (
    <RequireAuth>
      <ChangePasswordCard />
    </RequireAuth>
  );
}
