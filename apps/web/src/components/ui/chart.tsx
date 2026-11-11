'use client';

import * as React from 'react';
import * as RechartsPrimitive from 'recharts';
import type { TooltipContentProps, TooltipPayload, TooltipPayloadEntry } from 'recharts';
import { cn } from '@/lib/utils';

/*
 * shadcn/ui chart helpers (new-york), adapted to recharts 3: `ChartContainer` sizes the chart and
 * exposes the series config as `--color-<key>` CSS variables, `ChartTooltipContent` renders the
 * tooltip in the app style. Extras over the stock file: `height` (fixed chart height),
 * `hideZero` (no rows for zero values) and `valueFormatter` on the tooltip.
 */

// Format: { THEME_NAME: CSS_SELECTOR }
const THEMES = { light: '', dark: '.dark' } as const;

export type ChartConfig = {
  [k in string]: {
    label?: React.ReactNode;
    icon?: React.ComponentType;
  } & (
    | { color?: string; theme?: never }
    | { color?: never; theme: Record<keyof typeof THEMES, string> }
  );
};

type ChartContextProps = { config: ChartConfig };

const ChartContext = React.createContext<ChartContextProps | null>(null);

function useChart() {
  const context = React.useContext(ChartContext);
  if (!context) throw new Error('useChart must be used within a <ChartContainer />');
  return context;
}

function ChartContainer({
  id,
  className,
  children,
  config,
  height,
  style,
  ...props
}: React.ComponentProps<'div'> & {
  config: ChartConfig;
  /** Fixed height in px (the width follows the container). */
  height?: number;
  children: React.ReactElement;
}) {
  const uniqueId = React.useId();
  const chartId = `chart-${id || uniqueId.replace(/:/g, '')}`;
  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-slot="chart"
        data-chart={chartId}
        className={cn(
          "flex w-full justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-hidden [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border [&_.recharts-surface]:outline-hidden",
          height === undefined && 'aspect-video',
          className,
        )}
        style={height === undefined ? style : { ...style, height }}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

function ChartStyle({ id, config }: { id: string; config: ChartConfig }) {
  const colorConfig = Object.entries(config).filter(([, c]) => c.theme || c.color);
  if (!colorConfig.length) return null;
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: Object.entries(THEMES)
          .map(
            ([theme, prefix]) => `
${prefix} [data-chart=${id}] {
${colorConfig
  .map(([key, itemConfig]) => {
    const color = itemConfig.theme?.[theme as keyof typeof itemConfig.theme] || itemConfig.color;
    return color ? `  --color-${key}: ${color};` : null;
  })
  .join('\n')}
}
`,
          )
          .join('\n'),
      }}
    />
  );
}

const ChartTooltip = RechartsPrimitive.Tooltip;

type ChartTooltipContentProps = Partial<
  Pick<TooltipContentProps<number | string, string>, 'active' | 'label'>
> & {
  payload?: TooltipPayload;
  className?: string;
  hideLabel?: boolean;
  hideIndicator?: boolean;
  /** Leaves out rows whose value is 0 (stacked series with many empty statuses). */
  hideZero?: boolean;
  indicator?: 'line' | 'dot' | 'dashed';
  nameKey?: string;
  labelKey?: string;
  labelFormatter?: (label: React.ReactNode, payload: TooltipPayload) => React.ReactNode;
  valueFormatter?: (value: number) => React.ReactNode;
  labelClassName?: string;
  color?: string;
};

function ChartTooltipContent({
  active,
  payload,
  className,
  indicator = 'dot',
  hideLabel = false,
  hideIndicator = false,
  hideZero = false,
  label,
  labelFormatter,
  valueFormatter,
  labelClassName,
  color,
  nameKey,
  labelKey,
}: ChartTooltipContentProps) {
  const { config } = useChart();

  if (!active || !payload?.length) return null;

  const [first] = payload;
  const labelConfig = getPayloadConfigFromPayload(
    config,
    first,
    `${labelKey || first?.dataKey || first?.name || 'value'}`,
  );
  const labelValue =
    !labelKey && (typeof label === 'string' || typeof label === 'number')
      ? (config[String(label)]?.label ?? label)
      : labelConfig?.label;
  const tooltipLabel = hideLabel ? null : labelFormatter ? (
    <div className={cn('font-medium', labelClassName)}>{labelFormatter(labelValue, payload)}</div>
  ) : labelValue !== undefined && labelValue !== '' ? (
    <div className={cn('font-medium', labelClassName)}>{labelValue}</div>
  ) : null;

  const rows = payload.filter(
    (item) => item.type !== 'none' && !(hideZero && !(Number(item.value) > 0)),
  );

  return (
    <div
      className={cn(
        'grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl',
        className,
      )}
    >
      {tooltipLabel}
      {rows.length > 0 && (
        <div className="grid gap-1.5">
          {rows.map((item) => {
            const key = `${nameKey || item.name || item.dataKey || 'value'}`;
            const itemConfig = getPayloadConfigFromPayload(config, item, key);
            const payloadFill = isRecord(item.payload) ? item.payload.fill : undefined;
            const indicatorColor =
              color || (typeof payloadFill === 'string' ? payloadFill : undefined) || item.color;
            const value = item.value;
            return (
              <div
                key={String(item.dataKey ?? key)}
                className={cn(
                  'flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5 [&>svg]:text-muted-foreground',
                  indicator === 'dot' && 'items-center',
                )}
              >
                {itemConfig?.icon ? (
                  <itemConfig.icon />
                ) : (
                  !hideIndicator && (
                    <div
                      className={cn(
                        'shrink-0 rounded-[2px] border-(--color-border) bg-(--color-bg)',
                        {
                          'h-2.5 w-2.5': indicator === 'dot',
                          'w-1': indicator === 'line',
                          'w-0 border-[1.5px] border-dashed bg-transparent': indicator === 'dashed',
                        },
                      )}
                      style={
                        {
                          '--color-bg': indicatorColor,
                          '--color-border': indicatorColor,
                        } as React.CSSProperties
                      }
                    />
                  )
                )}
                <div className="flex flex-1 items-center justify-between gap-4 leading-none">
                  <span className="text-muted-foreground">{itemConfig?.label ?? item.name}</span>
                  {value !== undefined && value !== null && (
                    <span className="font-mono font-medium text-foreground tabular-nums">
                      {typeof value === 'number' && valueFormatter
                        ? valueFormatter(value)
                        : typeof value === 'number'
                          ? value.toLocaleString('en-US')
                          : String(value)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Config entry of a payload item (by data key, name or a key inside the item's payload). */
function getPayloadConfigFromPayload(
  config: ChartConfig,
  payload: TooltipPayloadEntry | undefined,
  key: string,
) {
  if (!payload) return undefined;
  const inner = isRecord(payload.payload) ? payload.payload : undefined;
  let configLabelKey = key;
  const fromItem = (payload as unknown as Record<string, unknown>)[key];
  if (typeof fromItem === 'string') configLabelKey = fromItem;
  else if (inner && typeof inner[key] === 'string') configLabelKey = inner[key];
  return configLabelKey in config ? config[configLabelKey] : config[key];
}

export { ChartContainer, ChartStyle, ChartTooltip, ChartTooltipContent };
