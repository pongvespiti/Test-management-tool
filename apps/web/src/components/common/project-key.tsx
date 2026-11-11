import { cn } from '@/lib/utils';

/** Project key chip (`ACS`, `TEAM`) — monospace on the light primary tint. */
export function ProjectKey({ children, className }: { children: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-block rounded-md bg-accent px-1.5 py-0.5 font-mono text-xs font-semibold text-accent-foreground',
        className,
      )}
    >
      {children}
    </span>
  );
}
