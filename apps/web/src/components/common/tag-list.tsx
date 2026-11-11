import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/** Read-only tags; shows the first `max` and a "+N" badge with the rest in a tooltip. */
export function TagList({
  tags,
  max = 3,
  wrap = false,
}: {
  tags: readonly string[];
  max?: number;
  wrap?: boolean;
}) {
  if (tags.length === 0) return null;
  const shown = tags.slice(0, max);
  const rest = tags.slice(max);
  return (
    <div className={cn('flex min-w-0 items-center gap-1', wrap ? 'flex-wrap' : 'flex-nowrap')}>
      {shown.map((t) => (
        <Badge key={t} variant="secondary" className="font-normal">
          {t}
        </Badge>
      ))}
      {rest.length > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="font-normal">
              +{rest.length}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>{rest.join(', ')}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
