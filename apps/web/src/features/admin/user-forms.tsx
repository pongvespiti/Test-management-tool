'use client';

import {
  createUserSchema,
  resetPasswordSchema,
  updateUserSchema,
  type CreateUserInput,
  type ResetPasswordInput,
  type UpdateUserInput,
  type UserDTO,
} from '@tmt/shared';
import { CircleCheck, RefreshCw } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useForm, type FieldValues, type Path, type UseFormReturn } from 'react-hook-form';
import { CopyButton } from '@/components/common/copy-button';
import { PasswordInput } from '@/components/common/password-input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DialogFooter } from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ApiError } from '@/lib/api/client';
import {
  useCreateUser,
  useResetPassword,
  useUpdateUser,
  type CreateUserBody,
  type ResetPasswordBody,
  type UpdateUserBody,
} from '@/lib/api/users';
import { formResolver, generatePassword } from '@/lib/forms';
import { notifyError, notifySuccess } from '@/lib/notify';
import { useAuth } from '@/providers/auth-provider';

/** Password field with a "Generate" button next to it. */
function GeneratedPasswordField<V extends FieldValues>({
  form,
  name,
  label,
  description,
}: {
  form: UseFormReturn<V>;
  name: Path<V>;
  label: string;
  description?: string;
}) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <FormControl>
                <PasswordInput
                  autoComplete="new-password"
                  required
                  {...field}
                  value={(field.value as string | undefined) ?? ''}
                />
              </FormControl>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                form.setValue(name, generatePassword() as V[typeof name], {
                  shouldDirty: true,
                  shouldValidate: form.formState.isSubmitted,
                })
              }
            >
              <RefreshCw />
              Generate
            </Button>
          </div>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function CredentialRow({
  label,
  value,
  copyLabel,
}: {
  label: string;
  value: string;
  copyLabel: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-sm text-muted-foreground">{label}</span>
      <code className="rounded-sm bg-card px-1.5 py-0.5 font-mono text-sm text-foreground">
        {value}
      </code>
      <CopyButton value={value} label={copyLabel} />
    </div>
  );
}

/** Shows sign-in details once so the admin can hand them over. */
export function CredentialsNotice({
  title,
  displayName,
  username,
  password,
}: {
  title: string;
  displayName: string;
  username: string;
  password: string;
}) {
  return (
    <Alert variant="success">
      <CircleCheck />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="gap-2">
        <p className="text-foreground">
          Give these sign-in details to {displayName}. They must choose a new password when they
          first sign in. The password is not shown again.
        </p>
        <CredentialRow label="Username" value={username} copyLabel="Copy username" />
        <CredentialRow label="Password" value={password} copyLabel="Copy password" />
      </AlertDescription>
    </Alert>
  );
}

function Done({ children, onDone }: { children: ReactNode; onDone: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      {children}
      <DialogFooter>
        <Button onClick={onDone}>Done</Button>
      </DialogFooter>
    </div>
  );
}

