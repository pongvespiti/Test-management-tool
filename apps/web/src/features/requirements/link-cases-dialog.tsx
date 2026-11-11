'use client';

import { CASE_SEARCH_MIN_LENGTH, type RequirementDTO } from '@tmt/shared';
import { X } from 'lucide-react';
import { useState } from 'react';
import { MonoId } from '@/components/common/mono-id';
import { SearchInput } from '@/components/common/list-controls';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCaseSearch } from '@/lib/api/library';
import { useSetRequirementCases } from '@/lib/api/requirements';
import { useDebouncedValue } from '@/hooks/use-debounce';
import { notifyError, notifySuccess } from '@/lib/notify';
import { useProject } from '@/providers/project-provider';

interface Picked {
  id: number;
  displayId: string;
  title: string;
}

const HITS = 20;

/**
 * Choose the cases linked to a requirement. Cases that only cite the key in their References stay
 * as they are and are not listed here.
 */
export function LinkCasesDialog({
  requirement,
  onClose,
}: {
  requirement: RequirementDTO;
  onClose: () => void;
}) {
  const { projectId } = useProject();
  const save = useSetRequirementCases(projectId);
  const [text, setText] = useState('');
  const search = useCaseSearch(projectId, useDebouncedValue(text, 250), HITS);
  const [picked, setPicked] = useState<Map<number, Picked>>(
    () =>
      new Map(
        requirement.cases
          .filter((c) => c.via !== 'refs')
          .map((c) => [c.id, { id: c.id, displayId: c.displayId, title: c.title }]),
      ),
  );

  const toggle = (c: Picked, on: boolean) =>
    setPicked((prev) => {
      const next = new Map(prev);
      if (on) next.set(c.id, c);
      else next.delete(c.id);
      return next;
    });

  const submit = async () => {
    try {
      await save.mutateAsync({ requirementId: requirement.id, caseIds: [...picked.keys()] });
      notifySuccess(`Cases of ${requirement.key} saved.`);
      onClose();
    } catch (err) {
      notifyError(err, 'Could not link the cases');
    }
  };

  const hits = search.data?.items ?? [];
  const searched = text.trim().length >= CASE_SEARCH_MIN_LENGTH;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Link cases to {requirement.key}</DialogTitle>
          <DialogDescription>
            Search the library by title or code and tick the cases that test this requirement.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <SearchInput
            aria-label="Search cases"
            placeholder="Search cases by title or code"
            value={text}
            onValueChange={setText}
          />
          {searched ? (
            hits.length === 0 && !search.isFetching ? (
              <p className="text-sm text-muted-foreground">No cases match.</p>
            ) : (
              <ul
                aria-label="Search results"
                className="flex max-h-56 flex-col overflow-auto rounded-lg border"
              >
                {hits.map((h) => (
                  <li key={h.id} className="border-b last:border-b-0">
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted">
                      <Checkbox
                        checked={picked.has(h.id)}
                        onCheckedChange={(v) =>
                          toggle({ id: h.id, displayId: h.displayId, title: h.title }, v === true)
                        }
                        aria-label={`${h.displayId} ${h.title}`}
                      />
                      <MonoId>{h.displayId}</MonoId>
                      <span className="min-w-0 flex-1 truncate">{h.title}</span>
                      <span className="text-muted-foreground">{h.suiteName}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <p className="text-sm text-muted-foreground">
              Type at least {CASE_SEARCH_MIN_LENGTH} characters to search.
            </p>
          )}
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Linked ({picked.size})</h3>
            {picked.size === 0 ? (
              <p className="text-sm text-muted-foreground">No cases linked.</p>
            ) : (
              <ul aria-label="Linked cases" className="flex flex-wrap gap-2">
                {[...picked.values()].map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center gap-1.5 rounded-full border bg-muted/40 py-0.5 pr-1 pl-3 text-sm"
                  >
                    <MonoId>{c.displayId}</MonoId>
                    <span className="max-w-48 truncate">{c.title}</span>
                    <button
                      type="button"
                      aria-label={`Unlink ${c.displayId}`}
                      onClick={() => toggle(c, false)}
                      className="grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-secondary"
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={save.isPending}>
            Save links
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
