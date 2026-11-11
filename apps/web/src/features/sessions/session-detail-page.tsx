'use client';

import type { SessionDTO, SessionNoteKind } from '@tmt/shared';
import { SESSION_NOTE_KINDS, SESSION_NOTE_KIND_LABELS } from '@tmt/shared';
import { Pencil, Pause, Play, RotateCcw, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';
import { DefectStatusBadge, SeverityLabel } from '@/components/common/badges';
import { ComboboxSelect } from '@/components/common/combobox-select';
import { confirmDelete } from '@/components/common/confirm-host';
import { EnvGrid } from '@/components/common/env-grid';
import { ErrorAlert, Spinner } from '@/components/common/error-alert';
import { SegmentedControl } from '@/components/common/list-controls';
import { MonoId } from '@/components/common/mono-id';
import { MultilineText } from '@/components/common/multiline-text';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useModalTarget } from '@/hooks/use-modal-target';
import { ApiError } from '@/lib/api/client';
import { useDefects } from '@/lib/api/defects';
import {
  useAddSessionNote,
  useDeleteSession,
  useLinkSessionDefect,
  useRemoveSessionNote,
  useSession,
  useSessionAction,
  useUnlinkSessionDefect,
  useUpdateSession,
  type SessionAction,
} from '@/lib/api/sessions';
import { formatDateTime, formatRelative } from '@/lib/format';
import { toId } from '@/lib/forms';
import { notifyError, notifySuccess } from '@/lib/notify';
import { routes } from '@/lib/routes';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import { useProject } from '@/providers/project-provider';
import { UserAvatar } from '../collab/user-avatar';
import { FieldLabel } from '../runs/run-ui';
import { SectionCard } from '../reports/report-ui';
import { NoteKindBadge, SessionStatusBadge } from './session-badges';
import { formatMinutes, timeBox } from './session-format';
import { SessionForm } from './session-form';
import { useNow } from './sessions-page';

/** Route `/projects/[projectId]/sessions/[sessionId]`. */
export function SessionDetailPage() {
  const { projectId } = useProject();
  const params = useParams<{ sessionId?: string | string[] }>();
  const raw = params?.sessionId;
  const sessionId = toId(Array.isArray(raw) ? raw[0] : raw);
  const session = useSession(projectId, sessionId);
  const crumbs = [{ label: 'Exploratory', href: routes.sessions(projectId) }];

  if (sessionId === null)
    return (
      <>
        <PageHeader title="Session" breadcrumbs={crumbs} />
        <ErrorAlert error={new Error('This session address is not valid.')} title="Not found" />
      </>
    );
  if (session.isPending)
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  if (session.isError || !session.data)
    return (
      <>
        <PageHeader title="Session" breadcrumbs={[...crumbs, { label: `#${sessionId}` }]} />
        <div className="flex max-w-[560px] flex-col gap-4">
          <ErrorAlert error={session.error} onRetry={() => void session.refetch()} />
          <Button asChild variant="outline" className="w-fit">
            <Link href={routes.sessions(projectId)}>Back to sessions</Link>
          </Button>
        </div>
      </>
    );
  return <SessionDetail session={session.data} />;
}

const ACTIONS: Record<SessionAction, { label: string; done: string; icon: ReactNode }> = {
  start: { label: 'Start session', done: 'started', icon: <Play /> },
  complete: { label: 'Complete session', done: 'completed', icon: <Pause /> },
  resume: { label: 'Resume session', done: 'resumed', icon: <RotateCcw /> },
};

