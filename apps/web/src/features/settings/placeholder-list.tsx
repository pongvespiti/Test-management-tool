import type { ReactNode } from 'react';
import { CopyCode } from './copy-code';

export interface PlaceholderItem {
  value: string;
  description: ReactNode;
  invalid?: boolean;
}

/** Copyable placeholders with their meaning: two aligned columns, stacked on phones. */
export function PlaceholderList({ items }: { items: readonly PlaceholderItem[] }) {
  return (
    <ul className="m-0 list-none p-0">
      {items.map((it) => (
        <li key={it.value} className="flex flex-wrap items-center gap-x-4 gap-y-0.5 py-1">
          <div className="w-full flex-none sm:w-[46%]">
            <CopyCode value={it.value} invalid={it.invalid} />
          </div>
          <div className="min-w-40 flex-1">
            {typeof it.description === 'string' ? (
              <p className="text-sm text-muted-foreground">{it.description}</p>
            ) : (
              it.description
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
