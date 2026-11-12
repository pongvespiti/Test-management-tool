import { Injectable } from '@nestjs/common';
import type { Prisma } from '@tmt/database';
import {
  roleAtLeast,
  type CreateDeviceInput,
  type DeviceDTO,
  type ListDevicesQuery,
  type UpdateDeviceInput,
} from '@tmt/shared';
import { conflict, forbidden, notFound } from '../../common/errors/app.exception.js';
import type { AuthUser, ProjectContext } from '../../common/types/auth.js';
import { PrismaService, type Db } from '../../prisma/prisma.service.js';
import { ActivityService } from '../activity/activity.service.js';

const include = {
  holder: { select: { id: true, username: true, displayName: true } },
} satisfies Prisma.DeviceInclude;

type DeviceRow = Prisma.DeviceGetPayload<{ include: typeof include }>;

export function toDeviceDTO(d: DeviceRow): DeviceDTO {
  return {
    id: d.id,
    kind: d.kind,
    name: d.name,
    model: d.model,
    serial: d.serial,
    osVersion: d.osVersion,
    status: d.status,
    holder: d.holder,
    heldSince: d.heldSince?.toISOString() ?? null,
    note: d.note,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

const isUniqueViolation = (e: unknown) =>
  typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002';

/** Registry of the physical test devices of a project and who holds each one. */
@Injectable()
export class DevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  async list(ctx: ProjectContext, me: AuthUser, q: ListDevicesQuery): Promise<DeviceDTO[]> {
    const rows = await this.prisma.db.device.findMany({
      where: {
        projectId: ctx.id,
        ...(q.kind && { kind: q.kind }),
        ...(q.status && { status: q.status }),
        ...(q.mine && { holderId: me.id }),
        ...(q.q && {
          OR: [
            { name: { contains: q.q, mode: 'insensitive' } },
            { model: { contains: q.q, mode: 'insensitive' } },
            { serial: { contains: q.q, mode: 'insensitive' } },
            { holder: { displayName: { contains: q.q, mode: 'insensitive' } } },
          ],
        }),
      },
      include,
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    });
    return rows.map(toDeviceDTO);
  }

  async create(ctx: ProjectContext, me: AuthUser, input: CreateDeviceInput): Promise<DeviceDTO> {
    try {
      return await this.prisma.db.$transaction(async (tx) => {
        const row = await tx.device.create({
          data: { ...input, projectId: ctx.id },
          include,
        });
        await this.log(tx, ctx, me, row.id, 'created', `Added device ${row.name}`);
        return toDeviceDTO(row);
      });
    } catch (e) {
      throw this.nameTaken(e, input.name);
    }
  }

  async update(
    ctx: ProjectContext,
    me: AuthUser,
    id: number,
    input: UpdateDeviceInput,
  ): Promise<DeviceDTO> {
    const current = await this.find(ctx, id);
    if (input.status === 'repair' && current.status === 'in_use')
      throw conflict('DEVICE_IN_USE', `${current.name} is held by ${current.holder?.displayName}`);
    // An in-use device keeps its holder; "available" only ends a repair.
    const status = current.status === 'in_use' ? undefined : input.status;
    try {
      return await this.prisma.db.$transaction(async (tx) => {
        const row = await tx.device.update({
          where: { id },
          data: { ...input, status },
          include,
        });
        const summary =
          input.status && input.status !== current.status
            ? `${row.name} is ${input.status === 'repair' ? 'in repair' : 'back from repair'}`
            : `Changed device ${row.name}`;
        await this.log(tx, ctx, me, id, 'updated', summary);
        return toDeviceDTO(row);
      });
    } catch (e) {
      throw this.nameTaken(e, input.name ?? current.name);
    }
  }

  async remove(ctx: ProjectContext, me: AuthUser, id: number): Promise<void> {
    const current = await this.find(ctx, id);
    await this.prisma.db.$transaction(async (tx) => {
      await tx.device.delete({ where: { id } });
      await this.log(tx, ctx, me, id, 'deleted', `Removed device ${current.name}`);
    });
  }

  /** The caller takes a free device. Two people asking at once: only one gets it. */
  async checkOut(ctx: ProjectContext, me: AuthUser, id: number): Promise<DeviceDTO> {
    const current = await this.find(ctx, id);
    return this.prisma.db.$transaction(async (tx) => {
      const { count } = await tx.device.updateMany({
        where: { id, projectId: ctx.id, status: 'available' },
        data: { status: 'in_use', holderId: me.id, heldSince: new Date() },
      });
      if (count === 0) {
        const now = await tx.device.findUniqueOrThrow({ where: { id }, include });
        throw conflict(
          'DEVICE_NOT_AVAILABLE',
          now.status === 'repair'
            ? `${now.name} is in repair`
            : `${now.name} is held by ${now.holder?.displayName}`,
        );
      }
      await this.log(tx, ctx, me, id, 'checked_out', `${me.displayName} took ${current.name}`);
      return toDeviceDTO(await tx.device.findUniqueOrThrow({ where: { id }, include }));
    });
  }

  /** The holder gives the device back; a lead may do it for someone else. */
  async giveBack(ctx: ProjectContext, me: AuthUser, id: number): Promise<DeviceDTO> {
    const current = await this.find(ctx, id);
    if (current.status !== 'in_use')
      throw conflict('DEVICE_NOT_IN_USE', `${current.name} is not held by anyone`);
    if (current.holder?.id !== me.id && !roleAtLeast(ctx.role, 'lead'))
      throw forbidden('Only the holder or a lead can return this device', 'NOT_DEVICE_HOLDER');
    return this.prisma.db.$transaction(async (tx) => {
      const { count } = await tx.device.updateMany({
        where: { id, projectId: ctx.id, status: 'in_use', holderId: current.holder?.id },
        data: { status: 'available', holderId: null, heldSince: null },
      });
      if (count === 0)
        throw conflict('DEVICE_NOT_IN_USE', `${current.name} changed hands, look again`);
      const by = current.holder?.id === me.id ? '' : ` (for ${current.holder?.displayName})`;
      await this.log(
        tx,
        ctx,
        me,
        id,
        'returned',
        `${me.displayName} returned ${current.name}${by}`,
      );
      return toDeviceDTO(await tx.device.findUniqueOrThrow({ where: { id }, include }));
    });
  }

  private async find(ctx: ProjectContext, id: number) {
    const row = await this.prisma.db.device.findFirst({
      where: { id, projectId: ctx.id },
      include,
    });
    if (!row) throw notFound('Device', 'DEVICE_NOT_FOUND');
    return row;
  }

  private nameTaken(e: unknown, name: string): unknown {
    return isUniqueViolation(e)
      ? conflict('DEVICE_NAME_TAKEN', `A device named "${name}" already exists`)
      : e;
  }

  private log(
    db: Db,
    ctx: ProjectContext,
    me: AuthUser,
    id: number,
    action: string,
    summary: string,
  ) {
    return this.activity.log(db, {
      projectId: ctx.id,
      userId: me.id,
      entityType: 'device',
      entityId: id,
      action,
      summary,
    });
  }
}