function SessionDetail({ session }: { session: SessionDTO }) {
  const { projectId, can, role } = useProject();
  const { user } = useAuth();
  const router = useRouter();
  const editor = useModalTarget<'edit'>();
  const act = useSessionAction(projectId);
  const remove = useDeleteSession(projectId);
  const running = session.status === 'in_progress';
  const now = useNow(15_000, running);
  const box = timeBox(session, now);
  const canExecute = can('execute');
  const canDelete =
    canExecute &&
    (role === 'lead' || user?.id === session.owner?.id || user?.id === session.createdBy?.id);

  const next: SessionAction | null =
    session.status === 'planned' ? 'start' : running ? 'complete' : 'resume';

  const run = async (action: SessionAction) => {
    try {
      await act.mutateAsync({ sessionId: session.id, action });
      notifySuccess(`${session.key} ${ACTIONS[action].done}.`);
    } catch (err) {
      notifyError(err, `Could not ${action} the session`);
    }
  };

  const del = () =>
    confirmDelete(
      `session ${session.key}`,
      async () => {
        try {
          await remove.mutateAsync(session.id);
          notifySuccess(`${session.key} deleted.`);
          router.push(routes.sessions(projectId));
        } catch (err) {
          notifyError(err, 'Could not delete the session');
        }
      },
      'Its notes and defect links are deleted with it; the defects stay.',
    );

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Exploratory', href: routes.sessions(projectId) },
          { label: session.key },
        ]}
        eyebrow={<MonoId>{session.key}</MonoId>}
        badges={<SessionStatusBadge status={session.status} />}
        title={session.title}
        actions={
          canExecute && (
            <>
              <Button variant="outline" onClick={() => editor.open('edit')}>
                <Pencil /> Edit
              </Button>
              {canDelete && (
                <Button variant="outline" onClick={del} aria-label="Delete session">
                  <Trash2 /> Delete
                </Button>
              )}
              {next && (
                <Button onClick={() => void run(next)} loading={act.isPending}>
                  {ACTIONS[next].icon}
                  {ACTIONS[next].label}
                </Button>
              )}
            </>
          )
        }
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-5">
          <SectionCard title="Charter">
            <div className="flex flex-col gap-4">
              <MultilineText value={session.charter} empty="No charter written." />
              {session.references && (
                <div className="flex flex-col gap-1">
                  <FieldLabel>References</FieldLabel>
                  <p className="text-sm">{session.references}</p>
                </div>
              )}
              <div className="flex flex-col gap-2">
                <FieldLabel>Test environment</FieldLabel>
                <EnvGrid entries={session.environment} />
              </div>
            </div>
          </SectionCard>
          <NotesSection session={session} canWrite={canExecute} />
          <DebriefSection session={session} canWrite={canExecute} />
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <SectionCard title="Session">
            <div className="flex flex-col gap-4">
              <TimerBlock session={session} used={box.used} state={box.state} ratio={box.ratio} />
              <dl className="m-0 grid grid-cols-[100px_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Tester</dt>
                <dd className="m-0 flex items-center gap-2">
                  {session.owner ? (
                    <>
                      <UserAvatar user={session.owner} size={22} />
                      {session.owner.displayName}
                    </>
                  ) : (
                    '—'
                  )}
                </dd>
                <dt className="text-muted-foreground">Release</dt>
                <dd className="m-0">{session.release?.name ?? '—'}</dd>
                <dt className="text-muted-foreground">Build</dt>
                <dd className="m-0">{session.build?.name ?? '—'}</dd>
                <dt className="text-muted-foreground">Started</dt>
                <dd className="m-0">
                  {session.startedAt ? formatDateTime(session.startedAt) : '—'}
                </dd>
                <dt className="text-muted-foreground">Ended</dt>
                <dd className="m-0">{session.endedAt ? formatDateTime(session.endedAt) : '—'}</dd>
              </dl>
            </div>
          </SectionCard>
          <DefectsSection session={session} canWrite={canExecute} />
        </div>
      </div>
      {editor.opened && <SessionForm key={editor.key} session={session} onClose={editor.close} />}
    </>
  );
}

