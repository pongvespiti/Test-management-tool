'use client';

import {
  DEFECT_SEVERITY_LABELS,
  DEFECT_STATUS_LABELS,
  formatMinutes,
  formatPercent,
  JUDGEMENT_LABELS,
  passRateOf,
  PLAN_STATUS_LABELS,
  progressOf,
  RESULT_LABELS,
  totalOf,
  type ResultStatus,
  type RunReportCaseDTO,
  type RunReportDTO,
  type StatusCounts,
} from '@tmt/shared';
import { ArrowLeft, Download, Printer } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { ResultBadge } from '@/components/common/badges';
import { ErrorAlert, Spinner } from '@/components/common/error-alert';
import { PageHeader } from '@/components/common/page-header';
import { StackedProgress } from '@/components/common/stacked-progress';
import { Button } from '@/components/ui/button';
import { downloadRunReport, useRunReport } from '@/lib/api/automation';
import { formatDate } from '@/lib/format';
import { toId } from '@/lib/forms';
import { notifyError } from '@/lib/notify';
import { routes } from '@/lib/routes';
import { RESULT_BAR_ORDER } from '@/lib/status';
import { cn } from '@/lib/utils';
import { useProject } from '@/providers/project-provider';
import styles from './run-report.module.css';
import { PATH_SEP, statusLabelOf } from './run-cases';
import { formatDuration } from './time';

/** Statuses whose cases get a detail section (what a reviewer needs to read). */
const DETAIL_STATUSES: ResultStatus[] = ['ng', 'blocked', 'ok_cond'];
/** Column order of the per-section table (same order as the status legend). */
const COLUMNS = RESULT_BAR_ORDER;

/** Date-time in the report's time zone, e.g. `Oct 28, 2026, 14:05`. */
export function inZone(iso: string | null | undefined, tz: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(d);
  } catch {
    return d.toLocaleString('en-US');
  }
}

/** [[a, b], [c, d], [e, f]] → [[a, b, c, d], [e, f]]. */
export function pairs(
  items: readonly (readonly [string, string])[],
): (readonly [string, string, string?, string?])[] {
  const out: (readonly [string, string, string?, string?])[] = [];
  for (let i = 0; i < items.length; i += 2) {
    const a = items[i];
    const b = items[i + 1];
    if (!a) continue;
    out.push(b ? [a[0], a[1], b[0], b[1]] : [a[0], a[1]]);
  }
  return out;
}

const statusLabel = (s: ResultStatus) => statusLabelOf(s, RESULT_LABELS);

/** Route `/projects/[projectId]/runs/[runId]/report`: printable A4 run report (PractiTest style). */
export function RunReportPage() {
  const { projectId } = useProject();
  const params = useParams<{ runId?: string | string[] }>();
  const raw = params?.runId;
  const runId = toId(Array.isArray(raw) ? raw[0] : raw);
  const report = useRunReport(projectId, runId);

  // Print rules that hide the app shell apply only while this page is open.
  useEffect(() => {
    const printClass = styles.printReport;
    if (!printClass) return;
    document.body.classList.add(printClass);
    return () => document.body.classList.remove(printClass);
  }, []);

  // Browsers propose the document title as the PDF file name.
  const r = report.data;
  useEffect(() => {
    if (!r) return;
    const previous = document.title;
    document.title = `${r.plan.docNo} ${r.run.code} run report`;
    return () => {
      document.title = previous;
    };
  }, [r]);

  if (runId === null || report.isError) {
    return (
      <>
        <PageHeader
          title="Run report"
          breadcrumbs={[
            { label: 'Test plans', href: routes.plans(projectId) },
            { label: 'Run report' },
          ]}
        />
        <div className="flex max-w-[560px] flex-col gap-4">
          <ErrorAlert
            error={report.error ?? new Error('This report address is not valid.')}
            onRetry={runId === null ? undefined : () => void report.refetch()}
          />
          {runId !== null && (
            <Button asChild variant="outline" className="w-fit">
              <Link href={routes.run(projectId, runId)}>
                <ArrowLeft />
                Back to the run
              </Link>
            </Button>
          )}
        </div>
      </>
    );
  }
  if (!r)
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  return <Report report={r} />;
}

