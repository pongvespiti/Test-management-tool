'use client';

import { useBuilds } from '@/lib/api/builds';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const NONE = '__none__';

/**
 * Picks a build of one release (newest first). `releaseId` null = the plan has no release: the
 * builds of every release are offered.
 */
export function BuildSelect({
  projectId,
  releaseId,
  value,
  onChange,
  placeholder = 'No build',
  disabled,
  id,
  ...aria
}: {
  projectId: number;
  releaseId: number | null;
  value: number | null;
  onChange: (buildId: number | null) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}) {
  const builds = useBuilds(projectId, releaseId);
  const list = builds.data ?? [];
  // A saved build stays visible while the list loads or when it is not in it any more.
  return (
    <Select
      value={value === null ? NONE : String(value)}
      onValueChange={(v) => onChange(v === NONE ? null : Number(v))}
      disabled={disabled || builds.isPending}
    >
      <SelectTrigger id={id} className="w-full" {...aria}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{placeholder}</SelectItem>
        {list.map((b) => (
          <SelectItem key={b.id} value={String(b.id)}>
            {b.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
