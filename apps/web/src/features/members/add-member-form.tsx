'use client';

import { PROJECT_ROLES, ROLE_LABELS, type ProjectRole, type UserRef } from '@tmt/shared';
import { Check, ChevronsUpDown, UserPlus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDebouncedValue } from '@/hooks/use-debounce';
import { useUserLookup } from '@/lib/api/users';
import { cn } from '@/lib/utils';

const userLabel = (u: UserRef) => `${u.displayName} (${u.username})`;

/** Search active users (server-side) and add one with a role. */
export function AddMemberForm({
  existingIds,
  busy,
  onAdd,
}: {
  existingIds: ReadonlySet<number>;
  busy: boolean;
  onAdd: (user: UserRef, role: ProjectRole) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search, 250);
  const [picked, setPicked] = useState<UserRef | null>(null);
  const [role, setRole] = useState<ProjectRole>('tester');
  const lookup = useUserLookup(debounced);

  const candidates = useMemo(
    () => (lookup.data ?? []).filter((u) => !existingIds.has(u.id)),
    [lookup.data, existingIds],
  );

  const submit = async () => {
    if (!picked) return;
    if (await onAdd(picked, role)) {
      setPicked(null);
      setSearch('');
    }
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="grid w-full gap-2 sm:w-[340px]">
        <Label htmlFor="add-member-person">Add a person</Label>
        <div className="relative">
          <Popover open={open} onOpenChange={setOpen} modal>
            <PopoverTrigger asChild>
              <Button
                id="add-member-person"
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className={cn('w-full justify-between px-3 font-normal', picked && 'pr-14')}
              >
                {picked ? (
                  <span className="truncate">{userLabel(picked)}</span>
                ) : (
                  <span className="truncate text-muted-foreground">Type a name or username</span>
                )}
                <ChevronsUpDown className="opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-0">
              {/* The server searches (active users only); cmdk must not filter again. */}
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder="Type a name or username"
                  value={search}
                  onValueChange={setSearch}
                />
                <CommandList>
                  <CommandEmpty>
                    {lookup.isFetching
                      ? 'Searching…'
                      : 'No active user found (or already a member)'}
                  </CommandEmpty>
                  {candidates.map((u) => (
                    <CommandItem
                      key={u.id}
                      value={String(u.id)}
                      onSelect={() => {
                        setPicked(u);
                        setOpen(false);
                      }}
                    >
                      <span className="min-w-0 flex-1 truncate">{userLabel(u)}</span>
                      <Check className={cn(picked?.id === u.id ? 'opacity-100' : 'opacity-0')} />
                    </CommandItem>
                  ))}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          {picked && (
            <button
              type="button"
              aria-label="Clear the selected person"
              onClick={() => setPicked(null)}
              className="absolute top-1/2 right-8 grid size-6 -translate-y-1/2 place-items-center rounded-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="grid w-[140px] gap-2">
        <Label htmlFor="add-member-role">Role</Label>
        <Select value={role} onValueChange={(v) => setRole(v as ProjectRole)}>
          <SelectTrigger id="add-member-role" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROJECT_ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABELS[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button onClick={() => void submit()} disabled={!picked} loading={busy}>
        {!busy && <UserPlus />}
        Add member
      </Button>
    </div>
  );
}
