import { addDays as addDaysFn, differenceInCalendarDays, format, parseISO } from 'date-fns';

/** Today as `YYYY-MM-DD` in the browser's time zone (the lab's). */
export function todayIso(now: Date = new Date()): string {
  return format(now, 'yyyy-MM-dd');
}

export function addDaysIso(day: string, n: number): string {
  return format(addDaysFn(parseISO(day), n), 'yyyy-MM-dd');
}

/** Whole days from `a` to `b` (`b` later → positive). */
export function daysBetween(a: string, b: string): number {
  return differenceInCalendarDays(parseISO(b), parseISO(a));
}

/** Monday of the week of `day`. */
export function weekStart(day: string): string {
  const d = parseISO(day);
  const back = (d.getDay() + 6) % 7;
  return format(addDaysFn(d, -back), 'yyyy-MM-dd');
}

/** `12 Nov` style label. */
export function shortDay(day: string): string {
  return format(parseISO(day), 'd MMM');
}
