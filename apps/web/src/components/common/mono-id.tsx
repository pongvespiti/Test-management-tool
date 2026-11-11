import { cn } from '@/lib/utils';

/** Ids, codes and document numbers in the monospace font. */
export function MonoId({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('font-mono text-[13px] font-medium whitespace-nowrap', className)}>
      {children}
    </span>
  );
}