function Report({ report: r }: { report: RunReportDTO }) {
  const { projectId } = useProject();
  const [downloading, setDownloading] = useState(false);
  const tz = r.timezone;
  const total = totalOf(r.counts);
  const details = r.cases.filter((c) => DETAIL_STATUSES.includes(c.status));
  const judgement = r.run.judgement
    ? JUDGEMENT_LABELS[r.run.judgement]
    : r.run.suggestedJudgement
      ? `suggested: ${JUDGEMENT_LABELS[r.run.suggestedJudgement]}`
      : 'no judgement yet';

  const download = async () => {
    setDownloading(true);
    try {
      await downloadRunReport(projectId, {
        id: r.run.id,
        code: r.run.code,
        planDocNo: r.plan.docNo,
      });
    } catch (err) {
      notifyError(err, 'Could not download the Excel report');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <div className={cn(styles.toolbar, 'flex flex-wrap items-center justify-between gap-3')}>
        <Button asChild variant="outline">
          <Link href={routes.run(projectId, r.run.id)}>
            <ArrowLeft />
            Back to run
          </Link>
        </Button>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" loading={downloading} onClick={() => void download()}>
            {!downloading && <Download />}
            Download Excel
          </Button>
          <Button onClick={() => window.print()}>
            <Printer />
            Print / Save as PDF
          </Button>
        </div>
      </div>

      <article className={styles.sheet} aria-label="Run report">
        <div className={styles.titleblock}>
          <div>
            <div className={styles.muted}>
              {r.project.name} <span className={styles.mono}>({r.project.key})</span>
            </div>
            <div className="text-[13px] font-semibold">Test run report</div>
          </div>
          <div className={cn(styles.muted, styles.generated)}>
            Generated {inZone(r.generatedAt, tz)} ({tz})
            <br />
            by {r.generatedBy.displayName}
          </div>
        </div>

        <h1>
          Run <span className={cn(styles.mono, 'text-[17px]')}>{r.run.code}</span>
          {r.run.scenario ? ` — ${r.run.scenario}` : ''} ({judgement})
        </h1>

        <h2>Run information</h2>
        <table className={styles.kv}>
          <tbody>
            <Kv
              rows={[
                [
                  'Test plan',
                  <>
                    <span className={styles.mono}>{r.plan.docNo}</span> — {r.plan.title}
                  </>,
                  'Plan status',
                  PLAN_STATUS_LABELS[r.plan.status],
                ],
                [
                  'Release',
                  r.plan.release?.name ?? '—',
                  'Suite',
                  `${r.run.suite.name} (${r.run.suite.prefix})`,
                ],
                [
                  'Tester',
                  r.run.tester?.displayName ?? '—',
                  'Tested date',
                  formatDate(r.run.testedDate),
                ],
                [
                  'Run created',
                  inZone(r.run.createdAt, tz),
                  'Re-run of',
                  r.run.sourceRun?.code ?? '—',
                ],
                [
                  'First executed',
                  inZone(r.firstExecutedAt, tz),
                  'Last executed',
                  inZone(r.lastExecutedAt, tz),
                ],
                [
                  'Estimate',
                  r.estimate.totalMinutes
                    ? `${formatMinutes(r.estimate.totalMinutes)} (remaining ${formatMinutes(r.estimate.remainingMinutes) || '0m'})`
                    : '—',
                  'Actual duration',
                  formatDuration(r.actualDurationSec),
                ],
                [
                  'Judgement',
                  r.run.judgement ? JUDGEMENT_LABELS[r.run.judgement] : 'Not set',
                  'Suggested',
                  r.run.suggestedJudgement ? JUDGEMENT_LABELS[r.run.suggestedJudgement] : '—',
                ],
              ]}
            />
            {r.run.judgementNote && <WideKv label="Judgement note" value={r.run.judgementNote} />}
            {r.run.remark && <WideKv label="Remark" value={r.run.remark} />}
          </tbody>
        </table>

        <h2>Environment</h2>
        {r.run.environment.length === 0 ? (
          <p className={styles.muted}>No environment values recorded.</p>
        ) : (
          <table className={styles.kv}>
            <tbody>
              <Kv
                rows={pairs(r.run.environment.map((e) => [e.label, e.value || '—'] as const))}
                mono
              />
            </tbody>
          </table>
        )}

        <h2>Status summary</h2>
        <div className={styles.keep}>
          <div className="mb-2">
            <StackedProgress counts={r.counts} height={10} />
          </div>
          <table className={cn(styles.table, styles.autoWidth)} aria-label="Status summary">
            <thead>
              <tr>
                <th>Status</th>
                <th className={styles.num}>Cases</th>
                <th className={styles.num}>Share</th>
              </tr>
            </thead>
            <tbody>
              {COLUMNS.map((s) => (
                <tr key={s}>
                  <td>
                    <ResultBadge status={s} />
                  </td>
                  <td className={styles.num}>{r.counts[s]}</td>
                  <td className={styles.num}>
                    {total ? formatPercent(r.counts[s] / total, 1) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td className={styles.num}>{total}</td>
                <td className={styles.num}>{total ? '100%' : '—'}</td>
              </tr>
            </tfoot>
          </table>
          <p className="mt-1.5">
            Executed <strong>{formatPercent(r.progress, 1)}</strong> ({total - r.counts.untested} of{' '}
            {total}) · Pass rate <strong>{formatPercent(r.passRate, 1)}</strong>{' '}
            <span className={styles.muted}>
              (OK + OK w/ cond. over OK, OK w/ cond., NG and Blocked)
            </span>
          </p>
        </div>

        <h2>Summary by section</h2>
        <SectionTable sections={r.sections} />

        {r.defects.length > 0 && (
          <>
            <h2>Defects ({r.defects.length})</h2>
            <table className={styles.table} aria-label="Defects">
              <thead>
                <tr>
                  <th className="w-[12%]">Key</th>
                  <th>Title</th>
                  <th className="w-[12%]">Severity</th>
                  <th className="w-[13%]">Status</th>
                  <th className="w-[18%]">Jira</th>
                </tr>
              </thead>
              <tbody>
                {r.defects.map((d) => (
                  <tr key={d.id}>
                    <td className={styles.mono}>{d.key}</td>
                    <td>{d.title}</td>
                    <td>{DEFECT_SEVERITY_LABELS[d.severity]}</td>
                    <td>{DEFECT_STATUS_LABELS[d.status]}</td>
                    <td>
                      {d.externalKey ? (
                        <>
                          <span className={styles.mono}>{d.externalKey}</span>
                          {d.externalStatus ? ` · ${d.externalStatus}` : ''}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <h2>Test instances ({r.cases.length})</h2>
        <div className={styles.scroll}>
          <table className={styles.table} aria-label="Test instances">
            <thead>
              <tr>
                <th className={cn(styles.num, 'w-[4%]')}>#</th>
                <th className="w-[13%]">ID</th>
                <th>Title</th>
                <th className="w-[11%]">Status</th>
                <th className="w-[13%]">Executed by</th>
                <th className="w-[14%]">Last run</th>
                <th className="w-[9%]">Defects</th>
              </tr>
            </thead>
            <tbody>
              {r.cases.map((c, i) => (
                <tr key={c.runCaseId}>
                  <td className={styles.num}>{i + 1}</td>
                  <td>
                    <span className={styles.mono}>{c.displayId}</span>
                    {c.code && (
                      <div className={cn(styles.mono, styles.muted, styles.small)}>{c.code}</div>
                    )}
                  </td>
                  <td>
                    {c.title}
                    {c.sectionPath.length > 0 && (
                      <div className={cn(styles.muted, styles.small)}>
                        {c.sectionPath.join(PATH_SEP)}
                      </div>
                    )}
                  </td>
                  <td>
                    <ResultBadge status={c.status} />
                  </td>
                  <td>{c.executedBy?.displayName ?? '—'}</td>
                  <td>{inZone(c.executedAt, tz)}</td>
                  <td className={styles.mono}>
                    {c.defects.length ? c.defects.map((d) => d.key).join(', ') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2>Details — NG, Blocked and OK with condition ({details.length})</h2>
        {details.length === 0 ? (
          <p className={styles.muted}>No case has one of these results.</p>
        ) : (
          details.map((c) => <CaseDetail key={c.runCaseId} c={c} tz={tz} />)
        )}
      </article>
    </>
  );
}

/** Two label/value pairs per row. */
function Kv({
  rows,
  mono = false,
}: {
  rows: readonly (readonly [ReactNode, ReactNode, ReactNode?, ReactNode?])[];
  mono?: boolean;
}) {
  return (
    <>
      {rows.map(([l1, v1, l2, v2], i) => (
        <tr key={i}>
          <th scope="row">{l1}</th>
          <td className={mono ? styles.mono : undefined}>{v1}</td>
          {l2 !== undefined ? (
            <>
              <th scope="row">{l2}</th>
              <td className={mono ? styles.mono : undefined}>{v2}</td>
            </>
          ) : (
            <>
              <th aria-hidden="true" />
              <td />
            </>
          )}
        </tr>
      ))}
    </>
  );
}

function WideKv({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td colSpan={3} className={styles.text}>
        {value}
      </td>
    </tr>
  );
}

function SectionTable({ sections }: { sections: { path: string[]; counts: StatusCounts }[] }) {
  if (sections.length === 0) return <p className={styles.muted}>No sections.</p>;
  const sum = (s: ResultStatus) => sections.reduce((n, x) => n + x.counts[s], 0);
  return (
    <div className={styles.scroll}>
      <table className={styles.table} aria-label="Summary by section">
        <thead>
          <tr>
            <th>Section</th>
            <th className={styles.num}>Total</th>
            {COLUMNS.map((s) => (
              <th key={s} className={styles.num}>
                {statusLabel(s)}
              </th>
            ))}
            <th className={styles.num}>Executed</th>
            <th className={styles.num}>Pass rate</th>
          </tr>
        </thead>
        <tbody>
          {sections.map((x, i) => (
            <tr key={i}>
              <td>{x.path.length ? x.path.join(PATH_SEP) : '(No section)'}</td>
              <td className={styles.num}>{totalOf(x.counts)}</td>
              {COLUMNS.map((s) => (
                <td key={s} className={styles.num}>
                  {x.counts[s] || ''}
                </td>
              ))}
              <td className={styles.num}>{formatPercent(progressOf(x.counts))}</td>
              <td className={styles.num}>{formatPercent(passRateOf(x.counts))}</td>
            </tr>
          ))}
        </tbody>
        {sections.length > 1 && (
          <tfoot>
            <tr>
              <td>Total</td>
              <td className={styles.num}>{sections.reduce((n, x) => n + totalOf(x.counts), 0)}</td>
              {COLUMNS.map((s) => (
                <td key={s} className={styles.num}>
                  {sum(s) || ''}
                </td>
              ))}
              <td />
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function CaseDetail({ c, tz }: { c: RunReportCaseDTO; tz: string }) {
  return (
    <section className={styles.case} aria-label={`${c.displayId} details`}>
      <div className="flex items-start justify-between gap-3">
        <h3>
          <span className={cn(styles.mono, 'text-xs')}>{c.displayId}</span>
          {c.code ? (
            <span className={cn(styles.mono, styles.muted)}> ({c.code})</span>
          ) : null} · {c.title}
        </h3>
        <ResultBadge status={c.status} />
      </div>
      <div className={cn(styles.muted, 'mt-0.5 mb-1.5 text-[11px]')}>
        {c.sectionPath.length ? `${c.sectionPath.join(PATH_SEP)} · ` : ''}
        {c.executedBy ? `${c.executedBy.displayName} · ` : ''}
        {inZone(c.executedAt, tz)}
        {c.elapsedSec ? ` · ${formatDuration(c.elapsedSec)}` : ''}
        {c.defects.length ? ` · Defects: ${c.defects.map((d) => d.key).join(', ')}` : ''}
      </div>
      <table className={styles.kv}>
        <tbody>
          <tr>
            <th scope="row">Actual result</th>
            <td className={styles.text}>{c.actualResult || '—'}</td>
          </tr>
          {c.resultRemark && (
            <tr>
              <th scope="row">Remark</th>
              <td className={styles.text}>{c.resultRemark}</td>
            </tr>
          )}
        </tbody>
      </table>
      {c.steps.length > 0 && (
        <div className={cn(styles.scroll, 'mt-1.5')}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={cn(styles.num, 'w-[5%]')}>#</th>
                <th>Action</th>
                <th>Expected</th>
                <th className="w-[13%]">Result</th>
                <th className="w-[24%]">Actual</th>
              </tr>
            </thead>
            <tbody>
              {c.steps.map((s, i) => (
                <tr key={i}>
                  <td className={styles.num}>{i + 1}</td>
                  <td className={styles.text}>{s.action}</td>
                  <td className={styles.text}>{s.expected || '—'}</td>
                  <td>
                    <ResultBadge status={s.status} />
                  </td>
                  <td className={styles.text}>{s.actual || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
