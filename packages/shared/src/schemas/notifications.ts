import { z } from 'zod';

export const listNotificationsQuerySchema = z.object({
  /** Only the ones not read yet. */
  unread: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
