'use client';

import { CASE_SEARCH_MIN_LENGTH, type CaseSearchHit } from '@tmt/shared';
import { Loader2, Search } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useId, useState, type KeyboardEvent } from 'react';
import { CasePriorityLabel } from '@/components/common/case-priority-label';
import { MonoId } from '@/components/common/mono-id';
import { Input } from '@/components/ui/input';
import { useDebouncedValue } from '@/hooks/use-debounce';
import { useCaseSearch } from '@/lib/api/library';
import { routes } from '@/lib/routes';
import { cn } from '@/lib/utils';
import { useOptionalProject } from '@/providers/project-provider';

const SEARCH_WIDTH = 'flex-[1_1_240px] max-w-[480px]';
const DEBOUNCE_MS = 250;

/**
 * Header search over the whole test case library of the project (every active suite). Typing
 * lists the best matches; a match opens that case in its suite, Enter without a highlighted match
 * opens the library filtered by the text.
 */
export function GlobalSearch() {
  const project = useOptionalProject();
  if (!project) return <div className={SEARCH_WIDTH} />;
  return <ProjectSearch projectId={project.projectId} />;
}

function ProjectSearch({ projectId }: { projectId: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const listId = useId();
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  // The highlighted row belongs to one query text: a new text starts without a highlight.
  const [highlight, setHighlight] = useState<{ text: string; index: number } | null>(null);

  const text = value.trim();
  const searchText = useDebouncedValue(text, DEBOUNCE_MS);
  const searchable = text.length >= CASE_SEARCH_MIN_LENGTH;
  const search = useCaseSearch(projectId, searchText);
  // Results of an older text are not shown as if they belonged to the current one.
  const settled =
    searchable && searchText === text && search.isSuccess && !search.isPlaceholderData;
  const hits = settled ? (search.data?.items ?? []) : [];
  const total = settled ? (search.data?.total ?? 0) : 0;
  const active = highlight && highlight.text === text ? highlight.index : -1;
  const expanded = open && searchable;

  const close = () => {
    setOpen(false);
    setHighlight(null);
  };

  const openCase = (hit: CaseSearchHit) => {
    close();
    setValue('');
    router.push(routes.cases(projectId, { suite: hit.suiteId, case: hit.id }));
  };

  /** The library filtered by the text, in a suite that has matches whenever one is known. */
  const openLibrary = () => {
    const casesPath = routes.cases(projectId);
    const current = pathname === casesPath ? Number(searchParams.get('suite')) || null : null;
    const suite =
      current !== null && hits.some((h) => h.suiteId === current)
        ? current
        : (hits[0]?.suiteId ?? current);
    close();
    router.push(routes.cases(projectId, { suite, q: text || undefined }));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      close();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    setOpen(true);
    if (hits.length === 0) return;
    const step = e.key === 'ArrowDown' ? 1 : -1;
    // -1 (no highlight) sits between the last and the first row, so the arrows can leave the list.
    const next = ((active + 1 + step + hits.length + 1) % (hits.length + 1)) - 1;
    setHighlight({ text, index: next });
  };

  const activeHit = active >= 0 ? hits[active] : undefined;

  return (
    <form
      role="search"
      className={cn(SEARCH_WIDTH, 'relative')}
      onSubmit={(e) => {
        e.preventDefault();
        if (activeHit) openCase(activeHit);
        else openLibrary();
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) close();
      }}
    >
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        role="combobox"
        aria-label="Search the test case library"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeHit ? `${listId}-${activeHit.id}` : undefined}
        autoComplete="off"
        placeholder="Search test cases (title, code, text)…"
        value={value}
        onChange={(e) => {
          setValue(e.currentTarget.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="bg-muted pl-9"
      />
      {expanded && (
        <div className="absolute top-full right-0 left-0 z-50 mt-1 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md">
          <ul
            id={listId}
            role="listbox"
            aria-label="Matching test cases"
            className="max-h-[60vh] overflow-y-auto py-1"
          >
            {hits.map((hit, index) => (
              <li
                key={hit.id}
                id={`${listId}-${hit.id}`}
                role="option"
                aria-selected={index === active}
                className={cn(
                  'flex cursor-pointer items-center gap-3 px-3 py-2 text-sm',
                  index === active && 'bg-accent text-accent-foreground',
                )}
                // Keep the focus in the input so that the list does not close before the click.
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlight({ text, index })}
                onClick={() => openCase(hit)}
              >
                <CasePriorityLabel priority={hit.priority} compact />
                <MonoId className="text-muted-foreground">{hit.displayId}</MonoId>
                <span className="min-w-0 flex-1 truncate">{hit.title}</span>
                <span className="max-w-[35%] shrink-0 truncate text-xs text-muted-foreground">
                  {hit.suiteName}
                </span>
              </li>
            ))}
          </ul>
          <p
            role="status"
            className={cn(
              'flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground',
              hits.length > 0 && 'border-t',
            )}
          >
            <SearchStatus
              settled={settled}
              failed={search.isError}
              text={text}
              shown={hits.length}
              total={total}
            />
          </p>
        </div>
      )}
    </form>
  );
}

function SearchStatus({
  settled,
  failed,
  text,
  shown,
  total,
}: {
  settled: boolean;
  failed: boolean;
  text: string;
  shown: number;
  total: number;
}) {
  if (failed) return <>Search is not available right now.</>;
  if (!settled) {
    return (
      <>
        <Loader2 aria-hidden className="size-3.5 animate-spin" />
        Searching…
      </>
    );
  }
  if (total === 0) return <>No test case matches “{text}”.</>;
  if (total > shown) {
    return (
      <>
        Showing {shown} of {total} matches — press Enter to filter the library.
      </>
    );
  }
  return (
    <>
      {total} {total === 1 ? 'match' : 'matches'} in all suites — press Enter to filter the library.
    </>
  );
}
