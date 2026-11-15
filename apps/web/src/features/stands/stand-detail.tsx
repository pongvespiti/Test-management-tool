'use client';

import type { StandBookingDTO, StandDTO } from '@tmt/shared';
import { CalendarPlus, Pencil, Trash2, Wrench } from 'lucide-react';
import { confirmDelete } from '@/components/common/confirm-host';
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
import { formatDate, formatRelative } from '@/lib/format';
import { notifyError, notifySuccess } from '@/lib/notify';
import { BLUE } from '@/lib/status';
import { useAuth } from '@/providers/auth-provider';
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

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            <span className="font-mono">{s.code}</span> · {s.currentModel ?? 'Empty'}
          </DialogTitle>
          <DialogDescription>
            {s.inCharge ? `In charge: ${s.inCharge}. ` : ''}
            {s.updatedBy
              ? `Updated by ${s.updatedBy.displayName} ${formatRelative(s.updatedAt)}.`
              : ''}
          </DialogDescription>
        </DialogHeader>
        {s.note && <p className="rounded-md bg-muted px-3 py-2 text-sm">{s.note}</p>}
        <div className="flex flex-wrap gap-2">
          {canRequest && (
            <>
              <Button onClick={onBook}>
                <CalendarPlus /> Book
              </Button>
              <Button variant="outline" onClick={onRequest}>
                <Wrench /> Request technician
              </Button>
            </>
          )}
          {canManage && (
            <>
              <Button variant="outline" onClick={onEdit}>
                <Pencil /> Update stand
              </Button>
              <Button
                variant="ghost"
                onClick={() =>
                  confirmDelete(`stand ${s.code} with its bookings and requests`, async () => {
                    try {
                      await removeStand.mutateAsync(s.id);
                      notifySuccess(`${s.code} deleted.`);
                      onClose();
                    } catch (err) {
                      notifyError(err, 'Could not delete the stand');
                    }
                  })
                }
              >
                <Trash2 /> Delete
              </Button>
            </>
          )}
        </div>

        <section aria-labelledby="stand-bookings" className="flex flex-col gap-2">
          <h3 id="stand-bookings" className="text-sm font-semibold">
            Bookings from today
          </h3>
          <QueryState query={bookings}>
            {(bookings.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Free — no bookings.</p>
            ) : (
              <ul className="flex flex-col divide-y rounded-lg border">
                {(bookings.data ?? []).map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                    <StatusPill tone={BLUE}>{b.project.key}</StatusPill>
                    <span className="font-medium">{b.model}</span>
                    <span className="text-muted-foreground">
                      {formatDate(b.startDate)} – {formatDate(b.endDate)} ·{' '}
                      {b.createdBy.displayName}
                    </span>
                    {canEditBooking(b) && (
                      <span className="ml-auto flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => onEditBooking(b)}>
                          Change
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            confirmDelete(`booking of ${b.project.key}`, async () => {
                              try {
                                await removeBooking.mutateAsync(b.id);
                                notifySuccess('Booking cancelled.');
                              } catch (err) {
                                notifyError(err, 'Could not cancel the booking');
                              }
                            })
                          }
                        >
                          Cancel booking
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
            Technician requests
          </h3>
          <StandRequests standId={s.id} compact />
        </section>
      </DialogContent>
    </Dialog>
  );
}
