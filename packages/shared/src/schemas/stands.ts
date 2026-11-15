import { z } from 'zod';
import { STAND_REQUEST_KINDS, STAND_REQUEST_STATUSES } from '../enums';
import { idSchema, optionalLine, requiredLine } from './common';

const isoDate = z.iso.date();

export const createStandZoneSchema = z.object({
  name: requiredLine(60),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
});
export type CreateStandZoneInput = z.infer<typeof createStandZoneSchema>;

export const updateStandZoneSchema = createStandZoneSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to change' });
export type UpdateStandZoneInput = z.infer<typeof updateStandZoneSchema>;

const standFields = {
  zoneId: idSchema,
  code: requiredLine(40),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  /** Model installed now; empty = the stand is empty. */
  currentModel: optionalLine(80),
  inCharge: optionalLine(100),
  note: optionalLine(1000),
};

export const createStandSchema = z.object(standFields);
export type CreateStandInput = z.infer<typeof createStandSchema>;

export const updateStandSchema = z
  .object(standFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to change' });
export type UpdateStandInput = z.infer<typeof updateStandSchema>;

/** Board filter: `model` finds where a model is installed or booked. */
export const standBoardQuerySchema = z.object({
  model: z.string().trim().max(80).optional(),
});
export type StandBoardQuery = z.infer<typeof standBoardQuerySchema>;

const dateRange = <T extends { startDate?: string; endDate?: string }>(v: T) =>
  !v.startDate || !v.endDate || v.endDate >= v.startDate;

/** `HH:mm`, 00:00–24:00. */
export const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/, 'Use HH:mm, e.g. 09:30');

/** Minutes after midnight of `HH:mm`. */
export const minutesOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

const bookingFields = {
  model: requiredLine(80),
  startDate: isoDate,
  endDate: isoDate,
  /** With `endTime`: book hours instead of whole days. */
  startTime: timeOfDaySchema.nullable().optional(),
  endTime: timeOfDaySchema.nullable().optional(),
  /** Who tests on the stand; default = who books. */
  testerId: idSchema.nullable().optional(),
  note: optionalLine(1000),
};

type BookingTimes = {
  startDate?: string;
  endDate?: string;
  startTime?: string | null;
  endTime?: string | null;
};

const bothTimesOrNone = (v: BookingTimes) => !v.startTime === !v.endTime;
const endAfterStart = (v: BookingTimes) =>
  !v.startDate ||
  !v.endDate ||
  v.endDate > v.startDate ||
  (v.endDate === v.startDate &&
    (!v.startTime || !v.endTime || minutesOf(v.endTime) > minutesOf(v.startTime)));

export const createStandBookingSchema = z
  .object({ standId: idSchema, projectId: idSchema, ...bookingFields })
  .refine(dateRange, { message: 'The end date is before the start date', path: ['endDate'] })
  .refine(bothTimesOrNone, { message: 'Enter both times, or none', path: ['endTime'] })
  .refine(endAfterStart, { message: 'The end time is before the start time', path: ['endTime'] });
export type CreateStandBookingInput = z.infer<typeof createStandBookingSchema>;

export const updateStandBookingSchema = z
  .object(bookingFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to change' });
export type UpdateStandBookingInput = z.infer<typeof updateStandBookingSchema>;

/** Bookings that overlap [from, to] (default: from today for 8 weeks). */
export const listStandBookingsQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  standId: z.coerce.number().int().positive().optional(),
  projectId: z.coerce.number().int().positive().optional(),
  /** Matches the model, the stand code or the project key. */
  q: z.string().trim().max(80).optional(),
});
export type ListStandBookingsQuery = z.infer<typeof listStandBookingsQuerySchema>;

export const createStandRequestSchema = z
  .object({
    standId: idSchema,
    projectId: idSchema.nullable().optional(),
    kind: z.enum(STAND_REQUEST_KINDS),
    /** Model to install (install / replace). */
    model: optionalLine(80),
    technicianId: idSchema,
    requestedDate: isoDate,
    note: optionalLine(1000),
  })
  .refine((v) => v.kind === 'uninstall' || !!v.model, {
    message: 'Enter the model to install',
    path: ['model'],
  });
export type CreateStandRequestInput = z.infer<typeof createStandRequestSchema>;

export const listStandRequestsQuerySchema = z.object({
  /** `mine` = assigned to me (technician) or made by me. */
  scope: z.enum(['mine', 'all']).default('mine'),
  status: z.enum([...STAND_REQUEST_STATUSES, 'open']).optional(),
  standId: z.coerce.number().int().positive().optional(),
});
export type ListStandRequestsQuery = z.infer<typeof listStandRequestsQuerySchema>;

/** Technician accepts, optionally on another day than requested. */
export const acceptStandRequestSchema = z.object({
  scheduledDate: isoDate.optional(),
  technicianNote: optionalLine(1000),
});
export type AcceptStandRequestInput = z.infer<typeof acceptStandRequestSchema>;

export const rejectStandRequestSchema = z.object({ technicianNote: requiredLine(1000) });
export type RejectStandRequestInput = z.infer<typeof rejectStandRequestSchema>;

export const completeStandRequestSchema = z.object({ technicianNote: optionalLine(1000) });
export type CompleteStandRequestInput = z.infer<typeof completeStandRequestSchema>;

/** Import of the lab's stand sheet: `dryRun` shows what would change without writing. */
export const standImportFieldsSchema = z.object({
  dryRun: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .default(true),
});
export type StandImportFields = z.infer<typeof standImportFieldsSchema>;

/** History of the units on the stands. */
export const listStandEventsQuerySchema = z.object({
  /** Matches the model before or after, the stand code or the project key. */
  q: z.string().trim().max(80).optional(),
  standId: z.coerce.number().int().positive().optional(),
  actorId: z.coerce.number().int().positive().optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(300),
});
export type ListStandEventsQuery = z.infer<typeof listStandEventsQuerySchema>;

export const technicianWorkQuerySchema = z.object({
  technicianId: z.coerce.number().int().positive(),
  year: z.coerce.number().int().min(2000).max(2100),
});
export type TechnicianWorkQuery = z.infer<typeof technicianWorkQuerySchema>;
