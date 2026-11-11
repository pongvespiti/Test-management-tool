'use client';

import { Check, Copy, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { copyText } from '@/lib/clipboard';
import { cn } from '@/lib/utils';

/** Monospace snippet (a placeholder) that copies itself on click — compact for long lists. */
export function CopyCode({ value, invalid = false }: { value: string; invalid?: boolean }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const t = window.setTimeout(() => setState('idle'), 1500);
    return () => window.clearTimeout(t);
  }, [state]);

  const Icon = state === 'copied' ? Check : state === 'failed' ? X : Copy;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`Copy ${value}`}
          onClick={(e) => {
            const button = e.currentTarget;
            void copyText(value, button).then((ok) => setState(ok ? 'copied' : 'failed'));
          }}
          className={cn(
            'inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-0.5 text-left font-mono text-[12.5px] leading-5 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
            invalid
              ? 'border-[#ffc9c9] bg-[#fff5f5] text-destructive'
              : 'border-border bg-secondary text-foreground hover:bg-[#e9ecef]',
          )}
        >
          <span className="[overflow-wrap:anywhere]">{value}</span>
          <Icon
            aria-hidden
            className={cn(
              'size-[13px] shrink-0',
              state === 'copied' ? 'text-success' : 'text-muted-foreground',
            )}
          />
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {state === 'copied'
          ? 'Copied'
          : state === 'failed'
            ? 'Copy failed — select and copy manually'
            : 'Copy'}
      </TooltipContent>
    </Tooltip>
  );
}
