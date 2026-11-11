import { ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

/**
 * Jira key (link to the issue in a new tab when the URL is known) and the last synced Jira status.
 * The external status is shown neutrally: its colours belong to Jira's workflow, not ours.
 */
export function JiraKey({
  issueKey,
  url,
  status,
  stacked = false,
}: {
  issueKey: string;
  url: string | null;
  status: string | null;
  stacked?: boolean;
}) {
  const key = url ? (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      aria-label={`${issueKey} (opens Jira in a new tab)`}
      className="inline-flex items-center gap-1 font-mono text-sm font-semibold whitespace-nowrap text-primary hover:underline"
    >
      {issueKey}
      <ExternalLink className="size-[13px]" aria-hidden />
    </a>
  ) : (
    <span className="font-mono text-sm font-semibold whitespace-nowrap">{issueKey}</span>
  );
  const badge = status ? (
    <Badge variant="outline" title="Status in Jira" className="font-semibold">
      {status}
    </Badge>
  ) : null;
  if (stacked)
    return (
      <div>
        {key}
        {badge && <div className="mt-0.5">{badge}</div>}
      </div>
    );
  return (
    <div className="flex flex-wrap items-center gap-2">
      {key}
      {badge}
    </div>
  );
}
