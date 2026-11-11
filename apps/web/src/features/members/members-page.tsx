'use client';

import {
  PROJECT_ROLES,
  ROLE_LABELS,
  ROLE_RANK,
  type MemberDTO,
  type ProjectRole,
  type UserRef,
} from '@tmt/shared';
import { Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { RoleBadge } from '@/components/common/badges';
import { confirmAction } from '@/components/common/confirm-host';
import { QueryState } from '@/components/common/error-alert';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useMembers, useSetMembers } from '@/lib/api/projects';
import { notifyError, notifySuccess } from '@/lib/notify';
import { useAuth } from '@/providers/auth-provider';
import { useProject } from '@/providers/project-provider';
import { AddMemberForm } from './add-member-form';
import { RolesHelp } from './roles-help';

type MemberBody = { userId: number; role: ProjectRole };
const toBody = (list: readonly MemberDTO[]): MemberBody[] =>
  list.map((m) => ({ userId: m.user.id, role: m.role }));

const LAST_LEAD = 'A project needs at least one lead';

/** Leads first, then testers and viewers; by name within a role. */
export function sortMembers(members: readonly MemberDTO[]): MemberDTO[] {
  return members.toSorted(
    (a, b) =>
      ROLE_RANK[b.role] - ROLE_RANK[a.role] || a.user.displayName.localeCompare(b.user.displayName),
  );
}

export function MembersPage() {
  const { project, projectId, can } = useProject();
  const { user: me, isAdmin } = useAuth();
  const members = useMembers(projectId);
  const setMembers = useSetMembers(projectId);
  const canManage = can('manageMembers');

  const list = useMemo(() => sortMembers(members.data ?? []), [members.data]);
  const existingIds = useMemo(() => new Set(list.map((m) => m.user.id)), [list]);
  const leadCount = list.filter((m) => m.role === 'lead').length;

  /** PUT replaces the whole list, so every change sends all members. */
  const save = async (next: MemberBody[], message: string): Promise<boolean> => {
    try {
      await setMembers.mutateAsync({ members: next });
      notifySuccess(message);
      return true;
    } catch (err) {
      notifyError(err, 'Could not update members');
      return false;
    }
  };

  const add = (user: UserRef, role: ProjectRole) =>
    save(
      [...toBody(list), { userId: user.id, role }],
      `${user.displayName} added as ${ROLE_LABELS[role]}.`,
    );

  const changeRole = (m: MemberDTO, role: ProjectRole) => {
    const run = () =>
      save(
        toBody(list).map((x) => (x.userId === m.user.id ? { ...x, role } : x)),
        `${m.user.displayName} is now ${ROLE_LABELS[role]}.`,
      );
    if (m.user.id === me?.id && !isAdmin && role !== 'lead') {
      confirmAction({
        title: 'Change your own role?',
        message:
          'You will no longer be able to manage members, releases or suites of this project.',
        confirmLabel: 'Change my role',
        danger: true,
        onConfirm: run,
      });
    } else void run();
  };

  const remove = (m: MemberDTO) =>
    confirmAction({
      title: `Remove ${m.user.displayName}?`,
      message: 'They lose access to this project. Their results, comments and defects are kept.',
      confirmLabel: 'Remove',
      danger: true,
      onConfirm: () =>
        save(
          toBody(list).filter((x) => x.userId !== m.user.id),
          `${m.user.displayName} removed from ${project.key}.`,
        ),
    });

  return (
    <>
      <PageHeader
        title="Members"
        subtitle={`${project.name} · system administrators have lead access to every project.`}
      />
      <div className="flex flex-col gap-6">
        {canManage && (
          <Card className="px-5">
            <AddMemberForm existingIds={existingIds} busy={setMembers.isPending} onAdd={add} />
          </Card>
        )}
        <Card className="gap-0 py-0">
          <QueryState query={members}>
            <Table className="min-w-[560px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-[200px]">Role</TableHead>
                  {canManage && (
                    <TableHead className="w-[60px]">
                      <span className="sr-only">Remove</span>
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((m) => {
                  const lastLead = m.role === 'lead' && leadCount <= 1;
                  const roleSelect = (
                    <Select
                      value={m.role}
                      onValueChange={(v) => v !== m.role && changeRole(m, v as ProjectRole)}
                      disabled={lastLead || setMembers.isPending}
                    >
                      <SelectTrigger
                        size="sm"
                        className="w-[150px]"
                        aria-label={`Role of ${m.user.displayName}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PROJECT_ROLES.map((r) => (
                          <SelectItem key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  );
                  return (
                    <TableRow key={m.user.id}>
                      <TableCell>
                        <p className="text-sm font-semibold">
                          {m.user.displayName}
                          {m.user.id === me?.id && (
                            <span className="text-xs font-normal text-muted-foreground">
                              {' '}
                              (you)
                            </span>
                          )}
                        </p>
                        <p className="font-mono text-xs text-muted-foreground">{m.user.username}</p>
                      </TableCell>
                      <TableCell>
                        {!canManage ? (
                          <RoleBadge role={m.role} />
                        ) : lastLead ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex">{roleSelect}</span>
                            </TooltipTrigger>
                            <TooltipContent>{LAST_LEAD}</TooltipContent>
                          </Tooltip>
                        ) : (
                          roleSelect
                        )}
                      </TableCell>
                      {canManage && (
                        <TableCell>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex">
                                <Button
                                  type="button"
                                  size="icon-sm"
                                  variant="ghost"
                                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                  aria-label={`Remove ${m.user.displayName}`}
                                  disabled={lastLead || setMembers.isPending}
                                  onClick={() => remove(m)}
                                >
                                  <Trash2 />
                                </Button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              {lastLead ? LAST_LEAD : 'Remove from project'}
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {list.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">No members yet.</p>
            )}
          </QueryState>
        </Card>
        <RolesHelp />
      </div>
    </>
  );
}
