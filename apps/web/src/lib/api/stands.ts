import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AcceptStandRequestInput,
  CreateStandBookingInput,
  CreateStandInput,
  CreateStandRequestInput,
  CreateStandZoneInput,
  ListStandBookingsQuery,
  ListStandEventsQuery,
  StandEventDTO,
  TechnicianWorkDTO,
  ListStandRequestsQuery,
  StandBoardDTO,
  StandBookingDTO,
  StandDTO,
  StandImportResultDTO,
  StandRequestDTO,
  StandZoneDTO,
  UpdateStandBookingInput,
  UpdateStandInput,
  UpdateStandZoneInput,
  UserRef,
} from '@tmt/shared';
import { api } from './client';
import { qk } from './keys';

/** How often open stand pages refresh (technicians change stands from their phones). */
const STAND_POLL_MS = 60_000;

/** Zones and stands of the lab; `model` keeps the stands where that model is or will be. */
export function useStandBoard(params: { model?: string } = {}) {
  return useQuery({
    queryKey: qk.standBoard(params),
    queryFn: () => api.get<StandBoardDTO>('/stands', { model: params.model }),
    placeholderData: keepPreviousData,
    refetchInterval: STAND_POLL_MS,
  });
}

export function useStandTechnicians(enabled = true) {
  return useQuery({
    queryKey: qk.standTechnicians,
    queryFn: () => api.get<UserRef[]>('/stands/technicians'),
    enabled,
  });
}

export function useStandBookings(params: ListStandBookingsQuery) {
  return useQuery({
    queryKey: qk.standBookings(params),
    queryFn: () =>
      api.get<StandBookingDTO[]>('/stands/bookings', {
        from: params.from,
        to: params.to,
        standId: params.standId,
        projectId: params.projectId,
        q: params.q,
      }),
    placeholderData: keepPreviousData,
  });
}

/** Installs, uninstalls and replacements on the stands, newest first. */
export function useStandEvents(params: Partial<ListStandEventsQuery>) {
  return useQuery({
    queryKey: qk.standEvents(params),
    queryFn: () =>
      api.get<StandEventDTO[]>('/stands/events', {
        q: params.q,
        standId: params.standId,
        actorId: params.actorId,
        from: params.from,
        to: params.to,
        limit: params.limit,
      }),
    placeholderData: keepPreviousData,
  });
}

/** A technician's year: for the year-end report. */
export function useTechnicianWork(technicianId: number | null, year: number) {
  return useQuery({
    queryKey: qk.standWork(technicianId ?? 0, year),
    queryFn: () =>
      api.get<TechnicianWorkDTO>('/stands/work', { technicianId: technicianId!, year }),
    enabled: technicianId !== null,
    placeholderData: keepPreviousData,
  });
}

export function useStandRequests(params: Partial<ListStandRequestsQuery>) {
  return useQuery({
    queryKey: qk.standRequests(params),
    queryFn: () =>
      api.get<StandRequestDTO[]>('/stands/requests', {
        scope: params.scope,
        status: params.status,
        standId: params.standId,
      }),
    placeholderData: keepPreviousData,
    refetchInterval: STAND_POLL_MS,
  });
}

/** Every change on this page can move the board, the timeline and the requests: refresh all. */
function useRefresh() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: qk.stands }),
      // A request change also creates notifications.
      qc.invalidateQueries({ queryKey: ['notifications'] }),
    ]);
}

function useStandMutation<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>) {
  const refresh = useRefresh();
  return useMutation({ mutationFn: fn, onSuccess: refresh });
}

export const useCreateZone = () =>
  useStandMutation((body: CreateStandZoneInput) => api.post<StandZoneDTO>('/stands/zones', body));
export const useUpdateZone = () =>
  useStandMutation(({ zoneId, ...body }: UpdateStandZoneInput & { zoneId: number }) =>
    api.patch<StandZoneDTO>(`/stands/zones/${zoneId}`, body),
  );
export const useDeleteZone = () =>
  useStandMutation((zoneId: number) => api.delete<void>(`/stands/zones/${zoneId}`));

export const useCreateStand = () =>
  useStandMutation((body: CreateStandInput) => api.post<StandDTO>('/stands', body));
export const useUpdateStand = () =>
  useStandMutation(({ standId, ...body }: UpdateStandInput & { standId: number }) =>
    api.patch<StandDTO>(`/stands/${standId}`, body),
  );
export const useDeleteStand = () =>
  useStandMutation((standId: number) => api.delete<void>(`/stands/${standId}`));

export const useCreateBooking = () =>
  useStandMutation((body: CreateStandBookingInput) =>
    api.post<StandBookingDTO>('/stands/bookings', body),
  );
export const useUpdateBooking = () =>
  useStandMutation(({ bookingId, ...body }: UpdateStandBookingInput & { bookingId: number }) =>
    api.patch<StandBookingDTO>(`/stands/bookings/${bookingId}`, body),
  );
export const useDeleteBooking = () =>
  useStandMutation((bookingId: number) => api.delete<void>(`/stands/bookings/${bookingId}`));

export const useCreateStandRequest = () =>
  useStandMutation((body: CreateStandRequestInput) =>
    api.post<StandRequestDTO>('/stands/requests', body),
  );

export type StandRequestAction =
  | { action: 'accept'; body: AcceptStandRequestInput }
  | { action: 'reject'; body: { technicianNote: string } }
  | { action: 'done'; body: { technicianNote?: string | null } }
  | { action: 'cancel'; body?: undefined };

/** Accept, reject, done (technician) or cancel (requester). */
export const useStandRequestAction = () =>
  useStandMutation(({ requestId, ...a }: StandRequestAction & { requestId: number }) =>
    api.post<StandRequestDTO>(`/stands/requests/${requestId}/${a.action}`, a.body ?? {}),
  );

/** Reads the lab's stand sheet; `apply` writes it, otherwise it is a preview. */
export const useImportStandSheet = () =>
  useStandMutation(({ file, apply }: { file: File; apply: boolean }) => {
    const fd = new FormData();
    fd.append('dryRun', apply ? 'false' : 'true');
    fd.append('file', file, file.name);
    return api.upload<StandImportResultDTO>('/stands/import', fd);
  });
