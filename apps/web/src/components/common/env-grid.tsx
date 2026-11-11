import type { EnvEntryDTO } from '@tmt/shared';
import { cn } from '@/lib/utils';

const MONO_LABELS = /(^|\s)(sw|eprom|eeprom|ssid|fw|id|od)(\s|$)/i;

/** Environment (configuration) values as a label/value grid, e.g. Unit model, FW version. */
export function EnvGrid({ entries }: { entries: EnvEntryDTO[] }) {
  if (entries.length === 0)
    return <p className="text-sm text-muted-foreground">No environment values recorded.</p>;
  return (
    <dl className="m-0 grid min-w-0 grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {entries.map((e, i) => (
        <div key={`${e.label}-${i}`} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{e.label}</dt>
          <dd
            className={cn(
              'm-0 text-sm font-semibold [overflow-wrap:anywhere]',
              MONO_LABELS.test(e.label) && 'font-mono',
            )}
          >
            {e.value || '—'}
          </dd>
        </div>
      ))}
    </dl>
  );
}
