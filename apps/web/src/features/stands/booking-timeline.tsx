'use client';

import type { StandBookingDTO, StandBoardDTO } from '@tmt/shared';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { QueryState } from '@/components/common/error-alert';
import { Button } from '@/components/ui/button';
import { useStandBookings } from '@/lib/api/stands';
import { cn } from '@/lib/utils';
import { addDaysIso, daysBetween, todayIso, weekStart } from './stand-dates';
import { periodText, useStandsDates, useStandsT } from './stand-i18n';

/** Days shown at once. */
const WINDOW = 28;
const DAY_MINUTES = 1440;
const minutes = (time: string | null, fallback: number) =>
  time ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) : fallback;
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
  const t = useStandsT();
  const fmt = useStandsDates();
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
          aria-label={t('Earlier weeks')}
          onClick={() => setFrom(addDaysIso(from, -WINDOW))}
        >
          <ChevronLeft />
        </Button>
        <Button variant="outline" onClick={() => setFrom(weekStart(today))}>
          {t('This week')}
        </Button>
        <Button
          size="icon"
          variant="outline"
          aria-label={t('Later weeks')}
          onClick={() => setFrom(addDaysIso(from, WINDOW))}
        >
          <ChevronRight />
        </Button>
        <span className="text-sm font-medium" aria-live="polite">
          {fmt.date(from)} – {fmt.date(to)}
        </span>
      </div>
      <QueryState query={query}>
        <div className="overflow-x-auto rounded-xl border bg-card">
          <div className="min-w-[980px]">
            <div className="flex border-b text-xs text-muted-foreground">
              <div className="w-40 shrink-0 px-3 py-2 font-medium">{t('Stand')}</div>
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
                      ? fmt.short(d)
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
                        {s.currentModel ?? t('Empty')}
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
                        // Position in days from `from`, hours as fractions of a day.
                        const start = Math.max(
                          0,
                          daysBetween(from, b.startDate) + minutes(b.startTime, 0) / DAY_MINUTES,
                        );
                        const end = Math.min(
                          WINDOW,
                          daysBetween(from, b.endDate) +
                            minutes(b.endTime, DAY_MINUTES) / DAY_MINUTES,
                        );
                        const who = b.tester?.displayName ?? b.createdBy.displayName;
                        return (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => onOpen(b)}
                            title={`${b.project.key} · ${b.model} · ${who} · ${periodText(fmt, b)}`}
                            aria-label={t(
                              '{code} booked by {project} for {model}, {from} to {to}',
                              {
                                code: s.code,
                                project: b.project.key,
                                model: b.model,
                                from: fmt.at(b.startDate, b.startTime),
                                to: fmt.at(b.endDate, b.endTime),
                              },
                            )}
                            className="absolute top-1.5 bottom-1.5 overflow-hidden rounded-md px-2 text-left text-xs font-semibold whitespace-nowrap text-white hover:opacity-90 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                            style={{
                              left: `calc(${(start / WINDOW) * 100}% + 1px)`,
                              width: `max(6px, calc(${((end - start) / WINDOW) * 100}% - 2px))`,
                              background: colorOf(b.project.id),
                            }}
                          >
                            {b.project.key} · {b.model} · {who}
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
