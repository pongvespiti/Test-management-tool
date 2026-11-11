'use client';

import { progressOf, type ScheduleItemDTO } from '@tmt/shared';
import { CalendarRange } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/components/common/empty-state';
import { SegmentedControl } from '@/components/common/list-controls';
import { useUrlSearchParams } from '@/hooks/use-url-search-params';
import { useScheduleReport } from '@/lib/api/reports';
import { formatDate } from '@/lib/format';
import { routes } from '@/lib/routes';
import { cn } from '@/lib/utils';
import { buildGantt, type GanttBar, type GanttGroup, type GanttModel } from './gantt';
import { ReportState, SectionCard } from './report-ui';

const GROUPS: { value: GanttGroup; label: string }[] = [
  { value: 'topic', label: 'By topic' },
  { value: 'person', label: 'By person' },
];
const LANE_HEIGHT = 30;
const LABEL_WIDTH = 180;
/** Pixels per day below which the chart scrolls sideways instead of squeezing the bars. */
const MIN_DAY_WIDTH = 22;

/** Plans and runs on a calendar: one row per topic or person, one bar per run. */
export function ScheduleTab({
  projectId,
  releaseId,
}: {
  projectId: number;
  releaseId: number | null;
}) {
  const [params, setParams] = useUrlSearchParams();
  const by: GanttGroup = params.get('by') === 'person' ? 'person' : 'topic';
  const query = useScheduleReport(projectId, { releaseId });
  const model = query.data ? buildGantt(query.data, by) : null;

  return (
    <ReportState query={query} className="min-h-60">
      {!model ? (
        <EmptyState
          icon={<CalendarRange className="size-6" strokeWidth={1.6} />}
          title="Nothing on the calendar yet"
          description="Give a plan a start date and a due date (and runs their own due dates) and they appear here as bars."
        />
      ) : (
        <SectionCard
          title={query.data?.release ? `${query.data.release.name} schedule` : 'Schedule'}
          subtitle="A run runs from the start date of its plan to its due date (or the plan's)."
          flush
          actions={
            <SegmentedControl
              aria-label="Group rows"
              value={by}
              onChange={(v) =>
                setParams((prev) => {
                  const next = new URLSearchParams(prev);
                  if (v === 'topic') next.delete('by');
                  else next.set('by', v);
                  return next;
                })
              }
              options={GROUPS}
            />
          }
        >
          <Gantt model={model} projectId={projectId} />
          {model.unscheduled.length > 0 && (
            <Unscheduled items={model.unscheduled} projectId={projectId} />
          )}
        </SectionCard>
      )}
    </ReportState>
  );
}

function Gantt({ model, projectId }: { model: GanttModel; projectId: number }) {
  const pct = (day: number) => `${(day / model.days) * 100}%`;
  return (
    <div className="overflow-x-auto px-5 pb-4">
      <div
        role="table"
        aria-label="Schedule"
        style={{ minWidth: LABEL_WIDTH + model.days * MIN_DAY_WIDTH }}
      >
        <div className="flex border-b">
          <div style={{ width: LABEL_WIDTH }} className="flex-none" />
          <div className="relative h-7 flex-1">
            {model.ticks.map((t) => (
              <span
                key={t.day}
                style={{ left: pct(t.day) }}
                className="absolute top-1 -translate-x-1/2 text-xs whitespace-nowrap text-muted-foreground"
              >
                {t.label}
              </span>
            ))}
          </div>
        </div>
        {model.rows.map((row) => (
          <div key={row.key || 'none'} role="row" className="flex border-b last:border-b-0">
            <div
              role="rowheader"
              style={{ width: LABEL_WIDTH }}
              className="flex-none truncate py-2 pr-3 text-sm font-medium"
              title={row.label}
            >
              {row.label}
            </div>
            <div
              className="relative flex-1"
              style={{ height: Math.max(1, row.lanes.length) * LANE_HEIGHT + 8 }}
            >
              <Gridlines model={model} pct={pct} />
              {row.lanes.map((lane, li) =>
                lane.map((bar) => (
                  <BarLink
                    key={bar.item.runId}
                    bar={bar}
                    top={4 + li * LANE_HEIGHT}
                    left={pct(bar.from)}
                    width={`${((bar.to - bar.from + 1) / model.days) * 100}%`}
                    projectId={projectId}
                  />
                )),
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Gridlines({ model, pct }: { model: GanttModel; pct: (day: number) => string }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {model.ticks.map((t) => (
        <span
          key={t.day}
          style={{ left: pct(t.day) }}
          className="absolute inset-y-0 w-px bg-border/70"
        />
      ))}
      {model.today !== null && (
        <span
          style={{ left: pct(model.today + 0.5) }}
          className="absolute inset-y-0 w-0.5 bg-primary/60"
        />
      )}
    </div>
  );
}

function barTitle(item: ScheduleItemDTO): string {
  const dates = `${item.start ? formatDate(item.start) : '—'} → ${item.due ? formatDate(item.due) : '—'}`;
  return `${item.code} · ${item.suite} · ${item.planDocNo}\n${dates}\n${item.tester?.displayName ?? 'Not handed out'}\n${Math.round(progressOf(item.counts) * 100)}% executed`;
}

function BarLink({
  bar,
  top,
  left,
  width,
  projectId,
}: {
  bar: GanttBar;
  top: number;
  left: string;
  width: string;
  projectId: number;
}) {
  const { item } = bar;
  const done = progressOf(item.counts);
  return (
    <Link
      href={routes.run(projectId, item.runId)}
      title={barTitle(item)}
      aria-label={`${item.code} ${item.suite}${bar.late ? ', late' : ''}`}
      style={{ top, left, width, height: LANE_HEIGHT - 6 }}
      className={cn(
        'absolute min-w-2 overflow-hidden rounded-md text-xs leading-[24px] text-white',
        bar.late ? 'bg-destructive/80' : 'bg-primary/70',
      )}
    >
      <span
        aria-hidden
        style={{ width: `${done * 100}%` }}
        className={cn('absolute inset-y-0 left-0', bar.late ? 'bg-destructive' : 'bg-primary')}
      />
      <span className="relative block truncate px-1.5">
        {item.code} · {item.suite}
      </span>
    </Link>
  );
}

function Unscheduled({ items, projectId }: { items: ScheduleItemDTO[]; projectId: number }) {
  return (
    <div className="border-t px-5 py-4">
      <h3 className="text-sm font-semibold">Without dates</h3>
      <p className="mb-2 text-sm text-muted-foreground">
        These runs have no start and no due date, so they have no bar.
      </p>
      <ul aria-label="Runs without dates" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {items.map((i) => (
          <li key={i.runId}>
            <Link href={routes.run(projectId, i.runId)} className="text-primary hover:underline">
              {i.code}
            </Link>{' '}
            <span className="text-muted-foreground">
              {i.suite} · {i.planDocNo}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
