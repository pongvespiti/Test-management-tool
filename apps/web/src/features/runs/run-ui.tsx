import type { ReactNode } from 'react';
import { MultilineText } from '@/components/common/multiline-text';
import { cn } from '@/lib/utils';

/** Classes of the small upper-case labels (PRECONDITION, EXPECTED RESULT …), also for <label>. */
export const FIELD_LABEL =
  'm-0 text-xs font-bold tracking-[0.04em] text-muted-foreground uppercase';

/** Small upper-case label above a block, as in the mockup. */
export function FieldLabel({
  children,
  as: Tag = 'h3',
  id,
  className,
}: {
  children: ReactNode;
  as?: 'h3' | 'h4' | 'div';
  id?: string;
  className?: string;
}) {
  return (
    <Tag id={id} className={cn(FIELD_LABEL, className)}>
      {children}
    </Tag>
  );
}

const TONES = {
  gray: 'border-[#edf0f2] bg-[#f8f9fa]',
  red: 'border-[#ffe3e3] bg-[#fff5f5]',
} as const;

/** Labelled read-only text block on a light background (test texts keep their line breaks). */
export function TextBlock({
  label,
  value,
  empty = '—',
  tone = 'gray',
}: {
  label: ReactNode;
  value: string | null | undefined;
  empty?: string;
  tone?: keyof typeof TONES;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <FieldLabel>{label}</FieldLabel>
      <div className={cn('rounded-lg border px-3 py-2', TONES[tone])}>
        <MultilineText value={value} empty={empty} />
      </div>
    </div>
  );
}

/** Label/value pair of a property list (`dl` semantics). */
export function Property({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="m-0 text-sm font-medium [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}
