import { z } from 'zod';
import { DEVICE_KINDS } from '../enums';
import { optionalLine, requiredLine } from './common';

export const listDevicesQuerySchema = z.object({
  kind: z.enum(DEVICE_KINDS).optional(),
  status: z.enum(['available', 'in_use', 'repair']).optional(),
  /** Matches name, model, serial number or the holder. */
  q: z.string().trim().max(100).optional(),
  /** Only devices held by the caller. */
  mine: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});
export type ListDevicesQuery = z.infer<typeof listDevicesQuerySchema>;

const deviceFields = {
  kind: z.enum(DEVICE_KINDS),
  name: requiredLine(80),
  model: optionalLine(80),
  serial: optionalLine(80),
  /** OS version or firmware of the device. */
  osVersion: optionalLine(80),
  note: optionalLine(1000),
};

export const createDeviceSchema = z.object(deviceFields);
export type CreateDeviceInput = z.infer<typeof createDeviceSchema>;

/**
 * Changing a device. `status` only moves a free device to repair and back: holding a device goes
 * through check-out and return.
 */
export const updateDeviceSchema = z
  .object({ ...deviceFields, status: z.enum(['available', 'repair']) })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to change' });
export type UpdateDeviceInput = z.infer<typeof updateDeviceSchema>;
