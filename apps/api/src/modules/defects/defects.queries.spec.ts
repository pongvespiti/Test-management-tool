import { describe, expect, it } from '@jest/globals';
import { attachmentRow, defectRow } from '../../../test/unit/fixtures.js';
import { createPrismaMock } from '../../../test/unit/prisma-mock.js';
import {
  buildDefectDTO,
  buildDefectListItems,
  defectRefsByRunCase,
  getDefectInProject,
  linkSummaryOf,
  loadDefectLinks,
  toDefectRef,
} from './defects.queries.js';

const link = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  defectId: 30,
  runCaseId: 50,
  testCaseId: 100,
  runCase: {
    displayId: 'MBS-036',
    code: 'TC-1',
    title: 'Power ON',
    status: 'ng',
    run: { id: 3, code: 'Test ID 1', plan: { id: 7, docNo: '26TR-TEAM-10-001' } },
  },
  ...overrides,
});

describe('defect queries', () => {
  it('maps refs with the BUG key', () => {
    expect(toDefectRef(defectRow())).toEqual({
      id: 30,
      key: 'BUG-12',
      title: 'App shows wrong temperature',
      status: 'new',
      severity: 'major',
    });
  });

  it('finds defects only inside the project', async () => {
    const { db } = createPrismaMock();
    db.defect.findFirst.mockResolvedValue(null);
    await expect(getDefectInProject(db, 10, 30)).rejects.toMatchObject({
      code: 'DEFECT_NOT_FOUND',
    });
    expect(db.defect.findFirst).toHaveBeenCalledWith({ where: { id: 30, projectId: 10 } });
  });

  it('groups linked defects by run case', async () => {
    const { db } = createPrismaMock();
    await expect(defectRefsByRunCase(db, [])).resolves.toEqual(new Map());
    db.defectLink.findMany.mockResolvedValue([
      { runCaseId: 50, defect: defectRow({ id: 31, seq: 13 }) },
      { runCaseId: 50, defect: defectRow() },
      { runCaseId: null, defect: defectRow({ id: 40 }) },
    ] as never);
    const map = await defectRefsByRunCase(db, [50]);
    expect(map.get(50)?.map((d) => d.key)).toEqual(['BUG-13', 'BUG-12']);
    expect(map.size).toBe(1);
  });

  it('loads link details including the plan and run of the result', async () => {
    const { db } = createPrismaMock();
    db.defectLink.findMany.mockResolvedValue([
      link(),
      link({ id: 2, runCaseId: null, runCase: null }),
    ] as never);
    const links = (await loadDefectLinks(db, [30])).get(30)!;
    expect(links[0]).toEqual({
      id: 1,
      runCaseId: 50,
      testCaseId: 100,
      runId: 3,
      runCode: 'Test ID 1',
      planId: 7,
      planDocNo: '26TR-TEAM-10-001',
      caseDisplayId: 'MBS-036',
      caseCode: 'TC-1',
      caseTitle: 'Power ON',
      resultStatus: 'ng',
    });
    expect(links[1]).toMatchObject({ runId: null, planDocNo: null, caseTitle: null });
    expect(linkSummaryOf(links)).toBe('MBS-036 · Test ID 1 · 26TR-TEAM-10-001 (+1)');
    expect(linkSummaryOf([links[1]!])).toBe('Linked result');
    expect(linkSummaryOf([])).toBeNull();
  });

  it('builds list items and full DTOs with users, release, links and attachments', async () => {
    const { db } = createPrismaMock();
    db.user.findMany.mockResolvedValue([
      { id: 1, username: 'alice', displayName: 'Alice' },
    ] as never);
    db.release.findMany.mockResolvedValue([{ id: 5, name: 'FW 2.4.0' }] as never);
    db.defectLink.findMany.mockResolvedValue([link()] as never);
    db.attachment.findMany.mockResolvedValue([attachmentRow()]);

    const d = defectRow({ assigneeId: 1, releaseId: 5, status: 'open' });
    const [item] = await buildDefectListItems(db, [d]);
    expect(item).toMatchObject({
      key: 'BUG-12',
      assignee: { id: 1, username: 'alice' },
      release: { id: 5, name: 'FW 2.4.0' },
      linkSummary: 'MBS-036 · Test ID 1 · 26TR-TEAM-10-001',
    });
    await expect(buildDefectListItems(db, [])).resolves.toEqual([]);

    const dto = await buildDefectDTO(db, d);
    expect(dto.reporter).toMatchObject({ id: 1 });
    expect(dto.attachments[0]).toMatchObject({
      fileName: 'screen.png',
      sizeBytes: 2048,
      url: '/api/v1/projects/10/attachments/7d0c3f5e-4a6b-4c8e-9b1a-2f3e4d5c6b7a/download',
    });
    expect(dto.allowedTransitions).toEqual(expect.arrayContaining(['in_progress']));
    expect(dto.links).toHaveLength(1);
  });
});
