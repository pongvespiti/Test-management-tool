import type {
  DefectSeverity,
  DefectStatus,
  ReopenGroupDTO,
  ReopenReportDTO,
  ReopenedDefectDTO,
} from '@tmt/shared';

/** A defect with the places it belongs to (null = it does not say). */
export interface ReopenDefect {
  id: number;
  key: string;
  title: string;
  status: DefectStatus;
  severity: DefectSeverity;
  release: string | null;
  build: string | null;
  platform: string | null;
  topic: string | null;
}

/** One status change to "reopened", from the activity log. */
export interface ReopenEvent {
  defectId: number;
  at: Date;
}

type Place = 'release' | 'build' | 'platform' | 'topic';

/** A defect is "repeated" from this many reopens on. */
export const REPEATED_FROM = 2;

function group(
  defects: readonly ReopenDefect[],
  reopensOf: ReadonlyMap<number, number>,
  place: Place,
): ReopenGroupDTO[] {
  const by = new Map<string, ReopenGroupDTO>();
  for (const d of defects) {
    const value = d[place]?.trim() ?? '';
    const g = by.get(value) ?? { value, defects: 0, reopenedDefects: 0, reopens: 0 };
    const n = reopensOf.get(d.id) ?? 0;
    g.defects += 1;
    if (n > 0) g.reopenedDefects += 1;
    g.reopens += n;
    by.set(value, g);
  }
  // Most reopens first, then by name; the group without a value last.
  return [...by.values()].toSorted(
    (a, b) =>
      Number(a.value === '') - Number(b.value === '') ||
      b.reopens - a.reopens ||
      a.value.localeCompare(b.value, 'en', { numeric: true }),
  );
}

/** Reopen counts per release / build / platform / topic and the defects that keep coming back. */
export function reopenReportOf(
  defects: readonly ReopenDefect[],
  events: readonly ReopenEvent[],
): ReopenReportDTO {
  const known = new Set(defects.map((d) => d.id));
  const reopensOf = new Map<number, number>();
  const lastOf = new Map<number, Date>();
  for (const e of events) {
    if (!known.has(e.defectId)) continue;
    reopensOf.set(e.defectId, (reopensOf.get(e.defectId) ?? 0) + 1);
    const last = lastOf.get(e.defectId);
    if (!last || e.at > last) lastOf.set(e.defectId, e.at);
  }
  const repeated: ReopenedDefectDTO[] = defects
    .filter((d) => (reopensOf.get(d.id) ?? 0) >= REPEATED_FROM)
    .map((d) => ({
      id: d.id,
      key: d.key,
      title: d.title,
      status: d.status,
      severity: d.severity,
      reopens: reopensOf.get(d.id)!,
      lastReopenedAt: lastOf.get(d.id)!.toISOString(),
      release: d.release,
      build: d.build,
      platform: d.platform,
      topic: d.topic,
    }))
    .toSorted((a, b) => b.reopens - a.reopens || b.lastReopenedAt.localeCompare(a.lastReopenedAt));
  const counts = [...reopensOf.values()];
  return {
    totals: {
      defects: defects.length,
      reopenedDefects: counts.length,
      reopens: counts.reduce((sum, n) => sum + n, 0),
      repeatedDefects: repeated.length,
    },
    byRelease: group(defects, reopensOf, 'release'),
    byBuild: group(defects, reopensOf, 'build'),
    byPlatform: group(defects, reopensOf, 'platform'),
    byTopic: group(defects, reopensOf, 'topic'),
    repeated,
  };
}
