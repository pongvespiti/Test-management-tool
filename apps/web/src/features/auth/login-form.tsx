'use client';

import { loginSchema } from '@tmt/shared';
import { TriangleAlert } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { PasswordInput } from '@/components/common/password-input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api/client';
import { formResolver, safeNextPath } from '@/lib/forms';
import { errorMessage } from '@/lib/notify';
import { routes } from '@/lib/routes';
import { useAuth } from '@/providers/auth-provider';

/** Readable message for a failed sign-in. */
export function loginErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'INVALID_CREDENTIALS':
        return 'Wrong username or password.';
      case 'ACCOUNT_LOCKED':
        return 'Too many failed attempts. The account is locked for a few minutes.';
      case 'ACCOUNT_DISABLED':
        return 'This account is disabled. Contact your administrator.';
      case 'RATE_LIMITED':
        return 'Too many sign-in attempts. Wait a minute and try again.';
    }
  }
  return errorMessage(err);
}

export function LoginForm() {
  const { me, login } = useAuth();
  const router = useRouter();
  const next = safeNextPath(useSearchParams().get('next'));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm({
    resolver: formResolver(loginSchema),
    defaultValues: { username: '', password: '' },
  });

  // Already signed in (e.g. opened /login in a second tab).
  useEffect(() => {
    if (me && !submitting) router.replace(next);
  }, [me, submitting, next, router]);

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    setSubmitting(true);
    try {
      const result = await login(values);
      router.replace(result.user.mustChangePassword ? routes.changePassword : next);
    } catch (err) {
      setError(loginErrorMessage(err));
      setSubmitting(false);
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {error && (
          <Alert variant="destructive" role="alert">
            <TriangleAlert />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Username</FormLabel>
              <FormControl>
                <Input autoComplete="username" autoFocus required {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <PasswordInput autoComplete="current-password" required {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" size="lg" className="w-full" loading={submitting}>
          Sign in
        </Button>
      </form>
    </Form>
  );
}
