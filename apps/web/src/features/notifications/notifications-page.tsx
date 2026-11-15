'use client';

import { Bell } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { EmptyState } from '@/components/common/empty-state';
import { QueryState } from '@/components/common/error-alert';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { useUrlSearchParams } from '@/hooks/use-url-search-params';
import { SegmentedControl } from '@/components/common/list-controls';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from '@/lib/api/notifications';
import { useRelativeTime, useT } from '@/lib/i18n';
import { useProject } from '@/providers/project-provider';
import { NotificationItem } from './notification-item';

const PAGE_SIZE = 100;

/** Route `/projects/[projectId]/notifications`: everything addressed to me in this project. */
export function NotificationsPage() {
  const { project, projectId } = useProject();
  const t = useT();
  const relative = useRelativeTime();
  const router = useRouter();
  const [params, setParams] = useUrlSearchParams();
  const unreadOnly = params.get('show') === 'unread';
  const query = useNotifications(projectId, { unread: unreadOnly || undefined, limit: PAGE_SIZE });
  const read = useMarkNotificationRead(projectId);
  const readAll = useMarkAllNotificationsRead(projectId);
  const items = query.data?.items ?? [];

  return (
    <>
      <PageHeader
        eyebrow={project.name}
        title="Notifications"
        subtitle={t('Runs given to you, due dates, fixes to retest and requirements that changed')}
        actions={
          <Button
            variant="outline"
            disabled={(query.data?.unread ?? 0) === 0}
            onClick={() => readAll.mutate()}
          >
            {t('Mark all as read')}
          </Button>
        }
      />
      <div className="mb-4">
        <SegmentedControl
          aria-label="Show"
          value={unreadOnly ? 'unread' : 'all'}
          onChange={(v) =>
            setParams((prev) => {
              const next = new URLSearchParams(prev);
              if (v === 'unread') next.set('show', 'unread');
              else next.delete('show');
              return next;
            })
          }
          options={[
            { value: 'all', label: t('All') },
            { value: 'unread', label: t('Unread') },
          ]}
        />
      </div>
      <QueryState query={query}>
        {items.length === 0 ? (
          <EmptyState
            icon={<Bell className="size-6" strokeWidth={1.6} />}
            title={t(unreadOnly ? 'No unread notifications' : 'No notifications yet')}
            description={t(
              'You are told when a run is given to you, when one is due or overdue, when a defect you reported is ready for retest and when a requirement you test changes.',
            )}
          />
        ) : (
          <ul
            aria-label="Notifications"
            className="divide-y overflow-hidden rounded-xl border bg-card"
          >
            {items.map((n) => (
              <li key={n.id}>
                <NotificationItem
                  notification={n}
                  time={relative(n.createdAt)}
                  onOpen={() => {
                    if (!n.read) read.mutate(n.id);
                    router.push(n.link);
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </>
  );
}
