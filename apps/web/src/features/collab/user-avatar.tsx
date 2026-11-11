'use client';

import type { UserRef } from '@tmt/shared';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { initials } from '@/lib/format';
import { cn } from '@/lib/utils';

const SIZES = {
  22: 'size-[22px] text-[11px]',
  24: 'size-6 text-[11px]',
  26: 'size-[26px] text-[11px]',
  28: 'size-7 text-xs',
} as const;

/**
 * Initials badge for a person. `inherited` = not set explicitly (e.g. the run tester used as the
 * default assignee) and is drawn as a dashed outline.
 */
export function UserAvatar({
  user,
  size = 26,
  inherited = false,
  label,
}: {
  user: Pick<UserRef, 'displayName'>;
  size?: keyof typeof SIZES;
  inherited?: boolean;
  label?: string;
}) {
  const title = label ?? (inherited ? `${user.displayName} (run tester)` : user.displayName);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={title}
          className={cn(
            'inline-flex shrink-0 items-center justify-center rounded-full border leading-none font-bold select-none',
            SIZES[size],
            inherited
              ? 'border-dashed border-[#adb5bd] bg-white text-[#5c6670]'
              : 'border-transparent bg-[#d0ebff] text-[#1864ab]',
          )}
        >
          {initials(user.displayName)}
        </span>
      </TooltipTrigger>
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  );
}
