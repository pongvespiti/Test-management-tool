import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { MyWorkDTO, MyWorkRange } from '@tmt/shared';
import { api } from './client';
import { qk } from './keys';

/**
 * What waits for me and what I did in a day / week. `date` null = today (REPORT_TIMEZONE, set by
 * the server). Always refetched when the page opens: results are recorded all over the app.
 */
export function useMyWork(projectId: number, range: MyWorkRange, date: string | null) {
  return useQuery({
    queryKey: qk.myWork(projectId, range, date),
    queryFn: () =>
      api.get<MyWorkDTO>(`/projects/${projectId}/my-work`, {
        range,
        date: date ?? undefined,
      }),
    // Paging keeps the previous period on screen (dimmed) instead of a spinner.
    placeholderData: keepPreviousData,
    staleTime: 0,
    refetchOnMount: 'always',
  });
}
