'use client';

import type { SessionListItemDTO, SessionStatus } from '@tmt/shared';
import { SESSION_STATUSES, SESSION_STATUS_LABELS } from '@tmt/shared';
import { Compass, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { EmptyState } from '@/components/common/empty-state';
import { QueryState } from '@/components/common/error-alert';
import { SegmentedControl } from '@/components/common/list-controls';
import { MonoId } from '@/components/common/mono-id';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useModalTarget } from '@/hooks/use-modal-target';
import { useUrlSearchParams } from '@/hooks/use-url-search-params';
import { useSessions } from '@/lib/api/sessions';
import { formatRelative } from '@/lib/format';
import { routes } from '@/lib/routes';
import { useAuth } from '@/providers/auth-provider';
import { useProject } from '@/providers/project-provider';
import { UserAvatar } from '../collab/user-avatar';
import { SessionStatusBadge } from './session-badges';
import { formatMinutes, timeBox } from './session-format';
import { SessionForm } from './session-form';

type Filter = SessionStatus | 'all';
const FILTERS: Filter[] = ['all', ...SESSION_STATUSES];

function parseFilter(value: string | null): Filter {
  return FILTERS.find((f) => f === value) ?? 'all';
}

/** Re-renders every `ms` so running sessions show their elapsed time. */
export function useNow(ms = 30_000, active = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms, active]);
  return now;
}

/** Route `/projects/[projectId]/sessions`: exploratory sessions of the project. */
export function SessionsPage() {
  const { project, projectId, can } = useProject();
  const { user } = useAuth();
  const router = useRouter();
  const [params, setParams] = useUrlSearchParams();
  const status = parseFilter(params.get('status'));
  const mine = params.get('mine') === '1';
  const creator = useModalTarget<'new'>();
  const query = useSessions(projectId, {
    status: status === 'all' ? undefined : status,
    ownerId: mine && user ? user.id : undefined,
  });
  const items = query.data ?? [];
  const now = useNow(
    30_000,
    items.some((s) => s.status === 'in_progress'),
  );

  const update = (patch: Record<string, string | null>) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      return next;
    });

  return (
    <>
      <PageHeader
        eyebrow={project.name}
        title="Exploratory sessions"
        subtitle="Unscripted, time-boxed testing with a charter — notes and defects stay with the session"
        actions={
          can('execute') && (
            <Button onClick={() => creator.open('new')}>
              <Plus /> New session
            </Button>
          )
        }
      />
      <div
        role="group"
        aria-label="Session filters"
        className="mb-4 flex flex-wrap items-center gap-3"
      >
        <SegmentedControl
          aria-label="Status"
          value={status}
          onChange={(v) => update({ status: v === 'all' ? null : v })}
          options={FILTERS.map((f) => ({
            value: f,
            label: f === 'all' ? 'All' : SESSION_STATUS_LABELS[f],
          }))}
        />
        <SegmentedControl
          aria-label="Owner"
          value={mine ? 'mine' : 'everyone'}
          onChange={(v) => update({ mine: v === 'mine' ? '1' : null })}
          options={[
            { value: 'everyone', label: 'Everyone' },
            { value: 'mine', label: 'Mine' },
          ]}
        />
      </div>
      <QueryState query={query}>
        {items.length === 0 ? (
          <EmptyState
            icon={<Compass className="size-6" strokeWidth={1.6} />}
            title={status === 'all' && !mine ? 'No exploratory sessions yet' : 'No sessions match'}
            description="Start a session when you test without a script — for example after an unexpected result — and record what you find."
            action={
              can('execute') ? (
                <Button onClick={() => creator.open('new')}>
                  <Plus /> New session
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table className="min-w-[960px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[88px]">Key</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead className="w-[112px]">Status</TableHead>
                  <TableHead className="w-[150px]">Tester</TableHead>
                  <TableHead className="w-[170px]">Release / build</TableHead>
                  <TableHead className="w-[130px]">Time</TableHead>
                  <TableHead className="w-[64px] text-right">Notes</TableHead>
                  <TableHead className="w-[72px] text-right">Defects</TableHead>
                  <TableHead className="w-[104px]">Started</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((s) => (
                  <SessionRow
                    key={s.id}
                    session={s}
                    now={now}
                    onOpen={() => router.push(routes.session(projectId, s.id))}
                    href={routes.session(projectId, s.id)}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </QueryState>
      {creator.opened && (
        <SessionForm
          key={creator.key}
          session={null}
          onClose={creator.close}
          onSaved={(saved) => router.push(routes.session(projectId, saved.id))}
        />
      )}
    </>
  );
}

function SessionRow({
  session: s,
  now,
  onOpen,
  href,
}: {
  session: SessionListItemDTO;
  now: number;
  onOpen: () => void;
  href: string;
}) {
  const box = timeBox(s, now);
  return (
    <TableRow className="cursor-pointer" onClick={onOpen}>
      <TableCell>
        <MonoId>{s.key}</MonoId>
      </TableCell>
      <TableCell className="font-medium">
        <Link href={href} className="hover:underline" onClick={(e) => e.stopPropagation()}>
          {s.title}
        </Link>
      </TableCell>
      <TableCell>
        <SessionStatusBadge status={s.status} />
      </TableCell>
      <TableCell>
        {s.owner ? (
          <span className="flex items-center gap-2">
            <UserAvatar user={s.owner} size={22} />
            <span className="truncate">{s.owner.displayName}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-sm">
        {s.release ? (
          <>
            {s.release.name}
            {s.build && <span className="text-muted-foreground"> · {s.build.name}</span>}
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-sm">
        {s.startedAt ? (
          <span className={box.state === 'over' ? 'font-semibold text-destructive' : undefined}>
            {formatMinutes(box.used)}
            {s.timeBoxMinutes ? ` / ${formatMinutes(s.timeBoxMinutes)}` : ''}
          </span>
        ) : s.timeBoxMinutes ? (
          <span className="text-muted-foreground">{formatMinutes(s.timeBoxMinutes)} box</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">{s.noteCount}</TableCell>
      <TableCell className="text-right tabular-nums">{s.defectCount}</TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {s.startedAt ? formatRelative(s.startedAt) : '—'}
      </TableCell>
    </TableRow>
  );
}
