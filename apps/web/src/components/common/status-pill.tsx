import type { CSSProperties, ReactNode } from 'react';
import type { Tone } from '@/lib/status';

interface StatusPillProps {
  tone: Tone;
  children: ReactNode;
  size?: 'sm' | 'md';
  /** Fixed minimum width so pills in a column line up. */
  minWidth?: number;
  title?: string;
  leftSection?: ReactNode;
}

/** Rounded status pill with the mockup palette (text always readable on its background). */
export function StatusPill({
  tone,
  children,
  size = 'sm',
  minWidth,
  title,
  leftSection,
}: StatusPillProps) {
  const style: CSSProperties = {
    minWidth,
    background: tone.bg,
    color: tone.fg,
    border: tone.border ? `1px ${tone.dashed ? 'dashed' : 'solid'} ${tone.border}` : undefined,
  };
  return (
    <span
      title={title}
      style={style}
      className={
        size === 'sm'
          ? 'inline-flex h-[22px] items-center justify-center gap-1.5 rounded-full px-2 text-xs leading-none font-semibold whitespace-nowrap'
          : 'inline-flex h-[26px] items-center justify-center gap-1.5 rounded-full px-2.5 text-xs leading-none font-semibold whitespace-nowrap'
      }
    >
      {leftSection}
      {children}
    </span>
  );
}
