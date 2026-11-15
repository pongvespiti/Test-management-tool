import { NOTIFICATION_KIND_LABELS, renderMessage, type NotificationDTO } from '@tmt/shared';
import { useLocale, useT } from '@/lib/i18n';
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
  const { locale } = useLocale();
  const t = useT();
  // Stored as a message: shown in the reader's language; older ones keep their English text.
  const title = n.message ? renderMessage(n.message.title, locale) : n.title;
  const body = n.message ? (n.message.body ? renderMessage(n.message.body, locale) : null) : n.body;
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
        {t(NOTIFICATION_KIND_LABELS[n.kind])} · {time}
      </span>
      <span className={cn('text-sm', !n.read && 'font-semibold')}>{title}</span>
      {body && <span className="text-sm text-muted-foreground">{body}</span>}
    </button>
  );
}
