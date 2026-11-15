'use client';

import { Bell } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from '@/lib/api/notifications';
import { useRelativeTime, useT } from '@/lib/i18n';
import { routes } from '@/lib/routes';
import { useOptionalProject } from '@/providers/project-provider';
import { NotificationItem } from '@/features/notifications/notification-item';

const PREVIEW = 8;

/**
 * Bell in the header: unread count and the latest notifications — of the open project plus the
 * lab-wide ones (test stand requests), or only the lab-wide ones outside projects.
 */
export function NotificationBell() {
  const project = useOptionalProject();
  return <BellMenu key={project?.projectId ?? 'lab'} projectId={project?.projectId ?? null} />;
}

function BellMenu({ projectId }: { projectId: number | null }) {
  const t = useT();
  const relative = useRelativeTime();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const query = useNotifications(projectId, { limit: PREVIEW });
  const read = useMarkNotificationRead(projectId);
  const readAll = useMarkAllNotificationsRead(projectId);
  const unread = query.data?.unread ?? 0;
  const items = query.data?.items ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={
            unread > 0 ? `${t('Notifications')}, ${unread} ${t('unread')}` : t('Notifications')
          }
        >
          <Bell />
          {unread > 0 && (
            <span
              aria-hidden
              className="absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] leading-4 font-semibold text-white"
            >
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">{t('Notifications')}</h2>
          <Button
            variant="ghost"
            size="sm"
            disabled={unread === 0}
            onClick={() => readAll.mutate()}
          >
            {t('Mark all as read')}
          </Button>
        </div>
        {items.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            {projectId === null
              ? t('Nothing new. Test stand requests and their answers show up here.')
              : t(
                  'Nothing new. Runs given to you, fixes to retest, due dates and test stand requests show up here.',
                )}
          </p>
        ) : (
          <ul aria-label={t('Latest notifications')} className="max-h-96 divide-y overflow-auto">
            {items.map((n) => (
              <li key={n.id}>
                <NotificationItem
                  notification={n}
                  onOpen={() => {
                    if (!n.read) read.mutate(n.id);
                    setOpen(false);
                    router.push(n.link);
                  }}
                  time={relative(n.createdAt)}
                />
              </li>
            ))}
          </ul>
        )}
        <div className="border-t px-4 py-2 text-right">
          <Link
            href={
              projectId === null
                ? routes.stands({ tab: 'requests' })
                : routes.notifications(projectId)
            }
            className="text-sm text-primary hover:underline"
            onClick={() => setOpen(false)}
          >
            {t(projectId === null ? 'Stand requests' : 'See all')}
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
