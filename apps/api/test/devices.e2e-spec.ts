/**
 * Test device registry: register, edit, repair, take and return a device, who may do what, and
 * that two people taking the same device do not both get it.
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type { DeviceDTO } from '@tmt/shared';
import {
  createProject,
  createTestApp,
  createUser,
  errorCode,
  expectBody,
  login,
  type Client,
  type TestApp,
} from './helpers.js';

let t: TestApp;
let lead: Client;
let tom: Client;
let ann: Client;
let viewer: Client;
let outsider: Client;
let P: string;
let tomId: number;

const list = async (client: Client, query = '') =>
  expectBody<DeviceDTO[]>(await client.get(`${P}/devices${query}`), 200);
const add = async (body: Record<string, unknown>) =>
  expectBody<DeviceDTO>(await tom.post(`${P}/devices`, body), 201);

beforeAll(async () => {
  t = await createTestApp();
  const l = await createUser(t.prisma, 'lead');
  const a = await createUser(t.prisma, 'tom');
  const b = await createUser(t.prisma, 'ann');
  const v = await createUser(t.prisma, 'viewer');
  await createUser(t.prisma, 'outsider');
  tomId = a.id;
  const projectId = (
    await createProject(t.prisma, 'DEV', [
      { userId: l.id, role: 'lead' },
      { userId: a.id, role: 'tester' },
      { userId: b.id, role: 'tester' },
      { userId: v.id, role: 'viewer' },
    ])
  ).id;
  P = `/projects/${projectId}`;
  lead = await login(t, 'lead');
  tom = await login(t, 'tom');
  ann = await login(t, 'ann');
  viewer = await login(t, 'viewer');
  outsider = await login(t, 'outsider');
});
afterAll(() => t.close());

describe('devices', () => {
  let unit: DeviceDTO;
  let phone: DeviceDTO;

  it('lets a tester register devices and trims the text', async () => {
    unit = await add({
      kind: 'unit',
      name: '  Unit A ',
      model: 'FTKM',
      serial: 'SN-001',
      osVersion: 'FW 2.0.1',
    });
    expect(unit).toMatchObject({
      kind: 'unit',
      name: 'Unit A',
      model: 'FTKM',
      status: 'available',
      holder: null,
      heldSince: null,
    });
    phone = await add({ kind: 'phone', name: 'Pixel 9', osVersion: 'Android 15', note: '' });
    expect(phone.note).toBeNull();
    // Ordered by kind (unit, phone …), then name.
    expect((await list(viewer)).map((d) => d.name)).toEqual(['Unit A', 'Pixel 9']);
  });

  it('refuses a second device with the same name and invalid input', async () => {
    const dup = await tom.post(`${P}/devices`, { kind: 'phone', name: 'Unit A' });
    expect(dup.status).toBe(409);
    expect(errorCode(dup)).toBe('DEVICE_NAME_TAKEN');
    expect((await tom.post(`${P}/devices`, { kind: 'toaster', name: 'x' })).status).toBe(400);
    expect((await tom.post(`${P}/devices`, { kind: 'unit', name: '  ' })).status).toBe(400);
    expect((await tom.patch(`${P}/devices/${unit.id}`, {})).status).toBe(400);
  });

  it('filters by kind, status, text and holder', async () => {
    expect((await list(viewer, '?kind=phone')).map((d) => d.name)).toEqual(['Pixel 9']);
    expect((await list(viewer, '?q=sn-001')).map((d) => d.name)).toEqual(['Unit A']);
    expect(await list(viewer, '?status=repair')).toEqual([]);
    expect(await list(tom, '?mine=true')).toEqual([]);
  });

  it('only testers and leads change the registry; outsiders see nothing', async () => {
    expect((await viewer.post(`${P}/devices`, { kind: 'unit', name: 'V' })).status).toBe(403);
    expect((await viewer.post(`${P}/devices/${unit.id}/check-out`)).status).toBe(403);
    expect((await outsider.get(`${P}/devices`)).status).toBe(404);
    expect((await tom.delete(`${P}/devices/${unit.id}`)).status).toBe(403);
  });

  it('check-out makes the caller the holder; a second taker is refused', async () => {
    const taken = expectBody<DeviceDTO>(await tom.post(`${P}/devices/${unit.id}/check-out`), 200);
    expect(taken).toMatchObject({ status: 'in_use', holder: { id: tomId } });
    expect(taken.heldSince).not.toBeNull();
    const second = await ann.post(`${P}/devices/${unit.id}/check-out`);
    expect(second.status).toBe(409);
    expect(errorCode(second)).toBe('DEVICE_NOT_AVAILABLE');
    expect((await list(tom, '?mine=true')).map((d) => d.name)).toEqual(['Unit A']);
    expect((await list(viewer, '?q=tom')).map((d) => d.name)).toEqual(['Unit A']);
    expect((await list(viewer, '?status=in_use')).map((d) => d.name)).toEqual(['Unit A']);
  });

  it('two people taking the same free device at once: exactly one gets it', async () => {
    const [a, b] = await Promise.all([
      tom.post(`${P}/devices/${phone.id}/check-out`),
      ann.post(`${P}/devices/${phone.id}/check-out`),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    await lead.post(`${P}/devices/${phone.id}/return`);
  });

  it('a held device cannot go to repair; only the holder or a lead returns it', async () => {
    const repair = await tom.patch(`${P}/devices/${unit.id}`, { status: 'repair' });
    expect(repair.status).toBe(409);
    expect(errorCode(repair)).toBe('DEVICE_IN_USE');
    const other = await ann.post(`${P}/devices/${unit.id}/return`);
    expect(other.status).toBe(403);
    expect(errorCode(other)).toBe('NOT_DEVICE_HOLDER');
    // Editing the text of a held device keeps the holder.
    const edited = expectBody<DeviceDTO>(
      await tom.patch(`${P}/devices/${unit.id}`, { osVersion: 'FW 2.1.0', status: 'available' }),
      200,
    );
    expect(edited).toMatchObject({
      osVersion: 'FW 2.1.0',
      status: 'in_use',
      holder: { id: tomId },
    });
    const back = expectBody<DeviceDTO>(await tom.post(`${P}/devices/${unit.id}/return`), 200);
    expect(back).toMatchObject({ status: 'available', holder: null, heldSince: null });
    const again = await tom.post(`${P}/devices/${unit.id}/return`);
    expect(again.status).toBe(409);
    expect(errorCode(again)).toBe('DEVICE_NOT_IN_USE');
  });

  it('a lead can return a device for someone else', async () => {
    await ann.post(`${P}/devices/${unit.id}/check-out`);
    const back = expectBody<DeviceDTO>(await lead.post(`${P}/devices/${unit.id}/return`), 200);
    expect(back.holder).toBeNull();
  });

  it('a device in repair cannot be taken until it is back', async () => {
    const down = expectBody<DeviceDTO>(
      await tom.patch(`${P}/devices/${unit.id}`, { status: 'repair' }),
      200,
    );
    expect(down.status).toBe('repair');
    const take = await tom.post(`${P}/devices/${unit.id}/check-out`);
    expect(take.status).toBe(409);
    expect(errorCode(take)).toBe('DEVICE_NOT_AVAILABLE');
    const up = expectBody<DeviceDTO>(
      await tom.patch(`${P}/devices/${unit.id}`, { status: 'available' }),
      200,
    );
    expect(up.status).toBe('available');
  });

  it('renaming onto an existing name is refused; a missing device is 404', async () => {
    const res = await tom.patch(`${P}/devices/${unit.id}`, { name: 'Pixel 9' });
    expect(res.status).toBe(409);
    expect(errorCode(res)).toBe('DEVICE_NAME_TAKEN');
    const missing = await tom.post(`${P}/devices/99999/check-out`);
    expect(missing.status).toBe(404);
    expect(errorCode(missing)).toBe('DEVICE_NOT_FOUND');
  });

  it('only a lead deletes a device, and the change shows in the activity log', async () => {
    expect((await lead.delete(`${P}/devices/${phone.id}`)).status).toBe(204);
    expect((await list(viewer)).map((d) => d.name)).toEqual(['Unit A']);
    const log = await t.prisma.db.activityLog.findMany({ where: { entityType: 'device' } });
    expect(log.map((l) => l.action)).toEqual(
      expect.arrayContaining(['created', 'checked_out', 'returned', 'updated', 'deleted']),
    );
  });
});
