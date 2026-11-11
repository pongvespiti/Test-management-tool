import { beforeEach, describe, expect, it } from '@jest/globals';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { authUser } from '../../../test/unit/fixtures.js';
import { fakeRequest, httpContext } from '../../../test/unit/http-context.js';
import { createPrismaMock, type PrismaMock } from '../../../test/unit/prisma-mock.js';
import { ProjectPermission } from '../decorators/auth.decorators.js';
import { AppException } from '../errors/app.exception.js';
import { ProjectAccessGuard } from './project-access.guard.js';

class TestController {
  @ProjectPermission('read')
  read() {}

  @ProjectPermission('manageMembers')
  manage() {}

  unguarded() {}
}

async function failure(promise: Promise<unknown>): Promise<AppException> {
  try {
    await promise;
  } catch (e) {
    return e as AppException;
  }
  throw new Error('expected the guard to reject');
}

describe('ProjectAccessGuard', () => {
  let mock: PrismaMock;
  let guard: ProjectAccessGuard;

  const activate = (req: Request, name: keyof TestController) =>
    guard.canActivate(httpContext(req, undefined, TestController.prototype[name], TestController));

  const project = (members: { role: 'lead' | 'tester' | 'viewer' }[]) =>
    mock.db.project.findUnique.mockResolvedValue({
      id: 3,
      key: 'ACS',
      name: 'ACS Smart',
      members,
    } as never);

  beforeEach(() => {
    mock = createPrismaMock();
    guard = new ProjectAccessGuard(new Reflector(), mock.prisma);
  });

  it('does nothing on routes without @ProjectPermission', async () => {
    await expect(activate(fakeRequest(), 'unguarded')).resolves.toBe(true);
    expect(mock.db.project.findUnique).not.toHaveBeenCalled();
  });

  it('attaches the project and the member role', async () => {
    project([{ role: 'tester' }]);
    const req = fakeRequest({ params: { projectId: '3' }, authUser: authUser() });
    await expect(activate(req, 'read')).resolves.toBe(true);
    expect(req.project).toEqual({ id: 3, key: 'ACS', name: 'ACS Smart', role: 'tester' });
  });

  it('answers 404 for non-members and unknown or malformed project ids', async () => {
    project([]);
    const nonMember = await failure(
      activate(fakeRequest({ params: { projectId: '3' }, authUser: authUser() }), 'read'),
    );
    expect(nonMember.code).toBe('PROJECT_NOT_FOUND');
    expect(nonMember.getStatus()).toBe(404);

    mock.db.project.findUnique.mockResolvedValue(null);
    expect(
      (
        await failure(
          activate(fakeRequest({ params: { projectId: '99' }, authUser: authUser() }), 'read'),
        )
      ).code,
    ).toBe('PROJECT_NOT_FOUND');
    expect(
      (
        await failure(
          activate(fakeRequest({ params: { projectId: 'abc' }, authUser: authUser() }), 'read'),
        )
      ).code,
    ).toBe('PROJECT_NOT_FOUND');
  });

  it('answers 403 when the role is below the permission', async () => {
    project([{ role: 'viewer' }]);
    const error = await failure(
      activate(fakeRequest({ params: { projectId: '3' }, authUser: authUser() }), 'manage'),
    );
    expect(error.getStatus()).toBe(403);
    expect(error.message).toMatch(/lead role in project ACS/);
  });

  it('lets administrators act as lead without membership', async () => {
    project([]);
    const req = fakeRequest({ params: { projectId: '3' }, authUser: authUser({ isAdmin: true }) });
    await expect(activate(req, 'manage')).resolves.toBe(true);
    expect(req.project?.role).toBe('lead');
  });

  it('requires an authenticated user', async () => {
    const error = await failure(activate(fakeRequest({ params: { projectId: '3' } }), 'read'));
    expect(error.getStatus()).toBe(401);
  });
});
