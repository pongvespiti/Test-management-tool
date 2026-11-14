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

export const createStandBookingSchema = z
  .object({
    standId: idSchema,
    projectId: idSchema,
    model: requiredLine(80),
    startDate: isoDate,
    endDate: isoDate,
    note: optionalLine(1000),
  })
  .refine(dateRange, { message: 'The end date is before the start date', path: ['endDate'] });
export type CreateStandBookingInput = z.infer<typeof createStandBookingSchema>;

export const updateStandBookingSchema = z
  .object({
    model: requiredLine(80),
    startDate: isoDate,
    endDate: isoDate,
    note: optionalLine(1000),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to change' });
export type UpdateStandBookingInput = z.infer<typeof updateStandBookingSchema>;

/** Bookings that overlap [from, to] (default: from today for 8 weeks). */
export const listStandBookingsQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  standId: z.coerce.number().int().positive().optional(),
  projectId: z.coerce.number().int().positive().optional(),
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