function TimerBlock({
  session,
  used,
  state,
  ratio,
}: {
  session: SessionDTO;
  used: number;
  state: 'none' | 'within' | 'near' | 'over';
  ratio: number;
}) {
  if (!session.startedAt)
    return (
      <p className="text-sm text-muted-foreground">
        Not started.
        {session.timeBoxMinutes ? ` Time box ${formatMinutes(session.timeBoxMinutes)}.` : ''}
      </p>
    );
  const color =
    state === 'over' ? 'bg-destructive' : state === 'near' ? 'bg-[#E8590C]' : 'bg-primary';
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-2xl font-semibold tabular-nums" data-testid="session-elapsed">
          {formatMinutes(used)}
        </span>
        {session.timeBoxMinutes ? (
          <span className="text-sm text-muted-foreground">
            of {formatMinutes(session.timeBoxMinutes)}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">no time box</span>
        )}
      </div>
      {session.timeBoxMinutes ? (
        <>
          <div
            role="progressbar"
            aria-label="Time box used"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(100, Math.round(ratio * 100))}
            className="h-2 overflow-hidden rounded-full bg-muted"
          >
            <div
              className={cn('h-full', color)}
              style={{ width: `${Math.min(100, ratio * 100)}%` }}
            />
          </div>
          {state === 'over' && session.status === 'in_progress' && (
            <p className="text-sm font-medium text-destructive">
              Time box passed — wrap up or complete the session.
            </p>
          )}
        </>
      ) : null}
    </div>
  );
}

