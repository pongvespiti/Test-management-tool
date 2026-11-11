import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthCard } from '@/features/auth/auth-card';
import { LoginForm } from '@/features/auth/login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <AuthCard title="Sign in" subtitle="Use the account your administrator created for you.">
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
