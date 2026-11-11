import { describe, expect, it } from '@jest/globals';
import { createPrismaMock } from '../../../test/unit/prisma-mock.js';
import { ActivityService } from './activity.service.js';

describe('ActivityService', () => {
  it('writes one audit row in the given transaction client', async () => {
    const { db } = createPrismaMock();
    await new ActivityService().log(db, {
      projectId: 10,
      userId: 1,
      entityType: 'release',
      entityId: 5,
      action: 'created',
      summary: 'Created release FW 2.4.0',
      data: { status: 'planned' },
    });
    expect(db.activityLog.create).toHaveBeenCalledWith({
      data: {
        projectId: 10,
        userId: 1,
        entityType: 'release',
        entityId: 5,
        action: 'created',
        summary: 'Created release FW 2.4.0',
        data: { status: 'planned' },
      },
    });
  });

  it('truncates very long summaries', async () => {
    const { db } = createPrismaMock();
    await new ActivityService().log(db, {
      projectId: null,
      userId: null,
      entityType: 'user',
      entityId: null,
      action: 'x',
      summary: 'a'.repeat(5000),
    });
    const data = db.activityLog.create.mock.calls[0]![0].data;
    expect(String(data.summary)).toHaveLength(1000);
    expect(data.data).toBeUndefined();
  });
});
