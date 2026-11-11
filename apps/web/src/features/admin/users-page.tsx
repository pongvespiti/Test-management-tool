'use client';

import type { UserDTO } from '@tmt/shared';
import {
  Ellipsis,
  KeyRound,
  Pencil,
  Plus,
  Shield,
  ShieldOff,
  TicketX,
  UserCheck,
  UserX,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { confirmAction } from '@/components/common/confirm-host';
import { EmptyState } from '@/components/common/empty-state';
import { QueryState } from '@/components/common/error-alert';
import { PageHeader } from '@/components/common/page-header';
import { StatusPill } from '@/components/common/status-pill';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useModalTarget } from '@/hooks/use-modal-target';
import { useRevokeUserTokens, useUpdateUser, useUsers } from '@/lib/api/users';
import { formatDate, formatDateTime, formatRelative } from '@/lib/format';
import { notifyError, notifySuccess } from '@/lib/notify';
import { GRAY, GREEN, ORANGE, VIOLET, type Tone } from '@/lib/status';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import { SearchInput } from '@/components/common/list-controls';
import { CreateUserForm, EditUserForm, ResetPasswordForm } from './user-forms';

type DialogTarget =
  { kind: 'create' } | { kind: 'edit'; user: UserDTO } | { kind: 'reset'; user: UserDTO };

const DIALOG_TITLES: Record<DialogTarget['kind'], string> = {
  create: 'New user',
  edit: 'Edit user',
  reset: 'Reset password',
};

const PASSWORD_DUE: Tone = { fg: ORANGE.fg, bg: '#FFFFFF', border: ORANGE.fg };

/** Users matching the search (name, username, email), active ones unless `showInactive`. */
export function filterUsers(
  users: readonly UserDTO[],
  search: string,
  showInactive: boolean,
): UserDTO[] {
  const q = search.trim().toLowerCase();
  return users
    .filter((u) => showInactive || u.isActive)
    .filter(
      (u) =>
        !q ||
        u.username.toLowerCase().includes(q) ||
        u.displayName.toLowerCase().includes(q) ||
        (u.email ?? '').toLowerCase().includes(q),
    )
    .toSorted((a, b) => a.displayName.localeCompare(b.displayName));
}

