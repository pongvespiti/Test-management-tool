import type { RunStepDTO, StepResultDTO } from '@tmt/shared';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ResultBadge } from './badges';
import { MultilineText } from './multiline-text';

/**
 * Read-only step table (library preview or run snapshot). Steps that came from a shared step
 * carry its name. Pass `results` (index-aligned) to show per-step results.
 */
export function StepsView({
  steps,
  results,
}: {
  steps: readonly Pick<RunStepDTO, 'action' | 'expected' | 'sharedStepName'>[];
  results?: readonly StepResultDTO[] | null;
}) {
  if (steps.length === 0) return <p className="text-sm text-muted-foreground">No steps</p>;
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-11">#</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Expected result</TableHead>
            {results && <TableHead className="w-28">Result</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {steps.map((s, i) => {
            const r = results?.[i];
            return (
              <TableRow key={i} className="align-top">
                <TableCell className="align-top">{i + 1}</TableCell>
                <TableCell className="align-top whitespace-normal">
                  {s.sharedStepName && (
                    <p className="mb-0.5 text-xs text-muted-foreground">
                      Shared: {s.sharedStepName}
                    </p>
                  )}
                  <MultilineText value={s.action} />
                </TableCell>
                <TableCell className="align-top whitespace-normal">
                  <MultilineText value={s.expected} />
                </TableCell>
                {results && (
                  <TableCell className="align-top">
                    <ResultBadge status={r?.status ?? 'untested'} />
                    {r?.actual ? (
                      <p className="mt-1 text-xs whitespace-multiline">{r.actual}</p>
                    ) : null}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
