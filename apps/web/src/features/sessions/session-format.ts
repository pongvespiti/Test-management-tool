import type { SessionListItemDTO, SessionNoteKind, SessionStatus } from '@tmt/shared';
import type { Tone } from '@/lib/status';
import { BLUE, GRAY, GREEN, ORANGE, VIOLET } from '@/lib/status';

export const SESSION_STATUS_TONES: Record<SessionStatus, Tone> = {
  planned: GRAY,
  in_progress: BLUE,
  completed: GREEN,
};

export const NOTE_KIND_TONES: Record<SessionNoteKind, Tone> = {
  note: GRAY,
  bug: { fg: '#C92A2A', bg: '#FFF5F5' },
  question: ORANGE,
  idea: VIOLET,
};

type Timing = Pick<SessionListItemDTO, 'startedAt' | 'endedAt' | 'timeBoxMinutes'>;

/** Minutes spent so far: from the start to the end, or to `now` while the session runs. */
export function elapsedMinutes(session: Timing, now: number): number {
  if (!session.startedAt) return 0;
  const start = Date.parse(session.startedAt);
  const end = session.endedAt ? Date.parse(session.endedAt) : now;
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.max(0, (end - start) / 60_000);
}

/** `1 h 05 min` / `42 min` / `< 1 min`. */
export function formatMinutes(minutes: number): string {
  const total = Math.floor(minutes);
  if (total < 1) return '< 1 min';
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')} min`;
}

export type TimeBoxState = 'none' | 'within' | 'near' | 'over';

/** Share of the time box used (0..n) and how it should read: near = last 20 %, over = past it. */
export function timeBox(
  session: Timing,
  now: number,
): { state: TimeBoxState; used: number; ratio: number; remaining: number | null } {
  const used = elapsedMinutes(session, now);
  const limit = session.timeBoxMinutes;
  if (!limit) return { state: 'none', used, ratio: 0, remaining: null };
  const ratio = used / limit;
  const state: TimeBoxState = ratio >= 1 ? 'over' : ratio >= 0.8 ? 'near' : 'within';
  return { state, used, ratio, remaining: limit - used };
}

/** Counts of the session list by status, for the filter chips. */
export function countByStatus(items: SessionListItemDTO[]): Record<SessionStatus | 'all', number> {
  const out = { all: items.length, planned: 0, in_progress: 0, completed: 0 };
  for (const s of items) out[s.status] += 1;
  return out;
}
