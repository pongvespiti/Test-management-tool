import type { Metadata } from 'next';
import { UsersPage } from '@/features/admin/users-page';
import { RequireAdmin } from '@/features/auth/require-admin';

export const metadata: Metadata = { title: 'Users' };

export default function Page() {
  return (
    <RequireAdmin>
      <UsersPage />
    </RequireAdmin>
  );
}