function NotesSection({ session, canWrite }: { session: SessionDTO; canWrite: boolean }) {
  const { projectId, role } = useProject();
  const { user } = useAuth();
  const add = useAddSessionNote(projectId);
  const remove = useRemoveSessionNote(projectId);
  const [kind, setKind] = useState<SessionNoteKind>('note');
  const [body, setBody] = useState('');
  const completed = session.status === 'completed';

  const submit = async () => {
    const text = body.trim();
    if (!text) return;
    try {
      await add.mutateAsync({ sessionId: session.id, kind, body: text });
      setBody('');
      setKind('note');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'SESSION_COMPLETED')
        notifyError(err, 'The session is completed — resume it to add notes');
      else notifyError(err, 'Could not add the note');
    }
  };

  return (
    <SectionCard title="Notes" subtitle={`${session.notes.length} in order of time`}>
      <div className="flex flex-col gap-4">
        {canWrite && (
          <div className="flex flex-col gap-2">
            <SegmentedControl
              aria-label="Note kind"
              value={kind}
              onChange={setKind}
              options={SESSION_NOTE_KINDS.map((k) => ({
                value: k,
                label: SESSION_NOTE_KIND_LABELS[k],
              }))}
            />
            <Textarea
              aria-label="New note"
              rows={2}
              value={body}
              disabled={completed}
              placeholder={
                completed
                  ? 'The session is completed — resume it to add notes'
                  : 'What did you try, see or wonder? Ctrl+Enter to add'
              }
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  void submit();
                }
              }}
            />
            <div className="flex justify-end">
              <Button
                onClick={() => void submit()}
                loading={add.isPending}
                disabled={completed || body.trim() === ''}
              >
                Add note
              </Button>
            </div>
          </div>
        )}
        {session.notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notes yet.</p>
        ) : (
          <ol className="m-0 flex list-none flex-col gap-3 p-0">
            {session.notes.map((n) => {
              const mayDelete = canWrite && (role === 'lead' || n.author?.id === user?.id);
              return (
                <li key={n.id} className="flex gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <NoteKindBadge kind={n.kind} />
                      <span>{n.author?.displayName ?? 'Unknown'}</span>
                      <span title={formatDateTime(n.createdAt)}>{formatRelative(n.createdAt)}</span>
                    </div>
                    <MultilineText value={n.body} />
                  </div>
                  {mayDelete && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete note"
                      loading={remove.isPending && remove.variables?.noteId === n.id}
                      onClick={() =>
                        remove
                          .mutateAsync({ sessionId: session.id, noteId: n.id })
                          .catch((err) => notifyError(err, 'Could not delete the note'))
                      }
                    >
                      <X />
                    </Button>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </SectionCard>
  );
}

function DebriefSection({ session, canWrite }: { session: SessionDTO; canWrite: boolean }) {
  const { projectId } = useProject();
  const update = useUpdateSession(projectId);
  const [text, setText] = useState(session.summary ?? '');
  const dirty = text.trim() !== (session.summary ?? '').trim();

  const save = async () => {
    try {
      await update.mutateAsync({ sessionId: session.id, summary: text.trim() });
      notifySuccess('Debrief saved.');
    } catch (err) {
      notifyError(err, 'Could not save the debrief');
    }
  };

  return (
    <SectionCard title="Debrief" subtitle="What was found, what is left, what to do next">
      <div className="flex flex-col gap-3">
        {canWrite ? (
          <>
            <Textarea
              aria-label="Debrief"
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Summary for the team"
            />
            <div className="flex justify-end">
              <Button onClick={() => void save()} loading={update.isPending} disabled={!dirty}>
                Save debrief
              </Button>
            </div>
          </>
        ) : (
          <MultilineText value={session.summary} empty="No debrief written." />
        )}
      </div>
    </SectionCard>
  );
}

function DefectsSection({ session, canWrite }: { session: SessionDTO; canWrite: boolean }) {
  const { projectId } = useProject();
  const unlink = useUnlinkSessionDefect(projectId);

  return (
    <SectionCard title="Defects found" subtitle={`${session.defects.length} linked`}>
      <div className="flex flex-col gap-3">
        {session.defects.length === 0 ? (
          <p className="text-sm text-muted-foreground">No defects linked.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {session.defects.map((d) => (
              <li key={d.id} className="flex items-center gap-2 text-sm">
                <Link
                  href={routes.defect(projectId, d.id)}
                  className="flex min-w-0 flex-1 flex-col gap-0.5 hover:underline"
                >
                  <span className="flex items-center gap-2">
                    <MonoId>{d.key}</MonoId>
                    <DefectStatusBadge status={d.status} />
                    <SeverityLabel severity={d.severity} />
                  </span>
                  <span className="truncate">{d.title}</span>
                </Link>
                {canWrite && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Unlink ${d.key}`}
                    onClick={() =>
                      unlink
                        .mutateAsync({ sessionId: session.id, defectId: d.id })
                        .catch((err) => notifyError(err, 'Could not unlink the defect'))
                    }
                  >
                    <X />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {canWrite && <DefectPicker session={session} />}
      </div>
    </SectionCard>
  );
}

/** Links a defect of the project (the 100 newest not yet linked) to the session. */
function DefectPicker({ session }: { session: SessionDTO }) {
  const { projectId } = useProject();
  const link = useLinkSessionDefect(projectId);
  const defects = useDefects(projectId, { pageSize: 100 });
  const linked = useMemo(() => new Set(session.defects.map((d) => d.id)), [session.defects]);
  const options = (defects.data?.items ?? [])
    .filter((d) => !linked.has(d.id))
    .map((d) => ({ value: String(d.id), label: `${d.key} · ${d.title}` }));

  return (
    <>
      <ComboboxSelect
        aria-label="Link a defect"
        options={options}
        value={null}
        onChange={(v) => {
          const defectId = toId(v);
          if (defectId === null) return;
          link
            .mutateAsync({ sessionId: session.id, defectId })
            .catch((err) => notifyError(err, 'Could not link the defect'));
        }}
        placeholder="Link an existing defect…"
        searchPlaceholder="Search defects"
        emptyText="No other defects"
      />
      <p className="text-xs text-muted-foreground">
        Report a new defect on the{' '}
        <Link className="underline" href={routes.defects(projectId)}>
          Defects page
        </Link>
        , then link it here.
      </p>
    </>
  );
}
