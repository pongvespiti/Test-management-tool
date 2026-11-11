'use client';

import { type MyWorkDTO, type MyWorkItemDTO, type MyWorkRange } from '@tmt/shared';
import { ChevronLeft, ChevronRight, ClipboardCopy, ListTodo } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { ResultBadge } from '@/components/common/badges';
import { CasePriorityLabel } from '@/components/common/case-priority-label';
import { EmptyState } from '@/components/common/empty-state';
import { QueryState, Spinner } from '@/components/common/error-alert';
import { SegmentedControl } from '@/components/common/list-controls';
import { MonoId } from '@/components/common/mono-id';
import { PageHeader } from '@/components/common/page-header';
import { StackedProgress } from '@/components/common/stacked-progress';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDuration } from '@/features/runs/time';
import { Refreshing, SectionCard, StatTile } from '@/features/reports/report-ui';
import { useUrlSearchParams } from '@/hooks/use-url-search-params';
import { useMyWork } from '@/lib/api/my-work';
import { copyText } from '@/lib/clipboard';
import { formatDate, pluralize } from '@/lib/format';
import { notifyError, notifySuccess } from '@/lib/notify';
import { routes } from '@/lib/routes';
import { useProject } from '@/providers/project-provider';
import { periodTitle, shiftDate, stepOf, summaryText } from './my-work-format';

const RANGES = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
] as const;
const DATE_PARAM = /^\d{4}-\d{2}-\d{2}$/;
const TH = 'h-9 bg-muted text-xs font-semibold text-muted-foreground';

/** Run cases waiting for me, and what I tested in a day or a week (copy-ready for reports). */
export function MyWorkPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      }
    >
      <MyWork />
    </Suspense>
  );
}

function MyWork() {
  const { project, projectId } = useProject();
  const [params, setParams] = useUrlSearchParams();
  const range: MyWorkRange = params.get('range') === 'week' ? 'week' : 'day';
  const dateParam = params.get('date');
  const date = dateParam && DATE_PARAM.test(dateParam) ? dateParam : null;
  const query = useMyWork(projectId, range, date);

  const go = (next: { range?: MyWorkRange; date?: string | null }) =>
    setParams((prev) => {
      const out = new URLSearchParams(prev);
      const r = next.range ?? range;
      if (r === 'day') out.delete('range');
      else out.set('range', r);
      const d = next.date === undefined ? date : next.date;
      if (d) out.set('date', d);
      else out.delete('date');
      return out;
    });

  const data = query.data;
  const copy = async () => {
    if (!data) return;
    if (await copyText(summaryText(data, project.name))) {
      notifySuccess('Summary copied', 'Paste it into your report.');
    } else {
      notifyError(new Error('The browser blocked copying.'), 'Could not copy the summary');
    }
  };

  return (
    <>
      <PageHeader
        eyebrow={project.name}
        title="My work"
        subtitle="Test cases waiting for you, and what you tested in a day or a week."
      />
      <div className="flex flex-col gap-6">
        <QueryState query={query}>
          {data && (
            <>
              <Waiting data={data} projectId={projectId} />
              <section aria-label="Period" className="flex flex-wrap items-center gap-3">
                <SegmentedControl
                  aria-label="Period length"
                  value={range}
                  options={RANGES}
                  onChange={(next) => go({ range: next, date: data.from })}
                />
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={range === 'week' ? 'Previous week' : 'Previous day'}
                    onClick={() => go({ date: shiftDate(data.from, -stepOf(range)) })}
                  >
                    <ChevronLeft />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={range === 'week' ? 'Next week' : 'Next day'}
                    onClick={() => go({ date: shiftDate(data.from, stepOf(range)) })}
                  >
                    <ChevronRight />
                  </Button>
                  <Button variant="outline" onClick={() => go({ date: null })}>
                    Today
                  </Button>
                </div>
                <p className="text-sm font-semibold">
                  {periodTitle(data.range, data.from, data.to)}
                </p>
                <Button className="ml-auto" variant="outline" onClick={() => void copy()}>
                  <ClipboardCopy /> Copy summary
                </Button>
              </section>
              <Refreshing active={query.isFetching}>
                <Done data={data} />
              </Refreshing>
            </>
          )}
        </QueryState>
      </div>
    </>
  );
}

