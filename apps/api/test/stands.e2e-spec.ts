/**
 * Test stands of the lab: technician-only accounts, layout kept by technicians, bookings with
 * overlap checks, install / uninstall requests with notifications both ways, and the sheet import.
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { ExcelJS } from '@tmt/excel';
import type {
  NotificationListDTO,
  StandEventDTO,
  TechnicianWorkDTO,
  StandBoardDTO,
  StandBookingDTO,
  StandDTO,
  StandImportResultDTO,
  StandRequestDTO,
  StandZoneDTO,
} from '@tmt/shared';
import {
  createProject,
  createTestApp,
  createUser,
  errorCode,
  expectBody,
  login,
  upload,
  type Client,
  type TestApp,
} from './helpers.js';

let t: TestApp;
let admin: Client;
let tech: Client;
let tom: Client;
let ann: Client;
let viewer: Client;
let techId: number;
let otherTechId: number;
let projectId: number;
let P: string;

/** A day relative to today (UTC is fine: the tests use days far from the edges). */
const day = (offset: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

beforeAll(async () => {
  t = await createTestApp();
  await createUser(t.prisma, 'root', { isAdmin: true });
  techId = (await createUser(t.prisma, 'tech', { isTechnician: true })).id;
  otherTechId = (await createUser(t.prisma, 'tech2', { isTechnician: true })).id;
  const tomU = await createUser(t.prisma, 'tom');
  const annU = await createUser(t.prisma, 'ann');
  const viewerU = await createUser(t.prisma, 'viewer');
  projectId = (
    await createProject(t.prisma, 'STD', [
      { userId: tomU.id, role: 'lead' },
      { userId: annU.id, role: 'tester' },
      { userId: viewerU.id, role: 'viewer' },
    ])
  ).id;
  P = `/projects/${projectId}`;
  admin = await login(t, 'root');
  tech = await login(t, 'tech');
  tom = await login(t, 'tom');
  ann = await login(t, 'ann');
  viewer = await login(t, 'viewer');
});
afterAll(() => t.close());

describe('technician accounts', () => {
  it('see the stands but nothing of projects or test cases', async () => {
    expect((await tech.get('/stands')).status).toBe(200);
    expect((await tech.get('/auth/me')).status).toBe(200);
    expect((await tech.get('/notifications')).status).toBe(200);
    for (const url of [
      '/projects',
      `${P}/plans`,
      `${P}/defects`,
      `${P}/dashboard`,
      `${P}/my-work`,
      '/users/lookup',
      '/users',
    ]) {
      const res = await tech.get(url);
      expect([url, res.status]).toEqual([url, 403]);
      expect(errorCode(res)).toBe('TECHNICIAN_NOT_ALLOWED');
    }
  });

  it('cannot be project members, nor admins at the same time', async () => {
    const lead = (await t.prisma.db.user.findUniqueOrThrow({ where: { username: 'tom' } })).id;
    const res = await admin.put(`${P}/members`, {
      members: [
        { userId: lead, role: 'lead' },
        { userId: techId, role: 'tester' },
      ],
    });
    expect(res.status).toBe(422);
    expect(errorCode(res)).toBe('TECHNICIAN_NOT_MEMBER');
    const both = await admin.patch(`/users/${techId}`, { isAdmin: true });
    expect(errorCode(both)).toBe('ADMIN_TECHNICIAN');
    const annId = (await t.prisma.db.user.findUniqueOrThrow({ where: { username: 'ann' } })).id;
    const member = await admin.patch(`/users/${annId}`, { isTechnician: true });
    expect(errorCode(member)).toBe('USER_HAS_PROJECTS');
  });

  it('are created and listed by the admin', async () => {
    const created = expectBody<{ isTechnician: boolean }>(
      await admin.post('/users', {
        username: 'tech3',
        displayName: 'Tech Three',
        password: 'Initial123',
        isTechnician: true,
      }),
      201,
    );
    expect(created.isTechnician).toBe(true);
    const techs = expectBody<{ username: string }[]>(await ann.get('/stands/technicians'), 200);
    expect(techs.map((u) => u.username).sort()).toEqual(['tech', 'tech2', 'tech3']);
  });
});

describe('layout', () => {
  let zone: StandZoneDTO;
  let stand: StandDTO;

  it('technicians and admins keep zones and stands; testers cannot', async () => {
    zone = expectBody<StandZoneDTO>(await tech.post('/stands/zones', { name: 'Zone East' }), 201);
    expect((await ann.post('/stands/zones', { name: 'Zone X' })).status).toBe(403);
    expect(errorCode(await admin.post('/stands/zones', { name: 'Zone East' }))).toBe(
      'STAND_ZONE_NAME_TAKEN',
    );
    stand = expectBody<StandDTO>(
      await tech.post('/stands', { zoneId: zone.id, code: 'E-1', currentModel: 'ACU-25' }),
      201,
    );
    expectBody<StandDTO>(await tech.post('/stands', { zoneId: zone.id, code: 'E-2' }), 201);
    expect(errorCode(await tech.post('/stands', { zoneId: zone.id, code: 'E-1' }))).toBe(
      'STAND_CODE_TAKEN',
    );
    expect((await ann.patch(`/stands/${stand.id}`, { currentModel: 'X' })).status).toBe(403);
    const changed = expectBody<StandDTO>(
      await tech.patch(`/stands/${stand.id}`, { currentModel: 'ACU-35', inCharge: 'Ann' }),
      200,
    );
    expect(changed).toMatchObject({ currentModel: 'ACU-35', inCharge: 'Ann' });
    expect(changed.updatedBy?.username).toBe('tech');
    expect(errorCode(await tech.delete(`/stands/zones/${zone.id}`))).toBe('STAND_ZONE_NOT_EMPTY');
  });

  it('the board finds where a model is', async () => {
    const all = expectBody<StandBoardDTO>(await viewer.get('/stands'), 200);
    expect(all.zones.find((z) => z.name === 'Zone East')?.stands.map((s) => s.code)).toEqual([
      'E-1',
      'E-2',
    ]);
    expect(all).toMatchObject({ canManage: false, canRequest: false });
    expect(expectBody<StandBoardDTO>(await ann.get('/stands'), 200).canRequest).toBe(true);
    expect(expectBody<StandBoardDTO>(await tech.get('/stands'), 200)).toMatchObject({
      canManage: true,
      canRequest: false,
    });
    const found = expectBody<StandBoardDTO>(await ann.get('/stands?model=acu-35'), 200);
    expect(found.zones.flatMap((z) => z.stands.map((s) => s.code))).toEqual(['E-1']);
  });
});

describe('bookings', () => {
  let standId: number;
  let first: StandBookingDTO;

  beforeAll(async () => {
    const board = expectBody<StandBoardDTO>(await ann.get('/stands'), 200);
    standId = board.zones.flatMap((z) => z.stands).find((s) => s.code === 'E-2')!.id;
  });

  it('a tester books a stand for the project; overlapping days are refused', async () => {
    first = expectBody<StandBookingDTO>(
      await ann.post('/stands/bookings', {
        standId,
        projectId,
        model: 'ACU-50',
        startDate: day(0),
        endDate: day(6),
      }),
      201,
    );
    expect(first).toMatchObject({ standCode: 'E-2', project: { key: 'STD' } });
    const clash = await tom.post('/stands/bookings', {
      standId,
      projectId,
      model: 'ACU-60',
      startDate: day(6),
      endDate: day(9),
    });
    expect(clash.status).toBe(409);
    expect(errorCode(clash)).toBe('STAND_BOOKED');
    expect(clash.body.error.details.booking.id).toBe(first.id);
    expectBody<StandBookingDTO>(
      await tom.post('/stands/bookings', {
        standId,
        projectId,
        model: 'ACU-60',
        startDate: day(7),
        endDate: day(9),
      }),
      201,
    );
  });

  it('viewers, technicians and outsiders cannot book', async () => {
    const body = { standId, projectId, model: 'M', startDate: day(20), endDate: day(21) };
    expect((await viewer.post('/stands/bookings', body)).status).toBe(403);
    expect(errorCode(await tech.post('/stands/bookings', body))).toBe('TECHNICIAN_NOT_ALLOWED');
    await createUser(t.prisma, 'stranger');
    const stranger = await login(t, 'stranger');
    expect(errorCode(await stranger.post('/stands/bookings', body))).toBe('PROJECT_NOT_FOUND');
    const backwards = await ann.post('/stands/bookings', { ...body, endDate: day(19) });
    expect(backwards.status).toBe(400);
  });

  it('shows today on the board and lists the timeline', async () => {
    const stand = expectBody<StandDTO>(await viewer.get(`/stands/${standId}`), 200);
    expect(stand.currentBooking?.id).toBe(first.id);
    expect(stand.nextBooking?.model).toBe('ACU-60');
    const list = expectBody<StandBookingDTO[]>(
      await viewer.get(`/stands/bookings?from=${day(8)}&to=${day(30)}`),
      200,
    );
    expect(list.map((b) => b.model)).toEqual(['ACU-60']);
  });

  it('only who booked, a project lead or an admin changes or cancels a booking', async () => {
    expect((await viewer.delete(`/stands/bookings/${first.id}`)).status).toBe(403);
    const moved = expectBody<StandBookingDTO>(
      await tom.patch(`/stands/bookings/${first.id}`, { endDate: day(3) }),
      200,
    );
    expect(moved.endDate).toBe(day(3));
    expect(errorCode(await ann.patch(`/stands/bookings/${first.id}`, { endDate: day(8) }))).toBe(
      'STAND_BOOKED',
    );
    expect((await ann.delete(`/stands/bookings/${first.id}`)).status).toBe(204);
  });
});

describe('requests', () => {
  let standId: number;
  let req: StandRequestDTO;

  const unread = async (client: Client) =>
    expectBody<NotificationListDTO>(await client.get('/notifications'), 200);

  beforeAll(async () => {
    const board = expectBody<StandBoardDTO>(await ann.get('/stands'), 200);
    standId = board.zones.flatMap((z) => z.stands).find((s) => s.code === 'E-1')!.id;
  });

  it('a tester asks a technician to replace the unit; the technician is notified', async () => {
    req = expectBody<StandRequestDTO>(
      await ann.post('/stands/requests', {
        standId,
        projectId,
        kind: 'replace',
        model: 'ACU-71',
        technicianId: techId,
        requestedDate: day(2),
        note: 'Before the energy test',
      }),
      201,
    );
    expect(req).toMatchObject({ status: 'requested', standCode: 'E-1', zoneName: 'Zone East' });
    const n = await unread(tech);
    expect(n.unread).toBe(1);
    expect(n.items[0]).toMatchObject({
      kind: 'stand_request',
      link: expect.stringContaining(`${req.id}`),
    });
    // Inside the project, the requester's bell shows lab-wide ones too.
    expect(expectBody<NotificationListDTO>(await ann.get(`${P}/notifications`), 200).unread).toBe(
      0,
    );
  });

  it('checks the technician, the model and who may send', async () => {
    const base = { standId, kind: 'install', model: 'M', requestedDate: day(1) };
    expect(
      errorCode(await ann.post('/stands/requests', { ...base, technicianId: techId + 1000 })),
    ).toBe('NOT_A_TECHNICIAN');
    const annId = (await t.prisma.db.user.findUniqueOrThrow({ where: { username: 'ann' } })).id;
    expect(errorCode(await ann.post('/stands/requests', { ...base, technicianId: annId }))).toBe(
      'NOT_A_TECHNICIAN',
    );
    const noModel = await ann.post('/stands/requests', {
      ...base,
      model: '',
      technicianId: techId,
    });
    expect(noModel.status).toBe(400);
    expect((await viewer.post('/stands/requests', { ...base, technicianId: techId })).status).toBe(
      403,
    );
    expect(errorCode(await tech.post('/stands/requests', { ...base, technicianId: techId }))).toBe(
      'TECHNICIAN_NOT_ALLOWED',
    );
  });

  it('only the assigned technician acts; accept on another day notifies the requester', async () => {
    const other = await login(t, 'tech2');
    expect((await other.post(`/stands/requests/${req.id}/accept`, {})).status).toBe(403);
    expect((await ann.post(`/stands/requests/${req.id}/accept`, {})).status).toBe(403);
    const accepted = expectBody<StandRequestDTO>(
      await tech.post(`/stands/requests/${req.id}/accept`, { scheduledDate: day(3) }),
      200,
    );
    expect(accepted).toMatchObject({ status: 'accepted', scheduledDate: day(3) });
    const n = await unread(ann);
    expect(n.items[0]).toMatchObject({ kind: 'stand_request_update' });
    expect(n.items[0]!.title).toContain(`accepted for ${day(3)}`);
    // Both sides see it in "mine"; tech2 does not.
    expect(expectBody<StandRequestDTO[]>(await tech.get('/stands/requests'), 200)).toHaveLength(1);
    expect(expectBody<StandRequestDTO[]>(await ann.get('/stands/requests'), 200)).toHaveLength(1);
    expect(expectBody<StandRequestDTO[]>(await other.get('/stands/requests'), 200)).toHaveLength(0);
    expect(
      expectBody<StandRequestDTO[]>(await other.get('/stands/requests?scope=all&status=open'), 200),
    ).toHaveLength(1);
    void otherTechId;
  });

  it('done puts the new model on the stand', async () => {
    const done = expectBody<StandRequestDTO>(
      await tech.post(`/stands/requests/${req.id}/done`, { technicianNote: 'Installed' }),
      200,
    );
    expect(done.status).toBe('done');
    expect(done.doneAt).not.toBeNull();
    const stand = expectBody<StandDTO>(await ann.get(`/stands/${standId}`), 200);
    expect(stand).toMatchObject({ currentModel: 'ACU-71', openRequests: 0 });
    expect(stand.updatedBy?.username).toBe('tech');
    expect(
      errorCode(await tech.post(`/stands/requests/${req.id}/reject`, { technicianNote: 'x' })),
    ).toBe('STAND_REQUEST_CLOSED');
  });

  it('uninstall empties the stand; reject needs a reason; the requester may cancel', async () => {
    const un = expectBody<StandRequestDTO>(
      await ann.post('/stands/requests', {
        standId,
        kind: 'uninstall',
        technicianId: techId,
        requestedDate: day(4),
      }),
      201,
    );
    expect(un.project).toBeNull();
    expectBody(await tech.post(`/stands/requests/${un.id}/done`, {}), 200);
    expect(expectBody<StandDTO>(await ann.get(`/stands/${standId}`), 200).currentModel).toBeNull();

    const r2 = expectBody<StandRequestDTO>(
      await tom.post('/stands/requests', {
        standId,
        projectId,
        kind: 'install',
        model: 'ACU-25',
        technicianId: techId,
        requestedDate: day(5),
      }),
      201,
    );
    expect((await tech.post(`/stands/requests/${r2.id}/reject`, {})).status).toBe(400);
    expect((await ann.post(`/stands/requests/${r2.id}/cancel`)).status).toBe(403);
    const cancelled = expectBody<StandRequestDTO>(
      await tom.post(`/stands/requests/${r2.id}/cancel`),
      200,
    );
    expect(cancelled.status).toBe('cancelled');
    const n = await unread(tech);
    expect(n.items[0]!.title).toContain('cancelled');
    expect((await tech.post('/notifications/read-all')).status).toBe(204);
    expect((await unread(tech)).unread).toBe(0);
  });
});

describe('import of the lab sheet', () => {
  async function sheet(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Stand');
    ws.getCell('C3').value = 'Zone East';
    ws.getCell('J3').value = 'Zone West';
    const put = (row: number, col: number, values: string[]) =>
      values.forEach((v, i) => {
        if (v) ws.getCell(row + i, col).value = v;
      });
    put(4, 2, ['Stand No.', 'Model Name', 'In charge', 'Request', 'Replace', 'Target']);
    put(4, 3, ['E-1', 'ACU-35', 'Ann', 'Stay']);
    put(4, 5, ['E-3', 'IoT']);
    put(4, 9, ['Stand No.', 'Model Name', 'In charge', 'Request', 'Replace', 'Target']);
    put(4, 10, ['W-1', 'ACU-50', 'Tom']);
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  it('previews, then applies: new zones and stands, changed stands updated', async () => {
    const file = { name: 'stands.xlsx', content: await sheet() };
    expect((await upload(t, ann, '/stands/import', { file })).status).toBe(403);
    const preview = expectBody<StandImportResultDTO>(
      await upload(t, tech, '/stands/import', { file }),
      200,
    );
    expect(preview).toMatchObject({ applied: false, zonesCreated: 1, created: 2, updated: 1 });
    expect(preview.rows.find((r) => r.code === 'E-1')).toMatchObject({
      action: 'update',
      model: 'ACU-35',
      note: 'Request: Stay',
    });
    const before = expectBody<StandBoardDTO>(await ann.get('/stands'), 200);
    expect(before.zones.map((z) => z.name)).not.toContain('Zone West');

    const applied = expectBody<StandImportResultDTO>(
      await upload(t, admin, '/stands/import', { file, fields: { dryRun: 'false' } }),
      200,
    );
    expect(applied.applied).toBe(true);
    const after = expectBody<StandBoardDTO>(await ann.get('/stands'), 200);
    const east = after.zones.find((z) => z.name === 'Zone East')!;
    expect(east.stands.map((s) => [s.code, s.currentModel])).toEqual([
      ['E-1', 'ACU-35'],
      ['E-2', null],
      ['E-3', 'IoT'],
    ]);
    expect(after.zones.find((z) => z.name === 'Zone West')?.stands[0]).toMatchObject({
      code: 'W-1',
      inCharge: 'Tom',
    });
    // The same file again changes nothing.
    const again = expectBody<StandImportResultDTO>(
      await upload(t, admin, '/stands/import', { file }),
      200,
    );
    expect(again).toMatchObject({ created: 0, updated: 0, unchanged: 3 });
  });

  it('refuses files that are not workbooks', async () => {
    const bad = await upload(t, tech, '/stands/import', {
      file: { name: 'stands.xlsx', content: 'not excel' },
    });
    expect(errorCode(bad)).toBe('INVALID_WORKBOOK');
    const csv = await upload(t, tech, '/stands/import', {
      file: { name: 'stands.csv', content: 'a,b' },
    });
    expect(errorCode(csv)).toBe('UNSUPPORTED_FILE_TYPE');
  });
});

describe('hourly bookings and who tests', () => {
  let standId: number;
  let annId: number;

  beforeAll(async () => {
    const board = expectBody<StandBoardDTO>(await ann.get('/stands'), 200);
    standId = board.zones.flatMap((z) => z.stands).find((s) => s.code === 'E-3')!.id;
    annId = (await t.prisma.db.user.findUniqueOrThrow({ where: { username: 'ann' } })).id;
  });

  it('books hours; touching hours are free, overlapping minutes are not', async () => {
    const day = '2030-03-04';
    const morning = expectBody<StandBookingDTO>(
      await tom.post('/stands/bookings', {
        standId,
        projectId,
        model: 'ACU-25',
        startDate: day,
        endDate: day,
        startTime: '09:00',
        endTime: '12:00',
        testerId: annId,
      }),
      201,
    );
    expect(morning).toMatchObject({ startTime: '09:00', endTime: '12:00' });
    expect(morning.tester?.username).toBe('ann');
    expect(morning.createdBy.username).toBe('tom');
    const afternoon = await ann.post('/stands/bookings', {
      standId,
      projectId,
      model: 'ACU-35',
      startDate: day,
      endDate: day,
      startTime: '12:00',
      endTime: '17:00',
    });
    expect(afternoon.status).toBe(201);
    expect(afternoon.body.tester.username).toBe('ann');
    const clash = await ann.post('/stands/bookings', {
      standId,
      projectId,
      model: 'ACU-50',
      startDate: day,
      endDate: day,
      startTime: '11:59',
      endTime: '12:30',
    });
    expect(errorCode(clash)).toBe('STAND_BOOKED');
    expect(clash.body.error.message).toContain('09:00');
    // A whole-day booking of that day clashes too.
    expect(
      errorCode(
        await ann.post('/stands/bookings', {
          standId,
          projectId,
          model: 'ACU-50',
          startDate: day,
          endDate: day,
        }),
      ),
    ).toBe('STAND_BOOKED');
  });

  it('checks the times and the tester', async () => {
    const base = { standId, projectId, model: 'M', startDate: '2030-03-05', endDate: '2030-03-05' };
    expect((await ann.post('/stands/bookings', { ...base, startTime: '10:00' })).status).toBe(400);
    expect(
      (await ann.post('/stands/bookings', { ...base, startTime: '10:00', endTime: '09:00' }))
        .status,
    ).toBe(400);
    expect(
      (await ann.post('/stands/bookings', { ...base, startTime: '9:00', endTime: '10:00' })).status,
    ).toBe(400);
    expect(errorCode(await ann.post('/stands/bookings', { ...base, testerId: techId }))).toBe(
      'BAD_TESTER',
    );
  });
});

describe('history', () => {
  it('records installs and removals with project and who, from requests, hand edits and imports', async () => {
    const events = expectBody<StandEventDTO[]>(await viewer.get('/stands/events'), 200);
    const byRequest = events.filter((e) => e.source === 'request');
    expect(byRequest.map((e) => [e.kind, e.modelBefore, e.modelAfter])).toEqual([
      ['uninstall', 'ACU-71', null],
      ['replace', 'ACU-35', 'ACU-71'],
    ]);
    expect(byRequest[1]).toMatchObject({
      standCode: 'E-1',
      zoneName: 'Zone East',
      project: { key: 'STD' },
      actor: { username: 'tech' },
      note: 'Installed',
    });
    expect(events.some((e) => e.source === 'manual' && e.modelAfter === 'ACU-35')).toBe(true);
    expect(events.some((e) => e.source === 'import' && e.standCode === 'E-3')).toBe(true);
    const found = expectBody<StandEventDTO[]>(await ann.get('/stands/events?q=acu-71'), 200);
    expect(found.length).toBeGreaterThanOrEqual(2);
    expect(found.every((e) => [e.modelBefore, e.modelAfter].includes('ACU-71'))).toBe(true);
    const bookings = expectBody<StandBookingDTO[]>(
      await ann.get('/stands/bookings?from=2000-01-01&to=2100-01-01&q=acu-25'),
      200,
    );
    expect(bookings.every((b) => b.model === 'ACU-25')).toBe(true);
  });

  it("sums up a technician's year", async () => {
    const year = new Date().getFullYear();
    const work = expectBody<TechnicianWorkDTO>(
      await tech.get(`/stands/work?technicianId=${techId}&year=${year}`),
      200,
    );
    expect(work.totals).toMatchObject({ install: 0, uninstall: 1, replace: 1, rejected: 0 });
    expect(work.totals.manual).toBeGreaterThanOrEqual(2);
    expect(work.months.reduce((n, m) => n + m.uninstall + m.replace, 0)).toBe(2);
    expect(work.requests.map((r) => r.status)).toEqual(['done', 'done']);
    const last = expectBody<TechnicianWorkDTO>(
      await tech.get(`/stands/work?technicianId=${techId}&year=${year - 1}`),
      200,
    );
    expect(last.requests).toEqual([]);
  });

  it('stores notifications as messages to show in Thai', async () => {
    const n = expectBody<NotificationListDTO>(await ann.get('/notifications'), 200);
    const done = n.items.find((i) => i.title.startsWith('Replace ACU-71 at E-1 done by'))!;
    expect(done.message?.title).toMatchObject({
      key: 'stand_done',
      vars: { actor: 'Tech', what: { key: 'stand_what_replace', vars: { model: 'ACU-71' } } },
    });
  });
});
