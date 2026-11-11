import { flattenSteps, formatMinutes, type SuiteDTO, type TestCaseDTO } from '@tmt/shared';
import { TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { CasePriorityLabel } from '@/components/common/case-priority-label';
import { MultilineText } from '@/components/common/multiline-text';
import { StepsView } from '@/components/common/steps-view';
import { TagList } from '@/components/common/tag-list';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { formatDateTime, pluralize } from '@/lib/format';
import { FieldCaption, LabeledDivider } from '@/components/common/list-controls';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <FieldCaption>{label}</FieldCaption>
      {children}
    </div>
  );
}

/** Properties, steps (or procedure/expected text), custom fields and provenance of a library case. */
export function CaseDetailsTab({
  testCase: tc,
  suite,
}: {
  testCase: TestCaseDTO;
  suite: SuiteDTO;
}) {
  const customDefs = suite.fieldDefs.filter((d) => (tc.custom[d.key] ?? '') !== '');
  const steps = tc.template === 'steps' ? flattenSteps(tc.steps) : [];
  const missing =
    tc.template === 'steps' ? tc.steps.filter((s) => s.kind === 'shared' && s.missing) : [];
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 min-[36em]:grid-cols-3">
        <Field label="Priority">
          <div className="text-sm">
            <CasePriorityLabel priority={tc.priority} />
          </div>
        </Field>
        <Field label="Estimate">
          <p className="text-sm">{formatMinutes(tc.estimateMinutes) || '—'}</p>
        </Field>
        <Field label="References">
          <p className="text-sm [overflow-wrap:anywhere]">{tc.references || '—'}</p>
        </Field>
      </div>
      {tc.tags.length > 0 && (
        <Field label="Tags">
          <TagList tags={tc.tags} max={12} wrap />
        </Field>
      )}
      <Field label="Precondition">
        <MultilineText value={tc.precondition} />
      </Field>
      {tc.template === 'steps' ? (
        <Field label={`Steps (${steps.length})`}>
          <div className="flex flex-col gap-2">
            {missing.length > 0 && (
              <Alert variant="warning" className="py-2">
                <TriangleAlert />
                <AlertDescription>
                  {pluralize(missing.length, 'shared step')} used by this case{' '}
                  {missing.length === 1 ? 'was' : 'were'} deleted and add no steps. Edit the case to
                  remove {missing.length === 1 ? 'it' : 'them'}.
                </AlertDescription>
              </Alert>
            )}
            <StepsView steps={steps} />
          </div>
        </Field>
      ) : (
        <>
          <Field label="Procedure">
            <MultilineText value={tc.procedure} />
          </Field>
          <Field label="Expected result">
            <MultilineText value={tc.expected} />
          </Field>
        </>
      )}
      {(tc.remark || tc.summaryGroup) && (
        <div className="grid gap-4 min-[36em]:grid-cols-2">
          {tc.remark && (
            <Field label="Remark">
              <MultilineText value={tc.remark} />
            </Field>
          )}
          {tc.summaryGroup && (
            <Field label="Summary group">
              <p className="text-sm">{tc.summaryGroup}</p>
            </Field>
          )}
        </div>
      )}
      {customDefs.length > 0 && (
        <>
          <LabeledDivider label="Custom fields" />
          <div className="grid gap-4 min-[36em]:grid-cols-2">
            {customDefs.map((d) => (
              <Field key={d.key} label={d.label}>
                <MultilineText value={tc.custom[d.key] ?? null} />
              </Field>
            ))}
          </div>
        </>
      )}
      <Separator />
      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
        {tc.source?.fileName && (
          <p>
            Imported from {tc.source.fileName}
            {tc.source.sheet ? ` · sheet “${tc.source.sheet}”` : ''}
            {tc.source.row ? ` · row ${tc.source.row}` : ''}
          </p>
        )}
        <p>
          Created {formatDateTime(tc.createdAt)}
          {tc.createdBy ? ` by ${tc.createdBy.displayName}` : ''} · updated{' '}
          {formatDateTime(tc.updatedAt)}
          {tc.updatedBy ? ` by ${tc.updatedBy.displayName}` : ''} · version {tc.version}
        </p>
      </div>
    </div>
  );
}
