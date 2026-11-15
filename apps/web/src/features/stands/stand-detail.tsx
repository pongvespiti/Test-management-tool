'use client';

import type { StandBookingDTO, StandDTO } from '@tmt/shared';
import { CalendarPlus, Pencil, Trash2, Wrench } from 'lucide-react';
import { QueryState } from '@/components/common/error-alert';
import { StatusPill } from '@/components/common/status-pill';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useDeleteBooking, useDeleteStand, useStandBookings } from '@/lib/api/stands';
import { notifyError, notifySuccess } from '@/lib/notify';
import { BLUE } from '@/lib/status';
import { useAuth } from '@/providers/auth-provider';
import { confirmStandDelete, useStandsDates, useStandsT } from './stand-i18n';
import { StandRequests } from './stand-requests';
import { addDaysIso, todayIso } from './stand-dates';

/** Who may change a booking: who made it, a lead of its project, an administrator. */
export function useCanEditBooking() {
  const { user, roleIn } = useAuth();
  return (b: StandBookingDTO) =>
    !!user && (user.isAdmin || b.createdBy.id === user.id || roleIn(b.project.id) === 'lead');
}

/** One stand: what is on it, its bookings and requests, and what the user can do with it. */
export function StandDetail({
  stand: s,
  canManage,
  canRequest,
  onClose,
  onEdit,
  onBook,
  onRequest,
  onEditBooking,
}: {
  stand: StandDTO;
  canManage: boolean;
  canRequest: boolean;
  onClose: () => void;
  onEdit: () => void;
  onBook: () => void;
  onRequest: () => void;
  onEditBooking: (b: StandBookingDTO) => void;
}) {
  const today = todayIso();
  const bookings = useStandBookings({ standId: s.id, from: today, to: addDaysIso(today, 365) });
  const removeStand = useDeleteStand();
  const removeBooking = useDeleteBooking();
  const canEditBooking = useCanEditBooking();
  const t = useStandsT();
  const fmt = useStandsDates();

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            <span className="font-mono">{s.code}</span> · {s.currentModel ?? t('Empty')}
          </DialogTitle>
          <DialogDescription>
            {s.inCharge ? t('In charge: {name}. ', { name: s.inCharge }) : ''}
            {s.updatedBy
              ? t('Updated by {name} {when}.', {
                  name: s.updatedBy.displayName,
                  when: fmt.relative(s.updatedAt),
                })
              : ''}
          </DialogDescription>
        </DialogHeader>
        {s.note && <p className="rounded-md bg-muted px-3 py-2 text-sm">{s.note}</p>}
        <div className="flex flex-wrap gap-2">
          {canRequest && (
            <>
              <Button onClick={onBook}>
                <CalendarPlus /> {t('Book')}
              </Button>
              <Button variant="outline" onClick={onRequest}>
                <Wrench /> {t('Request technician')}
              </Button>
            </>
          )}
          {canManage && (
            <>
              <Button variant="outline" onClick={onEdit}>
                <Pencil /> {t('Update stand')}
              </Button>
              <Button
                variant="ghost"
                onClick={() =>
                  confirmStandDelete(
                    t,
                    t('stand {code} with its bookings and requests', { code: s.code }),
                    async () => {
                      try {
                        await removeStand.mutateAsync(s.id);
                        notifySuccess(t('{code} deleted.', { code: s.code }));
                        onClose();
                      } catch (err) {
                        notifyError(err, t('Could not delete the stand'));
                      }
                    },
                  )
                }
              >
                <Trash2 /> {t('Delete')}
              </Button>
            </>
          )}
        </div>

        <section aria-labelledby="stand-bookings" className="flex flex-col gap-2">
          <h3 id="stand-bookings" className="text-sm font-semibold">
            {t('Bookings from today')}
          </h3>
          <QueryState query={bookings}>
            {(bookings.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('Free — no bookings.')}</p>
            ) : (
              <ul className="flex flex-col divide-y rounded-lg border">
                {(bookings.data ?? []).map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                    <StatusPill tone={BLUE}>{b.project.key}</StatusPill>
                    <span className="font-medium">{b.model}</span>
                    <span className="text-muted-foreground">
                      {fmt.date(b.startDate)} – {fmt.date(b.endDate)} · {b.createdBy.displayName}
                    </span>
                    {canEditBooking(b) && (
                      <span className="ml-auto flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => onEditBooking(b)}>
                          {t('Change')}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            confirmStandDelete(
                              t,
                              t('booking of {project}', { project: b.project.key }),
                              async () => {
                                try {
                                  await removeBooking.mutateAsync(b.id);
                                  notifySuccess(t('Booking cancelled.'));
                                } catch (err) {
                                  notifyError(err, t('Could not cancel the booking'));
                                }
                              },
                            )
                          }
                        >
                          {t('Cancel booking')}
                        </Button>
                      </span>
                    )}
                    {b.note && <p className="w-full text-muted-foreground">{b.note}</p>}
                  </li>
                ))}
              </ul>
            )}
          </QueryState>
        </section>

        <section aria-labelledby="stand-requests" className="flex flex-col gap-2">
          <h3 id="stand-requests" className="text-sm font-semibold">
            {t('Technician requests')}
          </h3>
          <StandRequests standId={s.id} compact />
        </section>
      </DialogContent>
    </Dialog>
  );
}
