import { Injectable } from '@nestjs/common';
import type { Prisma } from '@tmt/database';
import {
  roleAtLeast,
  STAND_REQUEST_KIND_LABELS,
  type AcceptStandRequestInput,
  type CompleteStandRequestInput,
  type CreateStandBookingInput,
  type CreateStandInput,
  type CreateStandRequestInput,
  type CreateStandZoneInput,
  type ListStandBookingsQuery,
  type ListStandRequestsQuery,
  type RejectStandRequestInput,
  type StandBoardDTO,
  type StandBoardQuery,
  type StandBookingDTO,
  type StandDTO,
  type StandImportResultDTO,
  type StandImportRow,
  type StandRequestDTO,
  type StandRequestStatus,
  type StandZoneDTO,
  type UpdateStandBookingInput,
  type UpdateStandInput,
  type UpdateStandZoneInput,
  type UserRef,
} from '@tmt/shared';
import {
  AppException,
  conflict,
  forbidden,
  notFound,
  unprocessable,
} from '../../common/errors/app.exception.js';
import { isUniqueViolation } from '../../common/errors/prisma-errors.js';
import type { AuthUser } from '../../common/types/auth.js';
import { dateOnly, parseDateOnly } from '../../common/users/user-refs.js';
import { AppConfig } from '../../config/app-config.js';
import { PrismaService, type Db } from '../../prisma/prisma.service.js';
import { ActivityService } from '../activity/activity.service.js';
import { notifyUsers } from '../notifications/notify.js';
import { addDays, localDate } from '../reports/report-dates.js';
import type { SheetStand } from './stand-sheet.js';

const userSelect = { select: { id: true, username: true, displayName: true } } as const;
const projectSelect = { select: { id: true, key: true, name: true } } as const;

const bookingInclude = {
  stand: { select: { code: true } },
  project: projectSelect,
  createdBy: userSelect,
} satisfies Prisma.StandBookingInclude;
type BookingRow = Prisma.StandBookingGetPayload<{ include: typeof bookingInclude }>;

const requestInclude = {
  stand: { select: { code: true, zone: { select: { name: true } } } },
  project: projectSelect,
  technician: userSelect,
  requestedBy: userSelect,
} satisfies Prisma.StandRequestInclude;
type RequestRow = Prisma.StandRequestGetPayload<{ include: typeof requestInclude }>;

/**
 * Inside transactions rows are read with at most one relation: Prisma reads several relations of a
 * row in parallel, which a transaction's single connection does not allow.
 */
const standCode = { stand: { select: { code: true } } } satisfies Prisma.StandRequestInclude;
type RequestCore = Prisma.StandRequestGetPayload<{ include: typeof standCode }>;

/** Bookings the board looks ahead for ("next booking"). */
const LOOKAHEAD_DAYS = 365;
/** Default window of the booking timeline. */
const DEFAULT_WINDOW_DAYS = 56;

function toBookingDTO(b: BookingRow): StandBookingDTO {
  return {
    id: b.id,
    standId: b.standId,
    standCode: b.stand.code,
    project: b.project,
    model: b.model,
    startDate: dateOnly(b.startDate)!,
    endDate: dateOnly(b.endDate)!,
    note: b.note,
    createdBy: b.createdBy,
    createdAt: b.createdAt.toISOString(),
  };
}

