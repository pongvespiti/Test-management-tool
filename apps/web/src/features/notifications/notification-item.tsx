import { NOTIFICATION_KIND_LABELS, type NotificationDTO } from '@tmt/shared';
import { cn } from '@/lib/utils';

/** One notification as a button that opens what it is about. */
export function NotificationItem({
  notification: n,
  time,
  onOpen,
}: {
  notification: NotificationDTO;
  time: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'flex w-full flex-col gap-0.5 px-4 py-3 text-left hover:bg-muted',
        !n.read && 'bg-primary/5',
      )}
    >
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        {!n.read && <span aria-label="Unread" className="size-2 rounded-full bg-primary" />}
        {NOTIFICATION_KIND_LABELS[n.kind]} · {time}
      </span>
      <span className={cn('text-sm', !n.read && 'font-semibold')}>{n.title}</span>
      {n.body && <span className="text-sm text-muted-foreground">{n.body}</span>}
    </button>
  );
}
