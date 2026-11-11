import { CopyButton } from '@/components/common/copy-button';
import { cn } from '@/lib/utils';

/** Monospace block (shell command, JSON) with a copy button in the corner. */
export function CodeBlock({
  code,
  label,
  copyLabel = 'Copy',
  scroll = false,
}: {
  code: string;
  /** Small caption above the block. */
  label?: string;
  copyLabel?: string;
  /** Limit the height (long JSON schemas). */
  scroll?: boolean;
}) {
  return (
    <div>
      {label && <p className="mb-1 text-xs font-semibold text-muted-foreground">{label}</p>}
      <div className="relative">
        {/* Long URLs/tokens break at the edge (not at the indentation of a continued line). */}
        <pre
          className={cn(
            'm-0 rounded-md border bg-muted p-3 pr-13 font-mono text-[12.5px] leading-relaxed break-all whitespace-pre-wrap',
            scroll && 'max-h-[420px] overflow-y-auto',
          )}
        >
          <code>{code}</code>
        </pre>
        <div className="absolute top-1.5 right-1.5">
          <CopyButton value={code} label={copyLabel} />
        </div>
      </div>
    </div>
  );
}
