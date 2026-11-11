'use client';

import { PASSWORD_MIN, passwordSchema } from '@tmt/shared';
import { Info } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { PasswordInput } from '@/components/common/password-input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useChangePassword } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import { formResolver } from '@/lib/forms';
import { errorMessage, notifySuccess } from '@/lib/notify';
import { routes } from '@/lib/routes';
import { useAuth } from '@/providers/auth-provider';

/** Form model: the API body plus the repeated new password. */
export const changePasswordFormSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: passwordSchema,
    confirm: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.newPassword && v.newPassword === v.currentPassword) {
      ctx.addIssue({
        code: 'custom',
        path: ['newPassword'],
        message: 'Choose a password different from the current one',
      });
    }
    if (v.confirm !== v.newPassword) {
      ctx.addIssue({ code: 'custom', path: ['confirm'], message: 'Passwords do not match' });
    }
  });

export function ChangePasswordForm() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const change = useChangePassword();
  const forced = user?.mustChangePassword ?? false;

  const form = useForm({
    resolver: formResolver(changePasswordFormSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirm: '' },
  });

  const onSubmit = form.handleSubmit(async ({ currentPassword, newPassword }) => {
    try {
      await change.mutateAsync({ currentPassword, newPassword });
      notifySuccess('Your password was changed.');
      router.replace(routes.home);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'WRONG_PASSWORD') {
        form.setError('currentPassword', { message: 'Current password is wrong' });
      } else {
        form.setError('newPassword', { message: errorMessage(err) });
      }
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {forced && (
          <Alert variant="info">
            <Info />
            <AlertDescription>Please set your own password before you continue.</AlertDescription>
          </Alert>
        )}
        <FormField
          control={form.control}
          name="currentPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Current password</FormLabel>
              <FormControl>
                <PasswordInput autoComplete="current-password" required {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="newPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>New password</FormLabel>
              <FormControl>
                <PasswordInput autoComplete="new-password" required {...field} />
              </FormControl>
              <FormDescription>At least {PASSWORD_MIN} characters</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirm"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Repeat new password</FormLabel>
              <FormControl>
                <PasswordInput autoComplete="new-password" required {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="mt-1 flex items-center justify-between">
          {forced ? (
            <Button
              type="button"
              variant="ghost"
              onClick={async () => {
                await logout();
                router.replace(routes.login());
              }}
            >
              Sign out
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
          )}
          <Button type="submit" loading={change.isPending}>
            Change password
          </Button>
        </div>
      </form>
    </Form>
  );
}
