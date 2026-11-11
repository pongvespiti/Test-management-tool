import { Injectable } from '@nestjs/common';
import type { Prisma } from '@tmt/database';
import {
  defectKey,
  normalizeReferences,
  roleAtLeast,
  type AddSessionNoteInput,
  type CreateSessionInput,
  type ListSessionsQuery,
  type SessionDTO,
  type SessionListItemDTO,
  type SessionNoteDTO,
  type UpdateSessionInput,
} from '@tmt/shared';
import { conflict, forbidden, notFound, unprocessable } from '../../common/errors/app.exception.js';
import type { AuthUser, ProjectContext } from '../../common/types/auth.js';
import { assertActiveUser, iso, loadUserRefs, refOf } from '../../common/users/user-refs.js';
import { PrismaService, type Db, type Tx } from '../../prisma/prisma.service.js';
import { ActivityService } from '../activity/activity.service.js';
import { DimensionsService } from '../dimensions/dimensions.service.js';
import { assertReleaseInProject } from '../execution/execution.queries.js';
import { envInput, envOf } from '../execution/execution.mapper.js';

const sessionKey = (seq: number) => `EXP-${seq}`;

type SessionRow = Prisma.ExploratorySessionGetPayload<{
  include: {
    release: { select: { id: true; name: true } };
    build: { select: { id: true; name: true } };
  };
}>;

const REFS = {
  release: { select: { id: true, name: true } },
  build: { select: { id: true, name: true } },
} as const;

/** Reserves the next session number of the project (atomic, like defect numbers). */
async function allocateSeq(tx: Tx, projectId: number): Promise<number> {
  const [row] = await tx.$queryRaw<{ seq: number }[]>`
    UPDATE projects SET next_session_seq = next_session_seq + 1
    WHERE id = ${projectId}
    RETURNING next_session_seq - 1 AS seq`;
  return Number(row!.seq);
}

/** The build must belong to the project, and to the release when the session has one. */
async function assertBuild(
  db: Db,
  projectId: number,
  releaseId: number | null,
  buildId: number | null | undefined,
): Promise<void> {
  if (buildId === null || buildId === undefined) return;
  const found = await db.build.count({
    where: { id: buildId, release: { projectId }, ...(releaseId !== null && { releaseId }) },
  });
  if (!found)
    throw unprocessable('BAD_BUILD', "The build does not belong to the session's release");
}

/**
 * Exploratory sessions: a charter, an owner and a time box, a timeline of notes written while
 * testing, and the defects found. Sessions are planned, started and completed by testers.
 */