export function UsersPage() {
  const { user: me } = useAuth();
  const users = useUsers();
  const update = useUpdateUser();
  const revokeUserTokens = useRevokeUserTokens();
  const dialog = useModalTarget<DialogTarget>();
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const list = useMemo(
    () => filterUsers(users.data ?? [], search, showInactive),
    [users.data, search, showInactive],
  );
  const inactiveCount = (users.data ?? []).filter((u) => !u.isActive).length;

  const patch = async (
    user: UserDTO,
    body: { isAdmin?: boolean; isActive?: boolean },
    message: string,
  ) => {
    try {
      await update.mutateAsync({ userId: user.id, ...body });
      notifySuccess(message);
    } catch (err) {
      notifyError(err, 'Could not update the user');
    }
  };

  const setActive = (user: UserDTO, isActive: boolean) =>
    isActive
      ? void patch(user, { isActive }, `${user.displayName} can sign in again.`)
      : confirmAction({
          title: `Deactivate ${user.displayName}?`,
          message:
            'They can no longer sign in and are signed out now. Their results and defects are kept.',
          confirmLabel: 'Deactivate',
          danger: true,
          onConfirm: () => patch(user, { isActive }, `${user.displayName} was deactivated.`),
        });

  const revokeTokens = (user: UserDTO) =>
    confirmAction({
      title: `Revoke all API tokens of ${user.displayName}?`,
      message:
        'Scripts and CI jobs that use their tokens stop working immediately. They can create new tokens on their API tokens page.',
      confirmLabel: 'Revoke tokens',
      danger: true,
      onConfirm: async () => {
        try {
          await revokeUserTokens.mutateAsync(user.id);
          notifySuccess(`All API tokens of ${user.displayName} were revoked.`);
        } catch (err) {
          notifyError(err, 'Could not revoke the tokens');
        }
      },
    });

  const setAdmin = (user: UserDTO, isAdmin: boolean) =>
    confirmAction({
      title: isAdmin
        ? `Make ${user.displayName} an administrator?`
        : 'Remove administrator rights?',
      message: isAdmin
        ? 'Administrators can manage users and have lead access to every project.'
        : `${user.displayName} keeps only the roles given in each project.`,
      confirmLabel: isAdmin ? 'Make administrator' : 'Remove rights',
      danger: !isAdmin,
      onConfirm: () =>
        patch(
          user,
          { isAdmin },
          isAdmin
            ? `${user.displayName} is now an administrator.`
            : 'Administrator rights removed.',
        ),
    });

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Local accounts. Project roles are given on each project's Members page."
        actions={
          <Button onClick={() => dialog.open({ kind: 'create' })}>
            <Plus />
            New user
          </Button>
        }
      />
      <Card className="gap-0 py-0">
        <div className="flex flex-wrap items-center justify-between gap-4 p-4">
          <SearchInput
            aria-label="Search users"
            placeholder="Search name, username or email"
            value={search}
            onValueChange={setSearch}
            className="w-full sm:w-80"
          />
          <div className="flex items-center gap-2">
            <Switch
              id="users-show-inactive"
              checked={showInactive}
              onCheckedChange={setShowInactive}
            />
            <Label htmlFor="users-show-inactive" className="font-normal">
              Show inactive ({inactiveCount})
            </Label>
          </div>
        </div>
        <QueryState query={users}>
          {list.length === 0 ? (
            <EmptyState
              compact
              title="No users found"
              description="Change the search or show inactive users."
            />
          ) : (
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Access</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last sign-in</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[52px]">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((u) => {
                  const isSelf = me?.id === u.id;
                  return (
                    <TableRow key={u.id} className={cn(!u.isActive && 'opacity-65')}>
                      <TableCell>
                        <p className="text-sm font-semibold">
                          {u.displayName}
                          {isSelf && (
                            <span className="text-xs font-normal text-muted-foreground">
                              {' '}
                              (you)
                            </span>
                          )}
                        </p>
                        <p className="font-mono text-xs text-muted-foreground">{u.username}</p>
                      </TableCell>
                      <TableCell>{u.email ?? '—'}</TableCell>
                      <TableCell>
                        {u.isAdmin ? (
                          <StatusPill tone={VIOLET}>Administrator</StatusPill>
                        ) : (
                          <span className="text-muted-foreground">Project roles</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          <StatusPill tone={u.isActive ? GREEN : GRAY}>
                            {u.isActive ? 'Active' : 'Inactive'}
                          </StatusPill>
                          {u.isActive && u.mustChangePassword && (
                            <StatusPill
                              tone={PASSWORD_DUE}
                              title="Must choose a new password at next sign-in"
                            >
                              Password change due
                            </StatusPill>
                          )}
                        </div>
                      </TableCell>
                      <TableCell title={formatDateTime(u.lastLoginAt)}>
                        {u.lastLoginAt ? formatRelative(u.lastLoginAt) : 'Never'}
                      </TableCell>
                      <TableCell>{formatDate(u.createdAt)}</TableCell>
                      <TableCell>
                        <DropdownMenu modal={false}>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              className="text-muted-foreground"
                              aria-label={`Actions for ${u.displayName}`}
                            >
                              <Ellipsis />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onSelect={() => dialog.open({ kind: 'edit', user: u })}
                            >
                              <Pencil />
                              Edit details
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => dialog.open({ kind: 'reset', user: u })}
                            >
                              <KeyRound />
                              Reset password
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => revokeTokens(u)}>
                              <TicketX />
                              Revoke API tokens
                            </DropdownMenuItem>
                            {!isSelf && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onSelect={() => setAdmin(u, !u.isAdmin)}>
                                  {u.isAdmin ? <ShieldOff /> : <Shield />}
                                  {u.isAdmin ? 'Remove administrator rights' : 'Make administrator'}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  variant={u.isActive ? 'destructive' : 'default'}
                                  onSelect={() => setActive(u, !u.isActive)}
                                >
                                  {u.isActive ? <UserX /> : <UserCheck />}
                                  {u.isActive ? 'Deactivate' : 'Reactivate'}
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </QueryState>
      </Card>

      {dialog.target && (
        <Dialog open={dialog.opened} onOpenChange={(o) => !o && dialog.close()}>
          <DialogContent className="sm:max-w-[620px]">
            <DialogHeader>
              <DialogTitle>{DIALOG_TITLES[dialog.target.kind]}</DialogTitle>
              <DialogDescription className="sr-only">
                {dialog.target.kind === 'create'
                  ? 'Create a local account with an initial password.'
                  : `Account of ${dialog.target.user.displayName}.`}
              </DialogDescription>
            </DialogHeader>
            {dialog.target.kind === 'create' && (
              <CreateUserForm key={dialog.key} onDone={dialog.close} />
            )}
            {dialog.target.kind === 'edit' && (
              <EditUserForm key={dialog.key} user={dialog.target.user} onDone={dialog.close} />
            )}
            {dialog.target.kind === 'reset' && (
              <ResetPasswordForm key={dialog.key} user={dialog.target.user} onDone={dialog.close} />
            )}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
