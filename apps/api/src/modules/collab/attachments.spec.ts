import { describe, expect, it } from '@jest/globals';
import { attachmentRow } from '../../../test/unit/fixtures.js';
import { createPrismaMock } from '../../../test/unit/prisma-mock.js';
import { attachmentUrl, toAttachmentDTO } from './attachments.mapper.js';
import {
  attachmentsOf,
  loadAttachments,
  purgeAttachments,
  purgeCollab,
} from './attachments.queries.js';

describe('attachments', () => {
  it('maps rows to DTOs with a download URL', () => {
    expect(attachmentUrl(10, 'abc')).toBe('/api/v1/projects/10/attachments/abc/download');
    expect(toAttachmentDTO(attachmentRow({ createdById: 9 }), new Map())).toMatchObject({
      sizeBytes: 2048,
      createdBy: null,
      entityType: 'defect',
    });
  });

  it('loads attachments of entities and by id', async () => {
    const { db } = createPrismaMock();
    await expect(attachmentsOf(db, 10, 'run_case', [])).resolves.toEqual([]);
    db.attachment.findMany.mockResolvedValue([attachmentRow()]);
    await attachmentsOf(db, 10, 'run_case', [1, 2]);
    expect(db.attachment.findMany.mock.calls[0]![0]!.where).toEqual({
      projectId: 10,
      entityType: 'run_case',
      entityId: { in: [1, 2] },
    });
    const byId = await loadAttachments(db, [attachmentRow().id]);
    expect(byId.get(attachmentRow().id)?.fileName).toBe('screen.png');
    await expect(loadAttachments(db, [])).resolves.toEqual(new Map());
  });

  it('purges attachments and returns their storage keys', async () => {
    const { db } = createPrismaMock();
    await expect(purgeAttachments(db, 'defect', [])).resolves.toEqual([]);
    db.attachment.findMany.mockResolvedValue([
      { storageKey: 'files/a' },
      { storageKey: 'files/b' },
    ] as never);
    await expect(purgeAttachments(db, 'defect', [30])).resolves.toEqual(['files/a', 'files/b']);
    expect(db.attachment.deleteMany).toHaveBeenCalledWith({
      where: { entityType: 'defect', entityId: { in: [30] } },
    });
  });

  it('purges comments with their attachments and the entity attachments', async () => {
    const { db } = createPrismaMock();
    db.comment.findMany.mockResolvedValue([{ id: 4 }, { id: 5 }] as never);
    db.attachment.findMany
      .mockResolvedValueOnce([{ storageKey: 'files/comment' }] as never)
      .mockResolvedValueOnce([{ storageKey: 'files/defect' }] as never);
    await expect(purgeCollab(db, 'defect', [30])).resolves.toEqual([
      'files/comment',
      'files/defect',
    ]);
    expect(db.comment.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [4, 5] } } });
    expect(db.attachment.findMany.mock.calls[0]![0]!.where).toEqual({
      entityType: 'comment',
      entityId: { in: [4, 5] },
    });
    await expect(purgeCollab(db, 'defect', [])).resolves.toEqual([]);
  });
});
