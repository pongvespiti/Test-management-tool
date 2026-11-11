import { cn } from '@/lib/utils';

/** Product mark + name from the approved mockup. */
export function Logo({
  size = 30,
  withText = true,
  className,
}: {
  size?: number;
  withText?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5 whitespace-nowrap', className)}>
      <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24">
        <rect x="1.5" y="1.5" width="21" height="21" rx="6" className="fill-primary" />
        <path
          d="M7.5 12.5l3 3 6-6.5"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {withText && (
        <span className="text-base font-bold tracking-[-0.01em] text-foreground">
          Test Management
        </span>
      )}
    </span>
  );
}
