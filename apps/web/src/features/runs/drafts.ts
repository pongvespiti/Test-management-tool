import {
  RESULT_STATUSES,
  type ResultStatus,
  type RunCaseDTO,
  type StepResultDTO,
} from '@tmt/shared';
import { useSyncExternalStore } from 'react';
import { storageGet, storageSet } from '@/lib/storage';

/** What the tester is entering for one run case, before it is saved. */
export interface ResultDraft {
  status: ResultStatus;
  actualResult: string;
  remark: string;
  /** Accumulated elapsed seconds (without the running timer segment). */
  elapsedSec: number;
  /** `Date.now()` when the timer was started; null = paused. */
  timerStartedAt: number | null;
  /** Index-aligned with the run case steps (empty for text cases). */
  stepResults: StepResultDTO[];
}

export function draftFromCase(
  rc: Pick<
    RunCaseDTO,
    'status' | 'actualResult' | 'resultRemark' | 'elapsedSec' | 'steps' | 'stepResults'
  >,
): ResultDraft {
  return {
    status: rc.status,
    actualResult: rc.actualResult ?? '',
    remark: rc.resultRemark ?? '',
    elapsedSec: rc.elapsedSec ?? 0,
    timerStartedAt: null,
    stepResults: rc.steps.map((_, i) => {
      const r = rc.stepResults?.[i];
      return { status: r?.status ?? 'untested', actual: r?.actual ?? '' };
    }),
  };
}

export function sameDraft(a: ResultDraft, b: ResultDraft): boolean {
  if (
    a.status !== b.status ||
    a.actualResult !== b.actualResult ||
    a.remark !== b.remark ||
    a.elapsedSec !== b.elapsedSec ||
    a.timerStartedAt !== b.timerStartedAt ||
    a.stepResults.length !== b.stepResults.length
  )
    return false;
  return a.stepResults.every((s, i) => {
    const o = b.stepResults[i];
    return o !== undefined && o.status === s.status && o.actual === s.actual;
  });
}

/** Elapsed seconds including the running timer segment. */
export function elapsedNow(
  d: Pick<ResultDraft, 'elapsedSec' | 'timerStartedAt'>,
  now = Date.now(),
): number {
  return (
    d.elapsedSec +
    (d.timerStartedAt === null ? 0 : Math.max(0, Math.floor((now - d.timerStartedAt) / 1000)))
  );
}

/** The draft with its timer stopped (time so far added to `elapsedSec`). */
export function pauseTimer(d: ResultDraft, now = Date.now()): ResultDraft {
  if (d.timerStartedAt === null) return d;
  return { ...d, elapsedSec: elapsedNow(d, now), timerStartedAt: null };
}

/** localStorage key of the unsaved results of a run (per browser). */
export const draftsKey = (runId: number) => `tmt:run-drafts:${runId}`;

function isStatus(value: unknown): value is ResultStatus {
  return typeof value === 'string' && (RESULT_STATUSES as readonly string[]).includes(value);
}

function toStepResult(value: unknown): StepResultDTO | null {
  if (typeof value !== 'object' || value === null) return null;
  const s = value as Record<string, unknown>;
  return isStatus(s.status) && typeof s.actual === 'string'
    ? { status: s.status, actual: s.actual }
    : null;
}

function toDraft(value: unknown): ResultDraft | null {
  if (typeof value !== 'object' || value === null) return null;
  const d = value as Record<string, unknown>;
  if (
    !isStatus(d.status) ||
    typeof d.actualResult !== 'string' ||
    typeof d.remark !== 'string' ||
    typeof d.elapsedSec !== 'number' ||
    !Number.isFinite(d.elapsedSec) ||
    d.elapsedSec < 0 ||
    !Array.isArray(d.stepResults)
  )
    return null;
  const steps = d.stepResults.map(toStepResult);
  if (steps.some((s) => s === null)) return null;
  return {
    status: d.status,
    actualResult: d.actualResult,
    remark: d.remark,
    elapsedSec: Math.floor(d.elapsedSec),
    timerStartedAt: null,
    stepResults: steps as StepResultDTO[],
  };
}

/** Stored drafts by run case id; anything malformed (old format, manual edits) is dropped. */
export function parseDrafts(raw: string | null): Map<number, ResultDraft> {
  const out = new Map<number, ResultDraft>();
  if (!raw) return out;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return out;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return out;
  for (const [key, value] of Object.entries(data)) {
    const id = Number(key);
    const draft = toDraft(value);
    if (Number.isInteger(id) && id > 0 && draft) out.set(id, draft);
  }
  return out;
}

/** JSON of the drafts (null when empty); running timers are stored paused at `now`. */
export function serializeDrafts(
  drafts: ReadonlyMap<number, ResultDraft>,
  now = Date.now(),
): string | null {
  if (drafts.size === 0) return null;
  const out: Record<string, ResultDraft> = {};
  for (const [id, d] of drafts) out[id] = pauseTimer(d, now);
  return JSON.stringify(out);
}

/**
 * Unsaved results of a run page, kept outside React state so typing does not re-render the page,
 * and in localStorage (`storageKey`) so they survive leaving the page or a reload. Subscribers are
 * told only when the set of run cases with drafts changes (row markers).
 */
export class DraftStore {
  private readonly storageKey: string | null;
  private readonly drafts: Map<number, ResultDraft>;
  private readonly listeners = new Set<() => void>();
  private ids: ReadonlySet<number>;

  constructor(storageKey: string | null = null) {
    this.storageKey = storageKey;
    this.drafts = storageKey ? parseDrafts(storageGet(storageKey)) : new Map();
    this.ids = new Set(this.drafts.keys());
  }

  get(id: number): ResultDraft | null {
    return this.drafts.get(id) ?? null;
  }

  set(id: number, draft: ResultDraft | null): void {
    const had = this.drafts.has(id);
    if (draft) this.drafts.set(id, draft);
    else this.drafts.delete(id);
    if (draft || had) this.persist();
    if (had !== this.drafts.has(id)) this.emit();
  }

  /** Drops drafts of run cases that are gone, whose steps changed, or that equal the saved result. */
  prune(cases: readonly RunCaseDTO[]): void {
    const byId = new Map(cases.map((c) => [c.id, c]));
    let changed = false;
    for (const [id, d] of this.drafts) {
      const rc = byId.get(id);
      if (
        !rc ||
        d.stepResults.length !== rc.steps.length ||
        sameDraft(pauseTimer(d), draftFromCase(rc))
      ) {
        this.drafts.delete(id);
        changed = true;
      }
    }
    if (changed) {
      this.persist();
      this.emit();
    }
  }

  get size(): number {
    return this.drafts.size;
  }

  /** Writes the drafts to storage (running timers paused at `now`). */
  persist(now = Date.now()): void {
    if (this.storageKey) storageSet(this.storageKey, serializeDrafts(this.drafts, now));
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getIds = (): ReadonlySet<number> => this.ids;

  private emit(): void {
    this.ids = new Set(this.drafts.keys());
    this.listeners.forEach((l) => l());
  }
}

/** Ids of run cases with unsaved drafts (re-renders only when that set changes). */
export function useDraftIds(store: DraftStore): ReadonlySet<number> {
  return useSyncExternalStore(store.subscribe, store.getIds, store.getIds);
}
