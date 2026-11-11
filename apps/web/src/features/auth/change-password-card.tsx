'use client';

import { useAuth } from '@/providers/auth-provider';
import { AuthCard } from './auth-card';
import { ChangePasswordForm } from './change-password-form';

export function ChangePasswordCard() {
  const { user } = useAuth();
  return (
    <AuthCard
      title="Change password"
      subtitle={user ? `Signed in as ${user.displayName} (${user.username})` : undefined}
    >
      <ChangePasswordForm />
    </AuthCard>
  );
}