@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly dimensions: DimensionsService,
  ) {}

  /** Newest first. */
  async list(projectId: number, q: ListSessionsQuery): Promise<SessionListItemDTO[]> {
    const db = this.prisma.db;
    const rows = await db.exploratorySession.findMany({
      where: {
        projectId,
        ...(q.status && { status: q.status }),
        ...(q.releaseId !== undefined && { releaseId: q.releaseId }),
        ...(q.ownerId !== undefined && { ownerId: q.ownerId }),
      },
      orderBy: { seq: 'desc' },
      include: { ...REFS, _count: { select: { notes: true, defects: true } } },
    });
    const users = await loadUserRefs(
      db,
      rows.map((r) => r.ownerId),
    );
    return rows.map((r) =>
      toListItem(r, refOf(users, r.ownerId), r._count.notes, r._count.defects),
    );
  }

  async get(projectId: number, id: number): Promise<SessionDTO> {
    return this.load(this.prisma.db, projectId, id);
  }

  async create(ctx: ProjectContext, me: AuthUser, input: CreateSessionInput): Promise<SessionDTO> {
    const db = this.prisma.db;
    await assertReleaseInProject(db, ctx.id, input.releaseId);
    await assertBuild(db, ctx.id, input.releaseId ?? null, input.buildId);
    const ownerId = input.ownerId === undefined ? me.id : input.ownerId;
    await assertActiveUser(db, ownerId);
    const id = await db.$transaction(async (tx) => {
      const seq = await allocateSeq(tx, ctx.id);
      const environment = await this.dimensions.canonicalize(tx, ctx.id, input.environment);
      const s = await tx.exploratorySession.create({
        data: {
          projectId: ctx.id,
          seq,
          title: input.title,
          charter: input.charter ?? null,
          ownerId,
          releaseId: input.releaseId ?? null,
          buildId: input.buildId ?? null,
          environment: envInput(environment),
          timeBoxMinutes: input.timeBoxMinutes ?? null,
          references: normalizeReferences(input.references),
          createdById: me.id,
        },
      });
      await this.activity.log(tx, {
        projectId: ctx.id,
        userId: me.id,
        entityType: 'session',
        entityId: s.id,
        action: 'created',
        summary: `Planned ${sessionKey(seq)} ${s.title}`,
      });
      return s.id;
    });
    return this.load(db, ctx.id, id);
  }

  async update(
    ctx: ProjectContext,
    me: AuthUser,
    id: number,
    input: UpdateSessionInput,
  ): Promise<SessionDTO> {
    const db = this.prisma.db;
    const current = await this.row(db, ctx.id, id);
    const releaseId = input.releaseId === undefined ? current.releaseId : input.releaseId;
    await assertReleaseInProject(db, ctx.id, input.releaseId);
    // Moving to another release drops a build of the old one unless a new build is given.
    const buildId =
      input.buildId !== undefined
        ? input.buildId
        : input.releaseId !== undefined && input.releaseId !== current.releaseId
          ? null
          : current.buildId;
    await assertBuild(db, ctx.id, releaseId, buildId);
    if (input.ownerId) await assertActiveUser(db, input.ownerId);
    await db.$transaction(async (tx) => {
      await tx.exploratorySession.update({
        where: { id },
        data: {
          ...(input.title !== undefined && { title: input.title }),
          ...(input.charter !== undefined && { charter: input.charter }),
          ...(input.ownerId !== undefined && { ownerId: input.ownerId }),
          ...(input.releaseId !== undefined && { releaseId: input.releaseId }),
          ...(buildId !== current.buildId && { buildId }),
          ...(input.environment !== undefined && {
            environment: envInput(
              await this.dimensions.canonicalize(tx, ctx.id, input.environment),
            ),
          }),
          ...(input.timeBoxMinutes !== undefined && { timeBoxMinutes: input.timeBoxMinutes }),
          ...(input.references !== undefined && {
            references: normalizeReferences(input.references),
          }),
          ...(input.summary !== undefined && { summary: input.summary }),
        },
      });
      await this.activity.log(tx, {
        projectId: ctx.id,
        userId: me.id,
        entityType: 'session',
        entityId: id,
        action: 'updated',
        summary: `Updated ${sessionKey(current.seq)}`,
      });
    });
    return this.load(db, ctx.id, id);
  }

  /** planned → in progress; the clock starts now. */
  async start(ctx: ProjectContext, me: AuthUser, id: number): Promise<SessionDTO> {
    return this.move(
      ctx,
      me,
      id,
      'planned',
      {
        status: 'in_progress',
        startedAt: new Date(),
        endedAt: null,
      },
      'started',
    );
  }

  /** in progress → completed; the clock stops now. */
  async complete(ctx: ProjectContext, me: AuthUser, id: number): Promise<SessionDTO> {
    return this.move(
      ctx,
      me,
      id,
      'in_progress',
      { status: 'completed', endedAt: new Date() },
      'completed',
    );
  }

  /** completed → in progress again (the original start time stays, the end time is cleared). */
  async resume(ctx: ProjectContext, me: AuthUser, id: number): Promise<SessionDTO> {
    return this.move(ctx, me, id, 'completed', { status: 'in_progress', endedAt: null }, 'resumed');
  }

  async remove(ctx: ProjectContext, me: AuthUser, id: number): Promise<void> {
    const db = this.prisma.db;
    const s = await this.row(db, ctx.id, id);
    if (s.ownerId !== me.id && s.createdById !== me.id && !roleAtLeast(ctx.role, 'lead')) {
      throw forbidden('Only the owner or a project lead can delete this session');
    }
    await db.$transaction(async (tx) => {
      await tx.exploratorySession.delete({ where: { id } });
      await this.activity.log(tx, {
        projectId: ctx.id,
        userId: me.id,
        entityType: 'session',
        entityId: id,
        action: 'deleted',
        summary: `Deleted ${sessionKey(s.seq)} ${s.title}`,
      });
    });
  }

  async addNote(
    ctx: ProjectContext,
    me: AuthUser,
    id: number,
    input: AddSessionNoteInput,
  ): Promise<SessionNoteDTO> {
    const db = this.prisma.db;
    const s = await this.row(db, ctx.id, id);
    if (s.status === 'completed') {
      throw conflict('SESSION_COMPLETED', 'The session is completed — resume it to add notes');
    }
    const note = await db.exploratoryNote.create({
      data: { sessionId: id, kind: input.kind, body: input.body, authorId: me.id },
    });
    return toNote(note, refOf(await loadUserRefs(db, [me.id]), me.id));
  }

  async removeNote(ctx: ProjectContext, me: AuthUser, id: number, noteId: number): Promise<void> {
    const db = this.prisma.db;
    await this.row(db, ctx.id, id);
    const note = await db.exploratoryNote.findFirst({ where: { id: noteId, sessionId: id } });
    if (!note) throw notFound('Note', 'NOTE_NOT_FOUND');
    if (note.authorId !== me.id && !roleAtLeast(ctx.role, 'lead')) {
      throw forbidden('Only the author or a project lead can delete this note');
    }
    await db.exploratoryNote.delete({ where: { id: noteId } });
  }

  /** Links a defect of the project to the session (linking twice does nothing). */
  async linkDefect(
    ctx: ProjectContext,
    me: AuthUser,
    id: number,
    defectId: number,
  ): Promise<SessionDTO> {
    const db = this.prisma.db;
    const s = await this.row(db, ctx.id, id);
    const defect = await db.defect.findFirst({
      where: { id: defectId, projectId: ctx.id },
      select: { id: true, seq: true },
    });
    if (!defect) throw notFound('Defect', 'DEFECT_NOT_FOUND');
    await db.$transaction(async (tx) => {
      await tx.exploratoryDefect.upsert({
        where: { sessionId_defectId: { sessionId: id, defectId } },
        create: { sessionId: id, defectId },
        update: {},
      });
      await this.activity.log(tx, {
        projectId: ctx.id,
        userId: me.id,
        entityType: 'session',
        entityId: id,
        action: 'defect_linked',
        summary: `${sessionKey(s.seq)}: linked ${defectKey(defect.seq)}`,
      });
    });
    return this.load(db, ctx.id, id);
  }

  async unlinkDefect(ctx: ProjectContext, id: number, defectId: number): Promise<SessionDTO> {
    const db = this.prisma.db;
    await this.row(db, ctx.id, id);
    const removed = await db.exploratoryDefect.deleteMany({ where: { sessionId: id, defectId } });
    if (removed.count === 0) throw notFound('Link', 'LINK_NOT_FOUND');
    return this.load(db, ctx.id, id);
  }

  // ------------------------------------------------------------------ internals

  private async move(
    ctx: ProjectContext,
    me: AuthUser,
    id: number,
    from: SessionRow['status'],
    data: Prisma.ExploratorySessionUpdateInput,
    verb: string,
  ): Promise<SessionDTO> {
    const db = this.prisma.db;
    await db.$transaction(async (tx) => {
      const s = await this.row(tx, ctx.id, id);
      // The status is part of the filter, so two quick clicks cannot both succeed.
      const moved = await tx.exploratorySession.updateMany({
        where: { id, status: from },
        data: data as Prisma.ExploratorySessionUpdateManyMutationInput,
      });
      if (moved.count === 0) {
        throw conflict(
          'INVALID_SESSION_STATE',
          `The session is ${s.status.replace('_', ' ')} and cannot be ${verb}`,
        );
      }
      await this.activity.log(tx, {
        projectId: ctx.id,
        userId: me.id,
        entityType: 'session',
        entityId: id,
        action: verb,
        summary: `${sessionKey(s.seq)} ${verb}`,
      });
    });
    return this.load(db, ctx.id, id);
  }

  private async row(db: Db, projectId: number, id: number): Promise<SessionRow> {
    const row = await db.exploratorySession.findFirst({
      where: { id, projectId },
      include: REFS,
    });
    if (!row) throw notFound('Session', 'SESSION_NOT_FOUND');
    return row;
  }

  private async load(db: Db, projectId: number, id: number): Promise<SessionDTO> {
    const row = await db.exploratorySession.findFirst({
      where: { id, projectId },
      include: {
        ...REFS,
        notes: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
        defects: {
          orderBy: { createdAt: 'asc' },
          include: {
            defect: { select: { id: true, seq: true, title: true, status: true, severity: true } },
          },
        },
      },
    });
    if (!row) throw notFound('Session', 'SESSION_NOT_FOUND');
    const users = await loadUserRefs(db, [
      row.ownerId,
      row.createdById,
      ...row.notes.map((n) => n.authorId),
    ]);
    return {
      ...toListItem(row, refOf(users, row.ownerId), row.notes.length, row.defects.length),
      projectId: row.projectId,
      charter: row.charter,
      environment: envOf(row),
      summary: row.summary,
      createdBy: refOf(users, row.createdById),
      notes: row.notes.map((n) => toNote(n, refOf(users, n.authorId))),
      defects: row.defects.map(({ defect: d }) => ({
        id: d.id,
        key: defectKey(d.seq),
        title: d.title,
        status: d.status,
        severity: d.severity,
      })),
    };
  }
}

function toListItem(
  r: SessionRow,
  owner: SessionListItemDTO['owner'],
  noteCount: number,
  defectCount: number,
): SessionListItemDTO {
  return {
    id: r.id,
    key: sessionKey(r.seq),
    title: r.title,
    status: r.status,
    owner,
    release: r.release,
    build: r.build,
    references: r.references,
    timeBoxMinutes: r.timeBoxMinutes,
    startedAt: iso(r.startedAt),
    endedAt: iso(r.endedAt),
    noteCount,
    defectCount,
    createdAt: iso(r.createdAt)!,
  };
}

function toNote(
  n: { id: number; kind: SessionNoteDTO['kind']; body: string; createdAt: Date },
  author: SessionNoteDTO['author'],
): SessionNoteDTO {
  return { id: n.id, kind: n.kind, body: n.body, author, createdAt: iso(n.createdAt)! };
}