/** Body of the "New user" dialog; after success it shows the initial credentials. */
export function CreateUserForm({ onDone }: { onDone: () => void }) {
  const create = useCreateUser();
  const [initialPassword] = useState(generatePassword);
  const [created, setCreated] = useState<{
    displayName: string;
    username: string;
    password: string;
  } | null>(null);
  const form = useForm<CreateUserBody, unknown, CreateUserInput>({
    resolver: formResolver(createUserSchema),
    defaultValues: {
      username: '',
      displayName: '',
      email: '',
      isAdmin: false,
      isTechnician: false,
      password: initialPassword,
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const user = await create.mutateAsync(values);
      setCreated({
        displayName: user.displayName,
        username: user.username,
        password: values.password,
      });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'USERNAME_TAKEN')
        form.setError('username', { message: 'This username is already taken' });
      else if (err instanceof ApiError && err.code === 'ADMIN_TECHNICIAN')
        form.setError('isTechnician', { message: err.message });
      else notifyError(err, 'Could not create the user');
    }
  });

  if (created)
    return (
      <Done onDone={onDone}>
        <CredentialsNotice title="User created" {...created} />
      </Done>
    );

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="username"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Username</FormLabel>
                <FormControl>
                  <Input required autoComplete="off" autoFocus {...field} />
                </FormControl>
                <FormDescription>Used to sign in</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="displayName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Display name</FormLabel>
                <FormControl>
                  <Input required {...field} />
                </FormControl>
                <FormDescription>Shown in results and reports</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="off" {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <GeneratedPasswordField
          form={form}
          name="password"
          label="Initial password"
          description="At least 8 characters. The user must change it at first sign-in."
        />
        <FormField
          control={form.control}
          name="isAdmin"
          render={({ field }) => (
            <FormItem className="flex items-start gap-3">
              <FormControl>
                <Checkbox
                  checked={field.value === true}
                  onCheckedChange={(c) => field.onChange(c === true)}
                  className="mt-0.5"
                />
              </FormControl>
              <div className="grid gap-1">
                <FormLabel>Administrator</FormLabel>
                <FormDescription>Can manage users and every project</FormDescription>
              </div>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="isTechnician"
          render={({ field }) => (
            <FormItem className="flex items-start gap-3">
              <FormControl>
                <Checkbox
                  checked={field.value === true}
                  onCheckedChange={(c) => field.onChange(c === true)}
                  className="mt-0.5"
                />
              </FormControl>
              <div className="grid gap-1">
                <FormLabel>Technician</FormLabel>
                <FormDescription>
                  Sees only the test stands and handles install / uninstall requests; no projects or
                  test cases
                </FormDescription>
                <FormMessage />
              </div>
            </FormItem>
          )}
        />
        <DialogFooter className="mt-1">
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" loading={create.isPending}>
            Create user
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

/** Body of the "Edit user" dialog. Admins cannot demote or deactivate themselves. */
export function EditUserForm({ user, onDone }: { user: UserDTO; onDone: () => void }) {
  const { user: me } = useAuth();
  const isSelf = me?.id === user.id;
  const update = useUpdateUser();
  const form = useForm<UpdateUserBody, unknown, UpdateUserInput>({
    resolver: formResolver(updateUserSchema),
    defaultValues: {
      displayName: user.displayName,
      email: user.email ?? '',
      isAdmin: user.isAdmin,
      isTechnician: user.isTechnician,
      isActive: user.isActive,
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await update.mutateAsync({ userId: user.id, ...values });
      notifySuccess(`${values.displayName ?? user.displayName} updated.`);
      onDone();
    } catch (err) {
      if (
        err instanceof ApiError &&
        (err.code === 'ADMIN_TECHNICIAN' || err.code === 'USER_HAS_PROJECTS')
      )
        form.setError('isTechnician', { message: err.message });
      else notifyError(err, 'Could not update the user');
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <div className="grid gap-2">
          <Label htmlFor="edit-user-username">Username</Label>
          <Input id="edit-user-username" value={user.username} disabled />
          <p className="text-xs text-muted-foreground">Usernames cannot be changed</p>
        </div>
        <FormField
          control={form.control}
          name="displayName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Display name</FormLabel>
              <FormControl>
                <Input required autoFocus {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="off" {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {(
          [
            {
              name: 'isAdmin',
              label: 'Administrator',
              description: isSelf
                ? 'You cannot remove your own administrator rights'
                : 'Can manage users and every project',
            },
            {
              name: 'isTechnician',
              label: 'Technician',
              description: isSelf
                ? 'You cannot change this for your own account'
                : 'Sees only the test stands; cannot be in projects',
            },
            {
              name: 'isActive',
              label: 'Active',
              description: isSelf
                ? 'You cannot deactivate your own account'
                : 'Inactive users cannot sign in; their history is kept',
            },
          ] as const
        ).map((s) => (
          <FormField
            key={s.name}
            control={form.control}
            name={s.name}
            render={({ field }) => (
              <FormItem className="flex items-start gap-3">
                <FormControl>
                  <Switch
                    checked={field.value === true}
                    onCheckedChange={field.onChange}
                    disabled={isSelf}
                    className="mt-0.5"
                  />
                </FormControl>
                <div className="grid gap-1">
                  <FormLabel>{s.label}</FormLabel>
                  <FormDescription>{s.description}</FormDescription>
                  <FormMessage />
                </div>
              </FormItem>
            )}
          />
        ))}
        <DialogFooter className="mt-1">
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" loading={update.isPending}>
            Save
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

/** Body of the "Reset password" dialog: signs the user out everywhere and forces a change. */
export function ResetPasswordForm({ user, onDone }: { user: UserDTO; onDone: () => void }) {
  const reset = useResetPassword();
  const [initialPassword] = useState(generatePassword);
  const [done, setDone] = useState<string | null>(null);
  const form = useForm<ResetPasswordBody, unknown, ResetPasswordInput>({
    resolver: formResolver(resetPasswordSchema),
    defaultValues: { newPassword: initialPassword },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await reset.mutateAsync({ userId: user.id, newPassword: values.newPassword });
      setDone(values.newPassword);
    } catch (err) {
      notifyError(err, 'Could not reset the password');
    }
  });

  if (done)
    return (
      <Done onDone={onDone}>
        <CredentialsNotice
          title="Password reset"
          displayName={user.displayName}
          username={user.username}
          password={done}
        />
      </Done>
    );

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <p className="text-sm">
          {user.displayName} ({user.username}) will be signed out on every device and must choose a
          new password at next sign-in.
        </p>
        <GeneratedPasswordField form={form} name="newPassword" label="Temporary password" />
        <DialogFooter className="mt-1">
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={reset.isPending}
            className="bg-warning text-white hover:bg-warning/90"
          >
            Reset password
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
