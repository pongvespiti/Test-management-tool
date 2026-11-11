'use client';

import { RELEASE_STATUS_LABELS } from '@tmt/shared';
import { useReleases } from '@/lib/api/projects';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const NONE = '__none__';

/** Picks a release of the project (newest first). */
export function ReleaseSelect({
  projectId,
  value,
  onChange,
  placeholder = 'No release',
  disabled,
  id,
  ...aria
}: {
  projectId: number;
  value: number | null;
  onChange: (releaseId: number | null) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  /** Accessibility props forwarded to the trigger (label, field error). */
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}) {
  const releases = useReleases(projectId);
  return (
    <Select
      value={value === null ? NONE : String(value)}
      onValueChange={(v) => onChange(v === NONE ? null : Number(v))}
      disabled={disabled || releases.isPending}
    >
      <SelectTrigger id={id} className="w-full" {...aria}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{placeholder}</SelectItem>
        {(releases.data ?? []).map((r) => (
          <SelectItem key={r.id} value={String(r.id)}>
            {r.status === 'active'
              ? `${r.name} (${RELEASE_STATUS_LABELS.active.toLowerCase()})`
              : r.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
