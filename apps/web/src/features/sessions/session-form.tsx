'use client';

import {
  createSessionSchema,
  SESSION_MAX_MINUTES,
  SESSION_MIN_MINUTES,
  type SessionDTO,
} from '@tmt/shared';
import { useState } from 'react';
import { BuildSelect } from '@/components/common/build-select';
import { LabeledDivider } from '@/components/common/list-controls';
import { ReleaseSelect } from '@/components/common/release-select';
import { UserSelect } from '@/components/common/user-select';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api/client';
import { useCreateSession, useUpdateSession } from '@/lib/api/sessions';
import { schemaErrors } from '@/lib/form-errors';
import { notifyError, notifySuccess } from '@/lib/notify';
import { useAuth } from '@/providers/auth-provider';
import { useProject } from '@/providers/project-provider';
import { EnvEditor } from '../plans/env-editor';
import {
  emptyEnvRow,
  envEntriesOf,
  envRowErrors,
  envRowsFromEntries,
  withoutBodyErrors,
  type EnvRow,
} from '../plans/env-rows';

interface SessionFormProps {
  /** null = new session. */
  session: SessionDTO | null;
  onClose: () => void;
  onSaved?: (saved: SessionDTO) => void;
}

const FIELD = 'flex flex-col gap-1.5';
const LABEL = 'text-sm font-medium';

/** Create or edit an exploratory session: charter, who, what is under test, time box, environment. */
export function SessionForm({ session, onClose, onSaved }: SessionFormProps) {
  const { projectId } = useProject();
  const { user } = useAuth();
  const create = useCreateSession(projectId);
  const update = useUpdateSession(projectId);
  const [title, setTitle] = useState(session?.title ?? '');
  const [charter, setCharter] = useState(session?.charter ?? '');
  const [ownerId, setOwnerId] = useState<number | null>(
    session ? (session.owner?.id ?? null) : (user?.id ?? null),
  );
  const [releaseId, setReleaseId] = useState<number | null>(session?.release?.id ?? null);
  const [buildId, setBuildId] = useState<number | null>(session?.build?.id ?? null);
  const [timeBox, setTimeBox] = useState(
    session?.timeBoxMinutes ? String(session.timeBoxMinutes) : '',
  );
  const [references, setReferences] = useState(session?.references ?? '');
  const [rows, setRows] = useState<EnvRow[]>(() =>
    session && session.environment.length > 0
      ? envRowsFromEntries(session.environment)
      : [emptyEnvRow()],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const minutes = timeBox.trim() === '' ? null : Number(timeBox);
  const body = () => ({
    title,
    charter,
    ownerId,
    releaseId,
    // A build only makes sense inside its release.
    buildId: releaseId ? buildId : null,
    timeBoxMinutes: minutes,
    references,
    environment: envEntriesOf(rows),
  });

  const pending = create.isPending || update.isPending;

  const submit = async () => {
    const found = {
      ...withoutBodyErrors(schemaErrors(createSessionSchema, body())),
      ...envRowErrors(rows),
      ...(minutes !== null && !Number.isInteger(minutes)
        ? { timeBoxMinutes: 'Enter whole minutes' }
        : {}),
    };
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }
    setErrors({});
    try {
      const saved = session
        ? await update.mutateAsync({ sessionId: session.id, ...body() })
        : await create.mutateAsync(body());
      notifySuccess(session ? `${saved.key} saved.` : `Session ${saved.key} created.`);
      onSaved?.(saved);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'BAD_BUILD')
        setErrors({ buildId: 'This build does not belong to the release' });
      else notifyError(err, 'Could not save the session');
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{session ? `Edit ${session.key}` : 'New exploratory session'}</DialogTitle>
          <DialogDescription>
            A time-boxed session with a charter: what to explore and what to look for. Write notes
            and link defects while you test.
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
          <div className={FIELD}>
            <label htmlFor="session-title" className={LABEL}>
              Title
            </label>
            <Input
              id="session-title"
              autoFocus
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-invalid={!!errors.title}
              placeholder="e.g. Pairing the adapter while the router restarts"
            />
            {errors.title && <p className="text-sm text-destructive">{errors.title}</p>}
          </div>
          <div className={FIELD}>
            <label htmlFor="session-charter" className={LABEL}>
              Charter
            </label>
            <Textarea
              id="session-charter"
              rows={3}
              value={charter}
              onChange={(e) => setCharter(e.target.value)}
              placeholder="Explore … with … to discover …"
              aria-invalid={!!errors.charter}
            />
            {errors.charter && <p className="text-sm text-destructive">{errors.charter}</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className={FIELD}>
              <label htmlFor="session-owner" className={LABEL}>
                Tester
              </label>
              <UserSelect
                id="session-owner"
                projectId={projectId}
                value={ownerId}
                onChange={setOwnerId}
                roles={['tester', 'lead']}
                placeholder="No one yet"
              />
            </div>
            <div className={FIELD}>
              <label htmlFor="session-time-box" className={LABEL}>
                Time box (minutes)
              </label>
              <Input
                id="session-time-box"
                inputMode="numeric"
                value={timeBox}
                onChange={(e) => setTimeBox(e.target.value.replace(/[^\d]/g, ''))}
                placeholder={`${SESSION_MIN_MINUTES}–${SESSION_MAX_MINUTES}, e.g. 60`}
                aria-invalid={!!errors.timeBoxMinutes}
              />
              {errors.timeBoxMinutes && (
                <p className="text-sm text-destructive">{errors.timeBoxMinutes}</p>
              )}
            </div>
            <div className={FIELD}>
              <label htmlFor="session-release" className={LABEL}>
                Release
              </label>
              <ReleaseSelect
                id="session-release"
                projectId={projectId}
                value={releaseId}
                onChange={(id) => {
                  setReleaseId(id);
                  setBuildId(null);
                }}
              />
            </div>
            <div className={FIELD}>
              <label htmlFor="session-build" className={LABEL}>
                Build
              </label>
              <BuildSelect
                id="session-build"
                projectId={projectId}
                releaseId={releaseId}
                value={releaseId ? buildId : null}
                onChange={setBuildId}
                disabled={!releaseId}
                aria-invalid={!!errors.buildId}
              />
              {errors.buildId && <p className="text-sm text-destructive">{errors.buildId}</p>}
            </div>
          </div>
          <div className={FIELD}>
            <label htmlFor="session-references" className={LABEL}>
              References
            </label>
            <Input
              id="session-references"
              value={references}
              onChange={(e) => setReferences(e.target.value)}
              placeholder="Requirement IDs or Jira keys, e.g. REQ-12, IOT-345"
              aria-invalid={!!errors.references}
            />
            {errors.references && <p className="text-sm text-destructive">{errors.references}</p>}
          </div>
          <LabeledDivider label="Test environment" />
          <EnvEditor
            value={rows}
            onChange={setRows}
            errorOf={(i, part) => errors[`environment.${i}.${part}`]}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              {session ? 'Save' : 'Create session'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
