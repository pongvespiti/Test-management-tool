'use client';

import type { StandBookingDTO, StandBoardDTO } from '@tmt/shared';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { QueryState } from '@/components/common/error-alert';
import { Button } from '@/components/ui/button';
import { useStandBookings } from '@/lib/api/stands';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { addDaysIso, daysBetween, shortDay, todayIso, weekStart } from './stand-dates';

/** Days shown at once. */
const WINDOW = 28;
const PALETTE = ['#1864AB', '#0B7285', '#6741D9', '#B45309', '#237032', '#C2255C', '#495057'];

/** Same project → same colour on the whole timeline. */
function colorOf(projectId: number): string {
  return PALETTE[projectId % PALETTE.length]!;
}

/**
 * Bookings of every stand over four weeks (a row per stand, grouped by zone): who has which stand
 * when, and where there is room for the next test.
 */
export function BookingTimeline({
  board,
  onOpen,
}: {
  board: StandBoardDTO;
  onOpen: (booking: StandBookingDTO) => void;
}) {
  const today = todayIso();
  const [from, setFrom] = useState(() => weekStart(today));
  const to = addDaysIso(from, WINDOW - 1);
  const query = useStandBookings({ from, to });
  const days = useMemo(() => Array.from({ length: WINDOW }, (_, i) => addDaysIso(from, i)), [from]);
  const byStand = useMemo(() => {
    const map = new Map<number, StandBookingDTO[]>();
    for (const b of query.data ?? []) map.set(b.standId, [...(map.get(b.standId) ?? []), b]);
    return map;
  }, [query.data]);
  const todayCol = daysBetween(from, today);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="icon"
          variant="outline"
          aria-label="Earlier weeks"
          onClick={() => setFrom(addDaysIso(from, -WINDOW))}
        >
          <ChevronLeft />
        </Button>
        <Button variant="outline" onClick={() => setFrom(weekStart(today))}>
          This week
        </Button>
        <Button
          size="icon"
          variant="outline"
          aria-label="Later weeks"
          onClick={() => setFrom(addDaysIso(from, WINDOW))}
        >
          <ChevronRight />
        </Button>
        <span className="text-sm font-medium" aria-live="polite">
          {formatDate(from)} – {formatDate(to)}
        </span>
      </div>
      <QueryState query={query}>
        <div className="overflow-x-auto rounded-xl border bg-card">
          <div className="min-w-[980px]">
            <div className="flex border-b text-xs text-muted-foreground">
              <div className="w-40 shrink-0 px-3 py-2 font-medium">Stand</div>
              <div className="relative flex flex-1">
                {days.map((d, i) => (
                  <div
                    key={d}
                    className={cn(
                      'flex-1 border-l py-2 text-center',
                      i === todayCol && 'bg-primary/10 font-semibold text-primary',
                      new Date(`${d}T00:00:00`).getDay() % 6 === 0 &&
                        i !== todayCol &&
                        'bg-muted/50',
                    )}
                  >
                    {i % 7 === 0 || i === todayCol
                      ? shortDay(d)
                      : new Date(`${d}T00:00:00`).getDate()}
                  </div>
                ))}
              </div>
            </div>
            {board.zones.map((zone) => (
              <div key={zone.id} role="rowgroup" aria-label={zone.name}>
                <div className="border-b bg-muted/40 px-3 py-1 text-xs font-semibold">
                  {zone.name}
                </div>
                {zone.stands.map((s) => (
                  <div key={s.id} className="flex border-b last:border-b-0">
                    <div className="w-40 shrink-0 px-3 py-2">
                      <p className="font-mono text-xs font-semibold">{s.code}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {s.currentModel ?? 'Empty'}
                      </p>
                    </div>
                    <div className="relative flex-1">
                      {todayCol >= 0 && todayCol < WINDOW && (
                        <div
                          aria-hidden
                          className="absolute inset-y-0 bg-primary/5"
                          style={{
                            left: `${(todayCol / WINDOW) * 100}%`,
                            width: `${100 / WINDOW}%`,
                          }}
                        />
                      )}
                      {(byStand.get(s.id) ?? []).map((b) => {
                        const start = Math.max(0, daysBetween(from, b.startDate));
                        const end = Math.min(WINDOW - 1, daysBetween(from, b.endDate));
                        return (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => onOpen(b)}
                            title={`${b.project.key} · ${b.model} · ${formatDate(b.startDate)} – ${formatDate(b.endDate)}`}
                            aria-label={`${s.code} booked by ${b.project.key} for ${b.model}, ${formatDate(b.startDate)} to ${formatDate(b.endDate)}`}
                            className="absolute top-1.5 bottom-1.5 overflow-hidden rounded-md px-2 text-left text-xs font-semibold whitespace-nowrap text-white hover:opacity-90 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                            style={{
                              left: `calc(${(start / WINDOW) * 100}% + 2px)`,
                              width: `calc(${((end - start + 1) / WINDOW) * 100}% - 4px)`,
                              background: colorOf(b.project.id),
                            }}
                          >
                            {b.project.key} · {b.model}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </QueryState>
    </div>
  );
}
