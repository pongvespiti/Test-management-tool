import { SESSION_NOTE_KIND_LABELS, SESSION_STATUS_LABELS } from '@tmt/shared';
import type { SessionNoteKind, SessionStatus } from '@tmt/shared';
import { StatusPill } from '@/components/common/status-pill';
import { NOTE_KIND_TONES, SESSION_STATUS_TONES } from './session-format';

export function SessionStatusBadge({ status }: { status: SessionStatus }) {
  return (
    <StatusPill tone={SESSION_STATUS_TONES[status]}>{SESSION_STATUS_LABELS[status]}</StatusPill>
  );
}

export function NoteKindBadge({ kind }: { kind: SessionNoteKind }) {
  return <StatusPill tone={NOTE_KIND_TONES[kind]}>{SESSION_NOTE_KIND_LABELS[kind]}</StatusPill>;
}
