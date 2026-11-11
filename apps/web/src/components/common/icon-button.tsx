'use client';

import type { ReactNode } from 'react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

type IconButtonProps = Omit<ButtonProps, 'children' | 'size' | 'variant'> & {
  /** Accessible name and tooltip text. */
  label: string;
  children: ReactNode;
  tone?: 'default' | 'danger';
  size?: 'icon' | 'icon-sm';
};

/** Square icon-only button with a tooltip (row actions, toolbars). */
export function IconButton({
  label,
  children,
  tone = 'default',
  size = 'icon-sm',
  className,
  type = 'button',
  ...props
}: IconButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type={type}
          variant="ghost"
          size={size}
          aria-label={label}
          className={cn(
            tone === 'danger'
              ? 'text-destructive hover:bg-destructive/10 hover:text-destructive'
              : 'text-muted-foreground',
            className,
          )}
          {...props}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