function toRequestDTO(r: RequestRow): StandRequestDTO {
  return {
    id: r.id,
    standId: r.standId,
    standCode: r.stand.code,
    zoneName: r.stand.zone.name,
    project: r.project,
    kind: r.kind,
    model: r.model,
    technician: r.technician,
    requestedBy: r.requestedBy,
    requestedDate: dateOnly(r.requestedDate)!,
    scheduledDate: dateOnly(r.scheduledDate),
    status: r.status,
    note: r.note,
    technicianNote: r.technicianNote,
    doneAt: r.doneAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

const standNotFound = () => notFound('Stand', 'STAND_NOT_FOUND');
const requestNotFound = () => notFound('Stand request', 'STAND_REQUEST_NOT_FOUND');
const bookingNotFound = () => notFound('Booking', 'STAND_BOOKING_NOT_FOUND');

/** Path of the web page that opens a request. */
const requestLink = (id: number) => `/stands?tab=requests&request=${id}`;

/**
 * Test stands of the lab, shared by all projects: where each AC model is installed, bookings of
 * stands for a project's testing, and install / uninstall requests to technicians.
 *
 * Who does what: everyone signed in sees everything here. Technicians and administrators keep the
 * layout and the stand data up to date and handle the requests sent to them. Testers and leads
 * book stands for their projects and send requests.
 */
@Injectable()
export class StandsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly config: AppConfig,
  ) {}

  private today(): string {
    return localDate(new Date(), this.config.reportTimezone);
  }

  // ---------------------------------------------------------------- who may do what

  static canManage(me: AuthUser): boolean {
    return me.isAdmin || me.isTechnician;
  }

  private assertManage(me: AuthUser): void {
    if (!StandsService.canManage(me)) {
      throw forbidden('Only technicians and administrators change the test stands');
    }
  }

  /** Testers and leads (of any project) and administrators may book and send requests. */
  private async canRequest(me: AuthUser): Promise<boolean> {
    if (me.isTechnician) return false;
    if (me.isAdmin) return true;
    const n = await this.prisma.db.projectMember.count({
      where: { userId: me.id, role: { in: ['tester', 'lead'] } },
    });
    return n > 0;
  }

  /** The caller must be tester or lead in `projectId` (admins: any project). 404 for strangers. */
  private async assertProjectRole(me: AuthUser, projectId: number): Promise<void> {
    if (me.isTechnician) {
      throw forbidden('Technicians handle requests; testers send them', 'TECHNICIAN_NOT_ALLOWED');
    }
    const project = await this.prisma.db.project.findUnique({
      where: { id: projectId },
      select: { members: { where: { userId: me.id }, select: { role: true } } },
    });
    const role = me.isAdmin ? 'lead' : project?.members[0]?.role;
    if (!project || !role) throw notFound('Project', 'PROJECT_NOT_FOUND');
    if (!roleAtLeast(role, 'tester')) {
      throw forbidden('Booking stands and sending requests needs the tester role in the project');
    }
  }

  // ---------------------------------------------------------------- board

  async board(me: AuthUser, q: StandBoardQuery): Promise<StandBoardDTO> {
    const db = this.prisma.db;
    const today = this.today();
    const todayDate = parseDateOnly(today)!;
    const [zones, bookings, open] = await Promise.all([
      db.standZone.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: {
          stands: {
            orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
            include: { updatedBy: userSelect },
          },
        },
      }),
      db.standBooking.findMany({
        where: {
          endDate: { gte: todayDate },
          startDate: { lte: parseDateOnly(addDays(today, LOOKAHEAD_DAYS))! },
        },
        include: bookingInclude,
        orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
      }),
      db.standRequest.groupBy({
        by: ['standId'],
        where: { status: { in: ['requested', 'accepted'] } },
        _count: { _all: true },
      }),
    ]);
    const openBy = new Map(open.map((o) => [o.standId, o._count._all]));
    const bookingsBy = new Map<number, BookingRow[]>();
    for (const b of bookings) {
      const list = bookingsBy.get(b.standId) ?? [];
      list.push(b);
      bookingsBy.set(b.standId, list);
    }
    const needle = q.model?.toLowerCase();
    const result: StandZoneDTO[] = [];
    for (const z of zones) {
      const stands: StandDTO[] = [];
      for (const s of z.stands) {
        const list = bookingsBy.get(s.id) ?? [];
        const current = list.find((b) => dateOnly(b.startDate)! <= today) ?? null;
        const next = list.find((b) => dateOnly(b.startDate)! > today) ?? null;
        const dto: StandDTO = {
          id: s.id,
          zoneId: s.zoneId,
          code: s.code,
          sortOrder: s.sortOrder,
          currentModel: s.currentModel,
          inCharge: s.inCharge,
          note: s.note,
          updatedBy: s.updatedBy,
          updatedAt: s.updatedAt.toISOString(),
          currentBooking: current && toBookingDTO(current),
          nextBooking: next && toBookingDTO(next),
          openRequests: openBy.get(s.id) ?? 0,
        };
        if (needle && !matchesModel(dto, list, needle)) continue;
        stands.push(dto);
      }
      if (needle && stands.length === 0) continue;
      result.push({ id: z.id, name: z.name, sortOrder: z.sortOrder, stands });
    }
    return {
      zones: result,
      canManage: StandsService.canManage(me),
      canRequest: await this.canRequest(me),
    };
  }

  /** Active technicians, for the request form. */
  async technicians(): Promise<UserRef[]> {
    return this.prisma.db.user.findMany({
      where: { isTechnician: true, isActive: true },
      orderBy: { displayName: 'asc' },
      select: { id: true, username: true, displayName: true },
    });
  }

  // ---------------------------------------------------------------- zones

  async createZone(me: AuthUser, input: CreateStandZoneInput): Promise<StandZoneDTO> {
    this.assertManage(me);
    try {
      const z = await this.prisma.db.$transaction(async (tx) => {
        const sortOrder = input.sortOrder ?? (await nextZoneOrder(tx));
        const row = await tx.standZone.create({ data: { name: input.name, sortOrder } });
        await this.log(tx, me, 'stand_zone', row.id, 'created', `Added zone ${row.name}`);
        return row;
      });
      return { id: z.id, name: z.name, sortOrder: z.sortOrder, stands: [] };
    } catch (e) {
      if (isUniqueViolation(e)) throw zoneTaken(input.name);
      throw e;
    }
  }

  async updateZone(
    me: AuthUser,
    zoneId: number,
    input: UpdateStandZoneInput,
  ): Promise<StandZoneDTO> {
    this.assertManage(me);
    const exists = await this.prisma.db.standZone.count({ where: { id: zoneId } });
    if (!exists) throw notFound('Zone', 'STAND_ZONE_NOT_FOUND');
    try {
      await this.prisma.db.$transaction(async (tx) => {
        const row = await tx.standZone.update({ where: { id: zoneId }, data: input });
        await this.log(tx, me, 'stand_zone', row.id, 'updated', `Changed zone ${row.name}`);
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw zoneTaken(input.name ?? '');
      throw e;
    }
    const board = await this.board(me, {});
    return board.zones.find((z) => z.id === zoneId)!;
  }

  async removeZone(me: AuthUser, zoneId: number): Promise<void> {
    this.assertManage(me);
    await this.prisma.db.$transaction(async (tx) => {
      const zone = await tx.standZone.findUnique({
        where: { id: zoneId },
        include: { _count: { select: { stands: true } } },
      });
      if (!zone) throw notFound('Zone', 'STAND_ZONE_NOT_FOUND');
      if (zone._count.stands > 0) {
        throw conflict('STAND_ZONE_NOT_EMPTY', 'Move or delete the stands of the zone first');
      }
      await tx.standZone.delete({ where: { id: zoneId } });
      await this.log(tx, me, 'stand_zone', zoneId, 'deleted', `Deleted zone ${zone.name}`);
    });
  }

  // ---------------------------------------------------------------- stands

  async get(me: AuthUser, standId: number): Promise<StandDTO> {
    const exists = await this.prisma.db.stand.findUnique({
      where: { id: standId },
      select: { zoneId: true },
    });
    if (!exists) throw standNotFound();
    const board = await this.board(me, {});
    return board.zones.flatMap((z) => z.stands).find((s) => s.id === standId)!;
  }

  async createStand(me: AuthUser, input: CreateStandInput): Promise<StandDTO> {
    this.assertManage(me);
    await this.assertZone(input.zoneId);
    let id: number;
    try {
      id = await this.prisma.db.$transaction(async (tx) => {
        const sortOrder = input.sortOrder ?? (await nextStandOrder(tx, input.zoneId));
        const row = await tx.stand.create({
          data: {
            zoneId: input.zoneId,
            code: input.code,
            sortOrder,
            currentModel: input.currentModel ?? null,
            inCharge: input.inCharge ?? null,
            note: input.note ?? null,
            updatedById: me.id,
          },
        });
        await this.log(tx, me, 'stand', row.id, 'created', `Added stand ${row.code}`);
        return row.id;
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw standTaken(input.code);
      throw e;
    }
    return this.get(me, id);
  }

  /** Technicians and administrators keep the stand data current (model installed, in charge …). */
  async updateStand(me: AuthUser, standId: number, input: UpdateStandInput): Promise<StandDTO> {
    this.assertManage(me);
    const before = await this.prisma.db.stand.findUnique({ where: { id: standId } });
    if (!before) throw standNotFound();
    if (input.zoneId !== undefined) await this.assertZone(input.zoneId);
    try {
      await this.prisma.db.$transaction(async (tx) => {
        const row = await tx.stand.update({
          where: { id: standId },
          data: { ...input, updatedById: me.id },
        });
        const modelChanged =
          input.currentModel !== undefined && input.currentModel !== before.currentModel;
        await this.log(
          tx,
          me,
          'stand',
          standId,
          'updated',
          modelChanged
            ? `Stand ${row.code}: ${before.currentModel ?? 'empty'} → ${row.currentModel ?? 'empty'}`
            : `Changed stand ${row.code}`,
          { ...input },
        );
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw standTaken(input.code ?? '');
      throw e;
    }
    return this.get(me, standId);
  }

  async removeStand(me: AuthUser, standId: number): Promise<void> {
    this.assertManage(me);
    await this.prisma.db.$transaction(async (tx) => {
      const stand = await tx.stand.findUnique({ where: { id: standId } });
      if (!stand) throw standNotFound();
      await tx.stand.delete({ where: { id: standId } });
      await this.log(tx, me, 'stand', standId, 'deleted', `Deleted stand ${stand.code}`);
    });
  }

  private async assertZone(zoneId: number): Promise<void> {
    const n = await this.prisma.db.standZone.count({ where: { id: zoneId } });
    if (!n) throw unprocessable('STAND_ZONE_NOT_FOUND', 'The zone does not exist');
  }

  // ---------------------------------------------------------------- bookings

  async listBookings(q: ListStandBookingsQuery): Promise<StandBookingDTO[]> {
    const from = q.from ?? this.today();
    const to = q.to ?? addDays(from, DEFAULT_WINDOW_DAYS);
    const rows = await this.prisma.db.standBooking.findMany({
      where: {
        startDate: { lte: parseDateOnly(to)! },
        endDate: { gte: parseDateOnly(from)! },
        ...(q.standId && { standId: q.standId }),
        ...(q.projectId && { projectId: q.projectId }),
      },
      include: bookingInclude,
      orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
      take: 2000,
    });
    return rows.map(toBookingDTO);
  }

  /** Books a stand for a project; 409 STAND_BOOKED when the days overlap another booking. */
  async createBooking(me: AuthUser, input: CreateStandBookingInput): Promise<StandBookingDTO> {
    await this.assertProjectRole(me, input.projectId);
    const stand = await this.prisma.db.stand.findUnique({ where: { id: input.standId } });
    if (!stand) throw unprocessable('STAND_NOT_FOUND', 'The stand does not exist');
    const row = await this.prisma.db.$transaction(async (tx) => {
      await lockStand(tx, input.standId);
      await this.assertFree(tx, input.standId, input.startDate, input.endDate);
      const b = await tx.standBooking.create({
        data: {
          standId: input.standId,
          projectId: input.projectId,
          model: input.model,
          startDate: parseDateOnly(input.startDate)!,
          endDate: parseDateOnly(input.endDate)!,
          note: input.note ?? null,
          createdById: me.id,
        },
      });
      await this.log(
        tx,
        me,
        'stand_booking',
        b.id,
        'created',
        `Booked ${stand.code} (${input.startDate} – ${input.endDate})`,
        null,
        input.projectId,
      );
      return b;
    });
    return this.loadBooking(row.id);
  }

  async updateBooking(
    me: AuthUser,
    bookingId: number,
    input: UpdateStandBookingInput,
  ): Promise<StandBookingDTO> {
    const before = await this.loadOwnBooking(me, bookingId);
    const start = input.startDate ?? dateOnly(before.startDate)!;
    const end = input.endDate ?? dateOnly(before.endDate)!;
    if (end < start) {
      throw new AppException(400, 'VALIDATION_FAILED', 'The end date is before the start date');
    }
    const row = await this.prisma.db.$transaction(async (tx) => {
      await lockStand(tx, before.standId);
      await this.assertFree(tx, before.standId, start, end, bookingId);
      const b = await tx.standBooking.update({
        where: { id: bookingId },
        data: {
          ...(input.model !== undefined && { model: input.model }),
          ...(input.note !== undefined && { note: input.note }),
          startDate: parseDateOnly(start)!,
          endDate: parseDateOnly(end)!,
        },
      });
      await this.log(
        tx,
        me,
        'stand_booking',
        b.id,
        'updated',
        `Changed booking of ${before.stand.code} (${start} – ${end})`,
        null,
        b.projectId,
      );
      return b;
    });
    return this.loadBooking(row.id);
  }

  async removeBooking(me: AuthUser, bookingId: number): Promise<void> {
    const b = await this.loadOwnBooking(me, bookingId);
    await this.prisma.db.$transaction(async (tx) => {
      await tx.standBooking.delete({ where: { id: bookingId } });
      await this.log(
        tx,
        me,
        'stand_booking',
        bookingId,
        'deleted',
        `Cancelled booking of ${b.stand.code} for ${b.project.key}`,
        null,
        b.projectId,
      );
    });
  }

  /** The booking's creator, a lead of its project or an administrator may change it. */
  private async loadOwnBooking(me: AuthUser, bookingId: number): Promise<BookingRow> {
    const b = await this.prisma.db.standBooking.findUnique({
      where: { id: bookingId },
      include: bookingInclude,
    });
    if (!b) throw bookingNotFound();
    if (me.isAdmin || b.createdById === me.id) return b;
    const lead = await this.prisma.db.projectMember.count({
      where: { projectId: b.projectId, userId: me.id, role: 'lead' },
    });
    if (!lead)
      throw forbidden('Only the person who booked, a project lead or an admin can change it');
    return b;
  }

  private async loadBooking(id: number): Promise<StandBookingDTO> {
    const b = await this.prisma.db.standBooking.findUniqueOrThrow({
      where: { id },
      include: bookingInclude,
    });
    return toBookingDTO(b);
  }

  private async loadRequest(id: number): Promise<RequestRow> {
    return this.prisma.db.standRequest.findUniqueOrThrow({
      where: { id },
      include: requestInclude,
    });
  }

  private async assertFree(
    tx: Db,
    standId: number,
    start: string,
    end: string,
    exceptId?: number,
  ): Promise<void> {
    const clash = await tx.standBooking.findFirst({
      where: {
        standId,
        startDate: { lte: parseDateOnly(end)! },
        endDate: { gte: parseDateOnly(start)! },
        ...(exceptId && { id: { not: exceptId } }),
      },
      select: { id: true },
      orderBy: { startDate: 'asc' },
    });
    if (clash) {
      // Read outside the transaction: one query at a time on its connection.
      const c = await this.loadBooking(clash.id);
      throw new AppException(
        409,
        'STAND_BOOKED',
        `${c.standCode} is booked for ${c.project.key} from ${c.startDate} to ${c.endDate}`,
        { booking: c },
      );
    }
  }

  // ---------------------------------------------------------------- requests

  async listRequests(me: AuthUser, q: ListStandRequestsQuery): Promise<StandRequestDTO[]> {
    const status: Prisma.StandRequestWhereInput =
      q.status === 'open'
        ? { status: { in: ['requested', 'accepted'] } }
        : q.status
          ? { status: q.status }
          : {};
    const rows = await this.prisma.db.standRequest.findMany({
      where: {
        ...status,
        ...(q.standId && { standId: q.standId }),
        ...(q.scope === 'mine' && {
          OR: [{ technicianId: me.id }, { requestedById: me.id }],
        }),
      },
      include: requestInclude,
      orderBy: [{ requestedDate: 'asc' }, { id: 'asc' }],
      take: 500,
    });
    // Open ones first (by day), then the rest newest first.
    const dto = rows.map(toRequestDTO);
    return [
      ...dto.filter((r) => open(r.status)),
      ...dto.filter((r) => !open(r.status)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    ];
  }

  async getRequest(requestId: number): Promise<StandRequestDTO> {
    const r = await this.prisma.db.standRequest.findUnique({
      where: { id: requestId },
      include: requestInclude,
    });
    if (!r) throw requestNotFound();
    return toRequestDTO(r);
  }

  /** Sends a request to a technician, who is notified. */
  async createRequest(me: AuthUser, input: CreateStandRequestInput): Promise<StandRequestDTO> {
    if (me.isTechnician) {
      throw forbidden('Technicians handle requests; testers send them', 'TECHNICIAN_NOT_ALLOWED');
    }
    if (input.projectId) await this.assertProjectRole(me, input.projectId);
    else if (!(await this.canRequest(me))) {
      throw forbidden('Sending requests needs the tester role in a project');
    }
    const db = this.prisma.db;
    const stand = await db.stand.findUnique({ where: { id: input.standId } });
    if (!stand) throw unprocessable('STAND_NOT_FOUND', 'The stand does not exist');
    const tech = await db.user.findUnique({
      where: { id: input.technicianId },
      select: { isTechnician: true, isActive: true },
    });
    if (!tech?.isTechnician || !tech.isActive) {
      throw unprocessable('NOT_A_TECHNICIAN', 'Choose an active technician');
    }
    const row = await db.$transaction(async (tx) => {
      const r = await tx.standRequest.create({
        data: {
          standId: input.standId,
          projectId: input.projectId ?? null,
          kind: input.kind,
          model: input.kind === 'uninstall' ? null : (input.model ?? null),
          technicianId: input.technicianId,
          requestedById: me.id,
          requestedDate: parseDateOnly(input.requestedDate)!,
          note: input.note ?? null,
        },
        include: standCode,
      });
      await this.log(tx, me, 'stand_request', r.id, 'created', describe(r), null, r.projectId);
      return r;
    });
    await notifyUsers(
      db,
      [
        {
          userId: row.technicianId,
          projectId: null,
          kind: 'stand_request',
          title: `${me.displayName}: ${describe(row)} on ${dateOnly(row.requestedDate)}`,
          body: row.note,
          link: requestLink(row.id),
        },
      ],
      me.id,
    );
    return toRequestDTO(await this.loadRequest(row.id));
  }

  async accept(
    me: AuthUser,
    requestId: number,
    input: AcceptStandRequestInput,
  ): Promise<StandRequestDTO> {
    return this.transition(me, requestId, 'technician', ['requested'], (r) => ({
      status: 'accepted',
      scheduledDate: parseDateOnly(input.scheduledDate ?? dateOnly(r.requestedDate)!)!,
      ...(input.technicianNote !== undefined && { technicianNote: input.technicianNote }),
    }));
  }

  async reject(
    me: AuthUser,
    requestId: number,
    input: RejectStandRequestInput,
  ): Promise<StandRequestDTO> {
    return this.transition(me, requestId, 'technician', ['requested', 'accepted'], () => ({
      status: 'rejected',
      technicianNote: input.technicianNote,
    }));
  }

  /** Done: the stand now holds the requested model (install / replace) or is empty (uninstall). */
  async complete(
    me: AuthUser,
    requestId: number,
    input: CompleteStandRequestInput,
  ): Promise<StandRequestDTO> {
    return this.transition(
      me,
      requestId,
      'technician',
      ['requested', 'accepted'],
      (r) => ({
        status: 'done',
        doneAt: new Date(),
        scheduledDate: r.scheduledDate ?? parseDateOnly(this.today())!,
        ...(input.technicianNote !== undefined && { technicianNote: input.technicianNote }),
      }),
      async (tx, r) => {
        const model = r.kind === 'uninstall' ? null : r.model;
        await tx.stand.update({
          where: { id: r.standId },
          data: { currentModel: model, updatedById: me.id },
        });
      },
    );
  }

  async cancel(me: AuthUser, requestId: number): Promise<StandRequestDTO> {
    return this.transition(me, requestId, 'requester', ['requested', 'accepted'], () => ({
      status: 'cancelled',
    }));
  }

  /**
   * Moves a request on. `by` says who may: the assigned technician or the requester (and always an
   * administrator). The other side is notified.
   */
  private async transition(
    me: AuthUser,
    requestId: number,
    by: 'technician' | 'requester',
    from: StandRequestStatus[],
    change: (r: RequestCore) => Prisma.StandRequestUncheckedUpdateInput,
    after?: (tx: Db, r: RequestCore) => Promise<void>,
  ): Promise<StandRequestDTO> {
    const db = this.prisma.db;
    const updated = await db.$transaction(async (tx) => {
      const r = await tx.standRequest.findUnique({ where: { id: requestId }, include: standCode });
      if (!r) throw requestNotFound();
      const allowed =
        me.isAdmin || (by === 'technician' ? r.technicianId : r.requestedById) === me.id;
      if (!allowed) {
        throw forbidden(
          by === 'technician'
            ? 'Only the technician the request was sent to can do this'
            : 'Only the person who sent the request can cancel it',
        );
      }
      if (!from.includes(r.status)) {
        throw conflict('STAND_REQUEST_CLOSED', `The request is already ${r.status}`);
      }
      const next = await tx.standRequest.update({
        where: { id: requestId },
        data: change(r),
        include: standCode,
      });
      await after?.(tx, next);
      await this.log(
        tx,
        me,
        'stand_request',
        r.id,
        next.status,
        `${describe(next)}: ${next.status}`,
        null,
        r.projectId,
      );
      return next;
    });
    const to = by === 'technician' ? updated.requestedById : updated.technicianId;
    const when = dateOnly(updated.scheduledDate ?? updated.requestedDate);
    const verb: Record<StandRequestStatus, string> = {
      requested: 'sent',
      accepted: `accepted for ${when}`,
      rejected: 'rejected',
      done: 'done',
      cancelled: 'cancelled',
    };
    await notifyUsers(
      db,
      [
        {
          userId: to,
          projectId: null,
          kind: 'stand_request_update',
          title: `${describe(updated)} ${verb[updated.status]} by ${me.displayName}`,
          body: updated.technicianNote,
          link: requestLink(updated.id),
        },
      ],
      me.id,
    );
    return toRequestDTO(await this.loadRequest(updated.id));
  }

  // ---------------------------------------------------------------- import

  /** Applies (or previews) the stands read from the lab sheet: zones and stands by name/code. */
  async importSheet(
    me: AuthUser,
    sheet: { stands: SheetStand[]; warnings: string[] },
    apply: boolean,
  ): Promise<StandImportResultDTO> {
    this.assertManage(me);
    const db = this.prisma.db;
    const [zones, stands] = await Promise.all([
      db.standZone.findMany(),
      db.stand.findMany({ include: { zone: true } }),
    ]);
    const zoneByName = new Map(zones.map((z) => [z.name.toLowerCase(), z]));
    const standByCode = new Map(stands.map((s) => [s.code.toLowerCase(), s]));
    const rows: StandImportRow[] = sheet.stands.map((s) => {
      const existing = standByCode.get(s.code.toLowerCase());
      const action: StandImportRow['action'] = !existing
        ? 'create'
        : existing.zone.name.toLowerCase() !== s.zone.toLowerCase() ||
            existing.currentModel !== s.model ||
            existing.inCharge !== s.inCharge ||
            existing.note !== s.note
          ? 'update'
          : 'unchanged';
      return { ...s, action };
    });
    const newZones = [...new Set(rows.map((r) => r.zone))].filter(
      (z) => !zoneByName.has(z.toLowerCase()),
    );
    const result: StandImportResultDTO = {
      rows,
      zonesCreated: newZones.length,
      created: rows.filter((r) => r.action === 'create').length,
      updated: rows.filter((r) => r.action === 'update').length,
      unchanged: rows.filter((r) => r.action === 'unchanged').length,
      applied: false,
      warnings: sheet.warnings,
    };
    if (!apply || rows.length === 0) return result;

    await db.$transaction(async (tx) => {
      let zoneOrder = await nextZoneOrder(tx);
      // Zones in the order the sheet shows them.
      for (const name of newZones) {
        const z = await tx.standZone.create({ data: { name, sortOrder: zoneOrder } });
        zoneOrder += 10;
        zoneByName.set(name.toLowerCase(), z);
      }
      const orderIn = new Map<number, number>();
      for (const r of rows) {
        if (r.action === 'unchanged') continue;
        const zone = zoneByName.get(r.zone.toLowerCase())!;
        const data = {
          zoneId: zone.id,
          currentModel: r.model,
          inCharge: r.inCharge,
          note: r.note,
          updatedById: me.id,
        };
        const existing = standByCode.get(r.code.toLowerCase());
        if (existing) {
          await tx.stand.update({ where: { id: existing.id }, data });
        } else {
          const order = orderIn.get(zone.id) ?? (await nextStandOrder(tx, zone.id));
          orderIn.set(zone.id, order + 10);
          await tx.stand.create({ data: { ...data, code: r.code, sortOrder: order } });
        }
      }
      await this.log(
        tx,
        me,
        'stand',
        null,
        'imported',
        `Imported the stand sheet: ${result.created} new, ${result.updated} changed`,
      );
    });
    return { ...result, applied: true };
  }

  // ---------------------------------------------------------------- helpers

  private log(
    tx: Db,
    me: AuthUser,
    entityType: string,
    entityId: number | null,
    action: string,
    summary: string,
    data: Record<string, unknown> | null = null,
    projectId: number | null = null,
  ): Promise<void> {
    return this.activity.log(tx, {
      projectId,
      userId: me.id,
      entityType,
      entityId,
      action,
      summary,
      data,
    });
  }
}

const open = (s: StandRequestStatus) => s === 'requested' || s === 'accepted';

function describe(r: Pick<RequestCore, 'kind' | 'model' | 'stand'>): string {
  const what = STAND_REQUEST_KIND_LABELS[r.kind];
  return r.model ? `${what} ${r.model} at ${r.stand.code}` : `${what} at ${r.stand.code}`;
}

function matchesModel(s: StandDTO, bookings: BookingRow[], needle: string): boolean {
  return (
    s.code.toLowerCase().includes(needle) ||
    (s.currentModel?.toLowerCase().includes(needle) ?? false) ||
    bookings.some((b) => b.model.toLowerCase().includes(needle))
  );
}

/** Serializes bookings of one stand so two overlapping bookings cannot both pass the check. */
async function lockStand(tx: Db, standId: number): Promise<void> {
  await tx.$queryRaw`SELECT id FROM stands WHERE id = ${standId} FOR UPDATE`;
}

async function nextZoneOrder(tx: Db): Promise<number> {
  const max = await tx.standZone.aggregate({ _max: { sortOrder: true } });
  return (max._max.sortOrder ?? 0) + 10;
}

async function nextStandOrder(tx: Db, zoneId: number): Promise<number> {
  const max = await tx.stand.aggregate({ where: { zoneId }, _max: { sortOrder: true } });
  return (max._max.sortOrder ?? 0) + 10;
}

const zoneTaken = (name: string) =>
  conflict('STAND_ZONE_NAME_TAKEN', `A zone named ${name} already exists`);
const standTaken = (code: string) =>
  conflict('STAND_CODE_TAKEN', `A stand with the code ${code} already exists`);
