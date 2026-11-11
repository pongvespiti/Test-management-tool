'use client';

import type { CaseVersionDTO, FieldDef } from '@tmt/shared';
import { Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { QueryState } from '@/components/common/error-alert';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { useCaseVersions } from '@/lib/api/library';
import { formatDateTime, formatRelative } from '@/lib/format';
import { useProject } from '@/providers/project-provider';
import { diffCaseVersions, type FieldChange } from './case-diff';

/** Version history of a library case with the fields changed in each version (timeline). */
export function CaseHistoryTab({
  caseId,
  fieldDefs,
  sectionName,
}: {
  caseId: number;
  fieldDefs: FieldDef[];
  sectionName: (id: number) => string | null;
}) {
  const { projectId } = useProject();
  const versions = useCaseVersions(projectId, caseId);
  const list = versions.data ?? [];

  return (
    <QueryState query={versions}>
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">No history recorded.</p>
      ) : (
        <ol aria-label="Versions" className="flex flex-col">
          {list.map((v, i) => {
            const older = list[i + 1];
            const changes = older
              ? diffCaseVersions(v.data, older.data, fieldDefs, sectionName)
              : null;
            return (
              <li key={v.version} className="relative pb-5 pl-9 last:pb-0">
                {i < list.length - 1 && (
                  <span
                    aria-hidden
                    className="absolute top-6 bottom-0 left-[11px] w-0.5 bg-[#a5d8ff]"
                  />
                )}
                <span
                  aria-hidden
                  className="absolute top-0 left-0 grid size-6 place-items-center rounded-full bg-primary text-primary-foreground"
                >
                  {changes ? <Pencil className="size-3" /> : <Plus className="size-3" />}
                </span>
                <VersionTitle version={v} />
                {changes === null ? (
                  <p className="text-sm text-muted-foreground">
                    {i === list.length - 1 && v.version === 1 ? 'Created' : 'Oldest stored version'}
                  </p>
                ) : (
                  <Changes changes={changes} />
                )}
              </li>
            );
          })}
        </ol>
      )}
    </QueryState>
  );
}

function VersionTitle({ version: v }: { version: CaseVersionDTO }) {
  return (
    <p className="text-sm font-semibold">
      Version {v.version}
      <span
        className="text-xs font-normal text-muted-foreground"
        title={formatDateTime(v.changedAt)}
      >
        {' · '}
        {v.changedBy?.displayName ?? 'System'} · {formatRelative(v.changedAt)}
      </span>
    </p>
  );
}

function Changes({ changes }: { changes: FieldChange[] }) {
  const [open, setOpen] = useState(false);
  if (changes.length === 0)
    return <p className="text-sm text-muted-foreground">No visible field changes</p>;
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <p className="text-sm text-muted-foreground">
        Changed: {changes.map((c) => c.label).join(', ')}
      </p>
      <Button
        variant="ghost"
        size="sm"
        className="mt-0.5 h-6 px-1.5 text-xs text-primary"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? 'Hide details' : 'Show details'}
      </Button>
      <CollapsibleContent>
        <table className="mt-2 w-full table-fixed border text-xs">
          <thead className="bg-muted">
            <tr>
              <th className="w-[120px] border-b px-2 py-1.5 text-left font-semibold">Field</th>
              <th className="border-b px-2 py-1.5 text-left font-semibold">Before</th>
              <th className="border-b px-2 py-1.5 text-left font-semibold">After</th>
            </tr>
          </thead>
          <tbody>
            {changes.map((c) => (
              <tr key={c.label} className="border-b align-top last:border-0">
                <td className="px-2 py-1.5 font-semibold">{c.label}</td>
                <td className="px-2 py-1.5">
                  <p className="line-clamp-6 text-muted-foreground whitespace-multiline">
                    {c.before}
                  </p>
                </td>
                <td className="px-2 py-1.5">
                  <p className="line-clamp-6 whitespace-multiline">{c.after}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CollapsibleContent>
    </Collapsible>
  );
}
