import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NotificationListDTO } from '@tmt/shared';
import { api } from './client';
import { qk } from './keys';

/** Project notifications (with lab-wide ones), or only lab-wide ones outside projects (`null`). */
const base = (projectId: number | null) =>
  projectId === null ? '/notifications' : `/projects/${projectId}/notifications`;

/** How often the bell looks for new notifications. */
export const NOTIFICATION_POLL_MS = 60_000;

/** My notifications in the project; polled so the bell notices new ones. */
export function useNotifications(
  projectId: number | null,
  params: { unread?: boolean; limit?: number } = {},
) {
  return useQuery({
    queryKey: qk.notificationList(projectId, params),
    queryFn: () =>
      api.get<NotificationListDTO>(base(projectId), {
        unread: params.unread === undefined ? undefined : String(params.unread),
        limit: params.limit,
      }),
    refetchInterval: NOTIFICATION_POLL_MS,
    placeholderData: keepPreviousData,
  });
}

export function useMarkNotificationRead(projectId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post<void>(`${base(projectId)}/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function useMarkAllNotificationsRead(projectId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>(`${base(projectId)}/read-all`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}
