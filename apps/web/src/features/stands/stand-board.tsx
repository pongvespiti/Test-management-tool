'use client';

import type { StandBoardDTO, StandDTO, StandZoneDTO } from '@tmt/shared';
import { CalendarClock, Pencil, Plus, Trash2, Wrench } from 'lucide-react';
import { confirmDelete } from '@/components/common/confirm-host';
import { EmptyState } from '@/components/common/empty-state';
import { StatusPill } from '@/components/common/status-pill';
import { Button } from '@/components/ui/button';
import { useDeleteZone } from '@/lib/api/stands';
import { formatDate } from '@/lib/format';
import { notifyError, notifySuccess } from '@/lib/notify';
import { BLUE, ORANGE } from '@/lib/status';
import { cn } from '@/lib/utils';

/** Zones in order, each a grid of stand cards: what is installed, who has it booked. */
export function StandBoard({
  board,
  search,
  onOpen,
  onAddStand,
  onEditZone,
  onAddZone,
}: {
  board: StandBoardDTO;
  search: string;
  onOpen: (stand: StandDTO) => void;
  onAddStand: (zone: StandZoneDTO) => void;
  onEditZone: (zone: StandZoneDTO) => void;
  onAddZone: () => void;
}) {
  const removeZone = useDeleteZone();

  if (board.zones.length === 0)
    return (
      <EmptyState
        icon={<Wrench className="size-6" strokeWidth={1.6} />}
        title={search ? `No stand has ${search}` : 'No test stands yet'}
        description={
          search
            ? 'Not installed and not booked anywhere. Try part of the model name.'
            : board.canManage
              ? 'Add the zones and stands of the lab, or import the stand sheet (Import tab).'
              : 'A technician or an administrator adds the stands of the lab.'
        }
        action={
          !search && board.canManage ? (
            <Button onClick={onAddZone}>
              <Plus /> New zone
            </Button>
          ) : undefined
        }
      />
    );

  return (
    <div className="flex flex-col gap-6">
      {board.zones.map((zone) => (
        <section key={zone.id} aria-labelledby={`zone-${zone.id}`}>
          <div className="mb-2 flex items-center gap-2">
            <h2 id={`zone-${zone.id}`} className="text-base font-semibold">
              {zone.name}
            </h2>
            <span className="text-sm text-muted-foreground">
              {zone.stands.length} {zone.stands.length === 1 ? 'stand' : 'stands'}
            </span>
            {board.canManage && (
              <div className="ml-auto flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => onAddStand(zone)}>
                  <Plus /> Stand
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Rename ${zone.name}`}
                  onClick={() => onEditZone(zone)}
                >
                  <Pencil />
                </Button>
                {zone.stands.length === 0 && !search && (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Delete ${zone.name}`}
                    onClick={() =>
                      confirmDelete(`zone ${zone.name}`, async () => {
                        try {
                          await removeZone.mutateAsync(zone.id);
                          notifySuccess(`${zone.name} deleted.`);
                        } catch (err) {
                          notifyError(err, 'Could not delete the zone');
                        }
                      })
                    }
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
            )}
          </div>
          {zone.stands.length === 0 ? (
            <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
              No stands in this zone yet.
            </p>
          ) : (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
              {zone.stands.map((s) => (
                <li key={s.id}>
                  <StandCard stand={s} search={search} onOpen={() => onOpen(s)} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

function StandCard({
  stand: s,
  search,
  onOpen,
}: {
  stand: StandDTO;
  search: string;
  onOpen: () => void;
}) {
  const hit =
    !!search && !!s.currentModel && s.currentModel.toLowerCase().includes(search.toLowerCase());
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Stand ${s.code}: ${s.currentModel ?? 'empty'}`}
      className={cn(
        'flex h-full w-full flex-col gap-1.5 rounded-xl border bg-card p-3 text-left shadow-xs transition-colors hover:border-primary/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
        hit && 'border-primary ring-2 ring-primary/30',
        !s.currentModel && 'bg-muted/40',
      )}
    >
      <span className="flex items-center gap-2">
        <span className="font-mono text-xs font-semibold text-muted-foreground">{s.code}</span>
        {s.openRequests > 0 && (
          <span className="ml-auto">
            <StatusPill tone={ORANGE} title="Open technician requests">
              <Wrench className="size-3" /> {s.openRequests}
            </StatusPill>
          </span>
        )}
      </span>
      <span className={cn('text-base font-semibold', !s.currentModel && 'text-muted-foreground')}>
        {s.currentModel ?? 'Empty'}
      </span>
      {s.inCharge && <span className="text-xs text-muted-foreground">In charge: {s.inCharge}</span>}
      {s.currentBooking ? (
        <span className="mt-auto flex flex-wrap items-center gap-1 text-xs">
          <StatusPill tone={BLUE}>{s.currentBooking.project.key}</StatusPill>
          <span className="text-muted-foreground">
            {s.currentBooking.model} until {formatDate(s.currentBooking.endDate)}
          </span>
        </span>
      ) : s.nextBooking ? (
        <span className="mt-auto flex items-center gap-1 text-xs text-muted-foreground">
          <CalendarClock className="size-3.5" />
          {s.nextBooking.project.key} from {formatDate(s.nextBooking.startDate)}
        </span>
      ) : (
        <span className="mt-auto text-xs text-muted-foreground">Free</span>
      )}
    </button>
  );
}
