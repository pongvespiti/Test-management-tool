'use client';

import {
  STAND_REQUEST_KIND_LABELS,
  STAND_REQUEST_STATUS_LABELS,
  type StandRequestDTO,
} from '@tmt/shared';
import { Wrench } from 'lucide-react';
import { useState } from 'react';
import { DateInput } from '@/components/common/date-input';
import { EmptyState } from '@/components/common/empty-state';
import { QueryState } from '@/components/common/error-alert';
import { SegmentedControl } from '@/components/common/list-controls';
import { StatusPill } from '@/components/common/status-pill';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useStandRequestAction, useStandRequests } from '@/lib/api/stands';
import { formatDate, formatRelative } from '@/lib/format';
import { notifyError, notifySuccess } from '@/lib/notify';
import { STAND_REQUEST_STATUS_TONES } from '@/lib/status';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

type Action = 'accept' | 'reject' | 'done';
/** The request a notification opened comes into view once it is listed. */
const scrollTo = (el: HTMLLIElement | null) => el?.scrollIntoView({ block: 'center' });
const isOpen = (r: StandRequestDTO) => r.status === 'requested' || r.status === 'accepted';

export function describeRequest(r: StandRequestDTO): string {
  const what = STAND_REQUEST_KIND_LABELS[r.kind];
  return r.model ? `${what} ${r.model}` : what;
}

/**
 * Install / uninstall requests. Technicians see the ones sent to them with Accept / Reject / Done;
 * testers see the ones they sent and can cancel while open.
 */
