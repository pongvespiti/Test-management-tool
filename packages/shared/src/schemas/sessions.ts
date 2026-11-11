import { z } from 'zod';
import { SESSION_NOTE_KINDS, SESSION_STATUSES } from '../enums';
import { idSchema, optionalText, requiredLine } from './common';
import { envEntrySchema } from './execution';

/** Shortest and longest time box of a session, in minutes. */
export const SESSION_MIN_MINUTES = 5;
export const SESSION_MAX_MINUTES = 24 * 60;

export const createSessionSchema = z.object({
  title: requiredLine(200),
  /** The mission: what to explore and what to look for. */
  charter: optionalText(8000),
  ownerId: idSchema.nullable().optional(),
  releaseId: idSchema.nullable().optional(),
  /** Build under test; must belong to the release (422 BAD_BUILD). */
  buildId: idSchema.nullable().optional(),
  /** Same label/value pairs as a run (Platform, OS ver, Unit model …). */
  environment: z.array(envEntrySchema).max(80).default([]),
  timeBoxMinutes: z.number().int().min(SESSION_MIN_MINUTES).max(SESSION_MAX_MINUTES).nullable().optional(),
  /** Requirements, Jira keys or specs the session explores — spelled like case references. */
  references: optionalText(1000),
});
export type CreateSessionInput = z.infer<typeof createSessionSchema>;

export const updateSessionSchema = createSessionSchema.partial().extend({
  /** What was found and what is left, written at the end. */
  summary: optionalText(8000),
});
export type UpdateSessionInput = z.infer<typeof updateSessionSchema>;

export const listSessionsQuerySchema = z.object({
  status: z.enum(SESSION_STATUSES).optional(),
  releaseId: idSchema.optional(),
  ownerId: idSchema.optional(),
});
export type ListSessionsQuery = z.infer<typeof listSessionsQuerySchema>;

export const addSessionNoteSchema = z.object({
  kind: z.enum(SESSION_NOTE_KINDS).default('note'),
  body: z.string().trim().min(1).max(4000),
});
export type AddSessionNoteInput = z.infer<typeof addSessionNoteSchema>;

export const linkSessionDefectSchema = z.object({ defectId: idSchema });
