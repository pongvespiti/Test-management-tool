'use client';

import { DEFECT_STATUS_LABELS, type AttentionItemDTO, type DefectListItem } from '@tmt/shared';
import { CheckCheck, Smile } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { DefectStatusBadge, ResultBadge } from '@/components/common/badges';
import { EmptyState } from '@/components/common/empty-state';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SectionCard } from '@/features/reports/report-ui';
import { routes } from '@/lib/routes';
import { SEVERITY_DOTS } from '@/lib/status';
import { useProject } from '@/providers/project-provider';
import { attentionDetail, attentionMeta, defectMeta } from './dashboard-format';

function ListRow({ children }: { children: ReactNode }) {
  return (
    <li className="flex flex-wrap items-start gap-3 border-t border-divider px-5 py-3">
      {children}
    </li>
  );
}

const LINK = 'text-sm font-semibold [overflow-wrap:anywhere] text-foreground hover:underline';

/** Latest NG and OK-with-condition results of the release, each linked to its run case. */
export function AttentionList({
  items,
  scope,
}: {
  items: AttentionItemDTO[];
  /** 'this release' or 'the project' (wording of the empty state). */
  scope: string;
}) {
  const { projectId } = useProject();
  return (
    <SectionCard
      title="Needs attention — NG & conditional results"
      actions={
        <Link
          href={routes.plans(projectId)}
          className="text-sm font-semibold text-primary hover:underline"
        >
          Open plans
        </Link>
      }
      flush
      className="h-full"
    >
      {items.length === 0 ? (
        <EmptyState
          compact
          icon={<Smile className="size-6" strokeWidth={1.6} />}
          title="Nothing needs attention"
          description={`No NG or OK-with-condition results in ${scope}.`}
        />
      ) : (
        <ul className="m-0 list-none p-0">
          {items.map((item) => {
            const detail = attentionDetail(item);
            return (
              <ListRow key={item.runCaseId}>
                <div className="min-w-[92px] flex-none">
                  <ResultBadge status={item.status} />
                </div>
                <div className="min-w-0 flex-[1_1_240px]">
                  <Link
                    href={routes.run(projectId, item.runId, { case: item.runCaseId })}
                    className={LINK}
                  >
                    {item.title}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-mono">{item.code ?? item.displayId}</span> ·{' '}
                    {attentionMeta(item)}
                  </p>
                  {detail && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-[#495057]" title={detail}>
                      {detail}
                    </p>
                  )}
                </div>
                {item.defect ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        href={routes.defect(projectId, item.defect.id)}
                        className="flex-none font-mono text-xs font-semibold text-primary hover:underline"
                      >
                        {item.defect.key}
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent>
                      {item.defect.title} ({DEFECT_STATUS_LABELS[item.defect.status].toLowerCase()})
                    </TooltipContent>
                  </Tooltip>
                ) : item.status === 'ng' ? (
                  <span className="flex-none text-xs text-muted-foreground">No defect linked</span>
                ) : null}
              </ListRow>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

/** Open defects of the release, most severe first. */
export function OpenDefectsList({
  defects,
  total,
  scope,
}: {
  defects: DefectListItem[];
  total: number;
  /** 'this release' or 'the project' (wording of the empty state). */
  scope: string;
}) {
  const { projectId } = useProject();
  return (
    <SectionCard
      title="Open defects"
      actions={
        <Link
          href={routes.defects(projectId)}
          className="text-sm font-semibold text-primary hover:underline"
        >
          {total > defects.length ? `View all ${total}` : 'View all'}
        </Link>
      }
      flush
      className="h-full"
    >
      {defects.length === 0 ? (
        <EmptyState
          compact
          icon={<CheckCheck className="size-6" strokeWidth={1.6} />}
          title="No open defects"
          description={`Open defects of ${scope} show up here until they are resolved.`}
        />
      ) : (
        <ul className="m-0 list-none p-0">
          {defects.map((d) => (
            <ListRow key={d.id}>
              <span
                aria-hidden
                className="mt-1.5 size-2.5 flex-none rounded-full"
                style={{ background: SEVERITY_DOTS[d.severity] }}
              />
              <div className="min-w-0 flex-[1_1_200px]">
                <Link href={routes.defect(projectId, d.id)} className={LINK}>
                  {d.title}
                </Link>
                <p className="text-xs text-muted-foreground">{defectMeta(d)}</p>
              </div>
              <div className="flex-none">
                <DefectStatusBadge status={d.status} />
              </div>
            </ListRow>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
