import { Injectable } from '@nestjs/common';
import type { Prisma, SavedView } from '@tmt/database';
import {
  roleAtLeast,
  summaryViewConfigSchema,
  type SavedViewDTO,
  type SavedViewInput,
} from '@tmt/shared';
import { conflict, forbidden, notFound } from '../../common/errors/app.exception.js';
import { isUniqueViolation } from '../../common/errors/prisma-errors.js';
import type { AuthUser, ProjectContext } from '../../common/types/auth.js';
import { loadUserRefs, refOf, iso } from '../../common/users/user-refs.js';
import { PrismaService } from '../../prisma/prisma.service.js';

/** Named ways of looking at the summary report: private to their owner or shared with the project. */
@Injectable()
export class SavedViewsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Own views and shared ones, by name. */
  async list(ctx: ProjectContext, me: AuthUser): Promise<SavedViewDTO[]> {
    const db = this.prisma.db;
    const rows = await db.savedView.findMany({
      where: { projectId: ctx.id, OR: [{ shared: true }, { userId: me.id }] },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    const users = await loadUserRefs(
      db,
      rows.map((r) => r.userId),
    );
    return rows.map((r) => toDTO(r, refOf(users, r.userId)));
  }

  async create(ctx: ProjectContext, me: AuthUser, input: SavedViewInput): Promise<SavedViewDTO> {
    const db = this.prisma.db;
    let row: SavedView;
    try {
      row = await db.savedView.create({
        data: {
          projectId: ctx.id,
          userId: me.id,
          name: input.name,
          shared: input.shared,
          config: input.config as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw conflict('VIEW_NAME_TAKEN', `You already have a view named "${input.name}"`);
      }
      throw e;
    }
    return toDTO(row, refOf(await loadUserRefs(db, [me.id]), me.id));
  }

  /** The owner or a lead can delete a view. */
  async remove(ctx: ProjectContext, me: AuthUser, id: number): Promise<void> {
    const db = this.prisma.db;
    const row = await db.savedView.findFirst({ where: { id, projectId: ctx.id } });
    if (!row || (!row.shared && row.userId !== me.id)) throw notFound('View', 'VIEW_NOT_FOUND');
    if (row.userId !== me.id && !roleAtLeast(ctx.role, 'lead')) {
      throw forbidden('Only the owner or a project lead can delete this view');
    }
    await db.savedView.delete({ where: { id } });
  }
}

function toDTO(row: SavedView, owner: SavedViewDTO['owner']): SavedViewDTO {
  // The stored shape is written by this service; parsing keeps old rows readable if it grows.
  const config = summaryViewConfigSchema.parse(row.config ?? {});
  return {
    id: row.id,
    name: row.name,
    shared: row.shared,
    owner,
    config,
    createdAt: iso(row.createdAt)!,
  };
}