function Waiting({ data, projectId }: { data: MyWorkDTO; projectId: number }) {
  const { assigned } = data;
  return (
    <SectionCard
      title="Waiting for me"
      subtitle="Cases assigned to you, or in your runs and not assigned to anyone, in plans that are not completed."
      flush
      actions={
        assigned.total > 0 && (
          <span className="text-sm text-muted-foreground">
            {assigned.ng} NG · {assigned.blocked} blocked · {assigned.untested} untested
            {assigned.remainingEstimateMinutes > 0 &&
              ` · about ${formatDuration(assigned.remainingEstimateMinutes * 60)} left`}
          </span>
        )
      }
    >
      {assigned.total === 0 ? (
        <EmptyState
          compact
          icon={<ListTodo className="size-6" strokeWidth={1.6} />}
          title="Nothing is waiting for you"
          description="Cases show up here when a run is yours or a case is assigned to you."
        />
      ) : (
        <>
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow>
                <TableHead className={`${TH} w-[110px]`}>Case</TableHead>
                <TableHead className={TH}>Title</TableHead>
                <TableHead className={`${TH} w-[100px]`}>Status</TableHead>
                <TableHead className={`${TH} w-[100px]`}>Priority</TableHead>
                <TableHead className={`${TH} w-[190px]`}>Run</TableHead>
                <TableHead className={`${TH} w-[200px]`}>Release · build</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assigned.items.map((item) => (
                <WaitingRow key={item.runCaseId} item={item} projectId={projectId} />
              ))}
            </TableBody>
          </Table>
          {assigned.truncated && (
            <p className="px-5 py-3 text-sm text-muted-foreground">
              Showing the first {assigned.items.length} of {assigned.total} cases (NG and blocked
              first).
            </p>
          )}
        </>
      )}
    </SectionCard>
  );
}

function WaitingRow({ item, projectId }: { item: MyWorkItemDTO; projectId: number }) {
  return (
    <TableRow>
      <TableCell>
        <MonoId>{item.displayId}</MonoId>
      </TableCell>
      <TableCell>
        <Link
          href={routes.run(projectId, item.runId, { case: item.runCaseId })}
          className="font-medium text-primary hover:underline"
        >
          {item.title}
        </Link>
      </TableCell>
      <TableCell>
        <ResultBadge status={item.status} size="sm" />
      </TableCell>
      <TableCell>
        <CasePriorityLabel priority={item.priority} />
      </TableCell>
      <TableCell>
        <span className="font-mono text-[13px]">{item.runCode}</span>
        <span className="block text-xs text-muted-foreground">{item.planDocNo}</span>
      </TableCell>
      <TableCell className="text-sm">
        {item.release?.name ?? <span className="text-muted-foreground">—</span>}
        {item.build && <span className="block font-mono text-xs">{item.build.name}</span>}
      </TableCell>
    </TableRow>
  );
}

function Done({ data }: { data: MyWorkDTO }) {
  const { summary } = data;
  const { counts } = summary;
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Cases tested" value={summary.executed} />
        <StatTile label="OK" value={counts.ok + counts.ok_cond} />
        <StatTile label="NG" value={counts.ng} />
        <StatTile label="Time spent" value={formatDuration(summary.elapsedSec)} />
      </div>
      {summary.executed === 0 ? (
        <SectionCard title="Results by release and build" flush>
          <EmptyState
            compact
            icon={<ListTodo className="size-6" strokeWidth={1.6} />}
            title="No results recorded in this period"
            description="Results you record on a run appear here."
          />
        </SectionCard>
      ) : (
        <SectionCard
          title="Results by release and build"
          subtitle="Each case is counted once, by its latest result in the period."
          flush
        >
          <Table className="min-w-[560px]">
            <TableHeader>
              <TableRow>
                <TableHead className={TH}>Release · build</TableHead>
                <TableHead className={`${TH} w-[90px]`}>Cases</TableHead>
                <TableHead className={`${TH} min-w-[230px]`}>Results</TableHead>
                <TableHead className={`${TH} w-[110px]`}>Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.groups.map((g) => (
                <TableRow key={`${g.release?.id ?? 0}-${g.build?.id ?? 0}`}>
                  <TableCell>
                    {g.release?.name ?? <span className="text-muted-foreground">No release</span>}
                    {g.build && <span className="block font-mono text-xs">{g.build.name}</span>}
                  </TableCell>
                  <TableCell>{g.executed}</TableCell>
                  <TableCell>
                    <StackedProgress counts={g.counts} showSummary />
                  </TableCell>
                  <TableCell>{formatDuration(g.elapsedSec)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>
      )}
      {data.range === 'week' && summary.executed > 0 && (
        <SectionCard title="By day" flush>
          <Table className="min-w-[420px]">
            <TableHeader>
              <TableRow>
                <TableHead className={TH}>Day</TableHead>
                <TableHead className={`${TH} w-[110px]`}>Cases</TableHead>
                <TableHead className={`${TH} w-[130px]`}>Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.days.map((d) => (
                <TableRow key={d.date}>
                  <TableCell>{formatDate(d.date)}</TableCell>
                  <TableCell>
                    {d.executed || <span className="text-muted-foreground">0</span>}
                  </TableCell>
                  <TableCell>{formatDuration(d.elapsedSec)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>
      )}
      {summary.defects.length > 0 && (
        <SectionCard
          title="Defects I reported"
          subtitle={pluralize(summary.defects.length, 'defect')}
          flush
        >
          <DefectRows data={data} />
        </SectionCard>
      )}
    </div>
  );
}

function DefectRows({ data }: { data: MyWorkDTO }) {
  const { projectId } = useProject();
  return (
    <ul className="divide-y">
      {data.summary.defects.map((d) => (
        <li key={d.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
          <MonoId>{d.key}</MonoId>
          <Link
            href={routes.defect(projectId, d.id)}
            className="font-medium text-primary hover:underline"
          >
            {d.title}
          </Link>
        </li>
      ))}
    </ul>
  );
}
