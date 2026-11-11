import { cn } from '@/lib/utils';

/** Test texts (procedure, expected result …) keep their line breaks. */
export function MultilineText({
  value,
  empty = '—',
  className,
}: {
  value: string | null | undefined;
  empty?: string;
  className?: string;
}) {
  if (!value) return <p className={cn('text-sm text-muted-foreground', className)}>{empty}</p>;
  return <p className={cn('text-sm whitespace-multiline', className)}>{value}</p>;
}
