import type { RunDTO } from '@tmt/shared';
import { format } from 'date-fns';

export interface RunDue {
  date: string;
  /** Past the due date while cases are still untested. */
  overdue: boolean;
}

/** Due date of a run and whether it is overdue (`today` = `YYYY-MM-DD`, default: this computer's day). */
export function runDue(
  run: Pick<RunDTO, 'dueDate' | 'counts'>,
  today = format(new Date(), 'yyyy-MM-dd'),
): RunDue | null {
  if (!run.dueDate) return null;
  const finished = Object.values(run.counts).some((n) => n > 0) && run.counts.untested === 0;
  return { date: run.dueDate, overdue: !finished && run.dueDate < today };
}
