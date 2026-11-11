'use client';

import { useMembers } from '@/lib/api/projects';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const NONE = '__none__';

/** Picks a member of the project (tester, assignee …). */
export function UserSelect({
  projectId,
  value,
  onChange,
  placeholder = 'Select a person',
  clearable = true,
  disabled,
  id,
  roles,
  ...aria
}: {
  projectId: number;
  value: number | null;
  onChange: (userId: number | null) => void;
  placeholder?: string;
  clearable?: boolean;
  disabled?: boolean;
  id?: string;
  /** Accessibility props forwarded to the trigger (label, field error). */
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  /** Restrict to these roles (e.g. reviewers = leads). */
  roles?: readonly ('viewer' | 'tester' | 'lead')[];
}) {
  const members = useMembers(projectId);
  const options = (members.data ?? [])
    .filter((m) => !roles || roles.includes(m.role))
    .map((m) => ({ value: String(m.user.id), label: `${m.user.displayName} (${m.user.username})` }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return (
    <Select
      value={value === null ? NONE : String(value)}
      onValueChange={(v) => onChange(v === NONE ? null : Number(v))}
      disabled={disabled || members.isPending}
    >
      <SelectTrigger id={id} className="w-full" {...aria}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {clearable && (
          <SelectItem value={NONE}>
            {placeholder === 'Select a person' ? 'Nobody' : placeholder}
          </SelectItem>
        )}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