export function StandRequests({
  highlight,
  standId,
  compact = false,
}: {
  /** Request to scroll to and mark (from a notification link). */
  highlight?: number | null;
  /** Only this stand (stand dialog). */
  standId?: number;
  compact?: boolean;
}) {
  const { user, isTechnician } = useAuth();
  const [scope, setScope] = useState<'mine' | 'all'>(standId ? 'all' : 'mine');
  const [status, setStatus] = useState<'open' | 'any'>(standId ? 'any' : 'open');
  const query = useStandRequests({
    scope,
    status: status === 'open' ? 'open' : undefined,
    standId,
  });
  const act = useStandRequestAction();
  const [dialog, setDialog] = useState<{ request: StandRequestDTO; action: Action } | null>(null);
  const items = query.data ?? [];

  const cancel = async (r: StandRequestDTO) => {
    try {
      await act.mutateAsync({ requestId: r.id, action: 'cancel' });
      notifySuccess('Request cancelled.');
    } catch (err) {
      notifyError(err, 'Could not cancel the request');
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {!standId && (
        <div role="group" aria-label="Request filters" className="flex flex-wrap gap-3">
          <SegmentedControl
            aria-label="Whose requests"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'mine', label: isTechnician ? 'Sent to me' : 'Mine' },
              { value: 'all', label: 'Everyone' },
            ]}
          />
          <SegmentedControl
            aria-label="Request status"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'open', label: 'Open' },
              { value: 'any', label: 'All' },
            ]}
          />
        </div>
      )}
      <QueryState query={query}>
        {items.length === 0 ? (
          <EmptyState
            compact={compact}
            icon={<Wrench className="size-6" strokeWidth={1.6} />}
            title={status === 'open' ? 'No open requests' : 'No requests'}
            description={
              isTechnician
                ? 'Requests to install or uninstall units on stands show up here, with a notification.'
                : 'Ask a technician to install, uninstall or replace a unit from a stand card or the button above.'
            }
          />
        ) : (
          <ul aria-label="Stand requests" className="flex flex-col gap-2">
            {items.map((r) => {
              const mineToDo = isOpen(r) && (r.technician.id === user?.id || !!user?.isAdmin);
              const mineToCancel = isOpen(r) && (r.requestedBy.id === user?.id || !!user?.isAdmin);
              const isMarked = highlight === r.id;
              return (
                <li
                  key={r.id}
                  ref={isMarked ? scrollTo : undefined}
                  aria-current={isMarked ? 'true' : undefined}
                  className={cn(
                    'flex flex-wrap items-start gap-3 rounded-xl border bg-card p-3',
                    isMarked && 'border-primary ring-2 ring-primary/30',
                  )}
                >
                  <div className="flex min-w-[240px] flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill tone={STAND_REQUEST_STATUS_TONES[r.status]}>
                        {STAND_REQUEST_STATUS_LABELS[r.status]}
                      </StatusPill>
                      <span className="font-semibold">{describeRequest(r)}</span>
                      <span className="text-sm text-muted-foreground">
                        at <span className="font-mono">{r.standCode}</span> · {r.zoneName}
                      </span>
                    </div>
                    <p className="text-sm">
                      {r.status === 'accepted' || r.status === 'done' ? (
                        <>
                          On <strong>{formatDate(r.scheduledDate)}</strong>
                          {r.scheduledDate !== r.requestedDate && (
                            <span className="text-muted-foreground">
                              {' '}
                              (asked for {formatDate(r.requestedDate)})
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          Asked for <strong>{formatDate(r.requestedDate)}</strong>
                        </>
                      )}
                      <span className="text-muted-foreground">
                        {' '}
                        · {r.requestedBy.displayName} → {r.technician.displayName}
                        {r.project && ` · ${r.project.key}`}
                      </span>
                    </p>
                    {r.note && <p className="text-sm text-muted-foreground">“{r.note}”</p>}
                    {r.technicianNote && (
                      <p className="text-sm">
                        <span className="text-muted-foreground">Technician: </span>
                        {r.technicianNote}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Updated {formatRelative(r.updatedAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {mineToDo && r.status === 'requested' && (
                      <Button size="sm" onClick={() => setDialog({ request: r, action: 'accept' })}>
                        Accept
                      </Button>
                    )}
                    {mineToDo && (
                      <Button
                        size="sm"
                        variant={r.status === 'accepted' ? 'default' : 'outline'}
                        onClick={() => setDialog({ request: r, action: 'done' })}
                      >
                        Done
                      </Button>
                    )}
                    {mineToDo && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDialog({ request: r, action: 'reject' })}
                      >
                        Reject
                      </Button>
                    )}
                    {mineToCancel && !mineToDo && (
                      <Button size="sm" variant="ghost" onClick={() => void cancel(r)}>
                        Cancel request
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </QueryState>
      {dialog && (
        <ActionDialog
          key={`${dialog.request.id}-${dialog.action}`}
          request={dialog.request}
          action={dialog.action}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

const ACTION_TEXT: Record<Action, { title: string; button: string; done: string }> = {
  accept: { title: 'Accept request', button: 'Accept', done: 'Request accepted.' },
  reject: { title: 'Reject request', button: 'Reject', done: 'Request rejected.' },
  done: { title: 'Mark as done', button: 'Done', done: 'Done — the stand is updated.' },
};

function ActionDialog({
  request: r,
  action,
  onClose,
}: {
  request: StandRequestDTO;
  action: Action;
  onClose: () => void;
}) {
  const act = useStandRequestAction();
  const [day, setDay] = useState<string | null>(r.requestedDate);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const text = ACTION_TEXT[action];

  const submit = async () => {
    if (action === 'reject' && note.trim() === '') {
      setError('Say why, so the requester can plan again');
      return;
    }
    try {
      if (action === 'accept')
        await act.mutateAsync({
          requestId: r.id,
          action,
          body: { scheduledDate: day ?? undefined, technicianNote: note },
        });
      else if (action === 'reject')
        await act.mutateAsync({ requestId: r.id, action, body: { technicianNote: note } });
      else await act.mutateAsync({ requestId: r.id, action, body: { technicianNote: note } });
      notifySuccess(text.done);
      onClose();
    } catch (err) {
      notifyError(err, 'Could not update the request');
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{text.title}</DialogTitle>
          <DialogDescription>
            {describeRequest(r)} at {r.standCode}, asked by {r.requestedBy.displayName} for{' '}
            {formatDate(r.requestedDate)}.
            {action === 'done' &&
              (r.kind === 'uninstall'
                ? ' The stand will show as empty.'
                : ` The stand will show ${r.model}.`)}
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {action === 'accept' && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="accept-day" className="text-sm font-medium">
                Day you will do it
              </label>
              <DateInput id="accept-day" value={day} onChange={setDay} clearable={false} />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="action-note" className="text-sm font-medium">
              {action === 'reject' ? 'Reason' : 'Note (optional)'}
            </label>
            <Textarea
              id="action-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              aria-invalid={!!error}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant={action === 'reject' ? 'destructive' : 'default'}
              loading={act.isPending}
            >
              {text.button}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
