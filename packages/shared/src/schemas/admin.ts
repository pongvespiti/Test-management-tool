import { z } from 'zod';
import { PROJECT_ROLES, RELEASE_STATUSES } from '../enums';
import { idSchema, optionalDate, optionalLine, optionalText, requiredLine } from './common';

export const PASSWORD_MIN = 8;

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters`)
  .max(200);

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const usernameSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9._-]{3,50}$/, '3–50 characters: letters, digits, dot, dash, underscore');

export const createUserSchema = z.object({
  username: usernameSchema,
  displayName: requiredLine(100),
  email: z
    .union([z.email(), z.literal('')])
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional(),
  isAdmin: z.boolean().default(false),
  password: passwordSchema,
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  displayName: requiredLine(100).optional(),
  email: z
    .union([z.email(), z.literal('')])
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional(),
  isAdmin: z.boolean().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const resetPasswordSchema = z.object({ newPassword: passwordSchema });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const projectKeySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z][A-Z0-9]{1,9}$/, '2–10 characters, letters and digits, starting with a letter');

export const createProjectSchema = z.object({
  key: projectKeySchema,
  name: requiredLine(200),
  description: optionalText(2000),
  docNoPattern: optionalLine(60),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z.object({
  name: requiredLine(200).optional(),
  description: optionalText(2000),
  docNoPattern: optionalLine(60),
  isArchived: z.boolean().optional(),
  /** When true, only leads can make a case `ready` (directly or by approving a review). */
  requireCaseReview: z.boolean().optional(),
});
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export const memberSchema = z.object({
  userId: idSchema,
  role: z.enum(PROJECT_ROLES),
});
export const setMembersSchema = z.object({ members: z.array(memberSchema).max(500) });
export type SetMembersInput = z.infer<typeof setMembersSchema>;

export const releaseSchema = z.object({
  name: requiredLine(100),
  description: optionalText(2000),
  startDate: optionalDate,
  endDate: optionalDate,
  status: z.enum(RELEASE_STATUSES).default('planned'),
});
export type ReleaseInput = z.infer<typeof releaseSchema>;
/** No defaults here: a PATCH must never reset fields it does not mention. */
export const updateReleaseSchema = z.object({
  name: requiredLine(100).optional(),
  description: optionalText(2000),
  startDate: optionalDate,
  endDate: optionalDate,
  status: z.enum(RELEASE_STATUSES).optional(),
});
export type UpdateReleaseInput = z.infer<typeof updateReleaseSchema>;

/** A build of a release, named as the team names it, e.g. `1.1.7(2.0.0)`. */
export const buildSchema = z.object({
  name: requiredLine(100),
  notes: optionalText(2000),
  builtDate: optionalDate,
});
export type BuildInput = z.infer<typeof buildSchema>;
/** No defaults here: a PATCH must never reset fields it does not mention. */
export const updateBuildSchema = buildSchema.partial();
export type UpdateBuildInput = z.infer<typeof updateBuildSchema>;

export const listBuildsQuerySchema = z.object({ releaseId: idSchema.optional() });
export type ListBuildsQuery = z.infer<typeof listBuildsQuerySchema>;

// ---------------------------------------------------------------- API tokens

export const createTokenSchema = z.object({
  name: requiredLine(100),
  /** Days until the token expires; null/omitted = never. */
  expiresInDays: z.number().int().min(1).max(3650).nullable().optional(),
});
export type CreateTokenInput = z.infer<typeof createTokenSchema>;
