import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { ApiExtension } from '@nestjs/swagger';
import { PERMISSIONS, type PermissionKey } from '@tmt/shared';
import { AdminGuard } from '../guards/admin.guard.js';
import { ProjectAccessGuard } from '../guards/project-access.guard.js';

import {
  ALLOW_PENDING_PASSWORD,
  IS_PUBLIC,
  PROJECT_PERMISSION,
  SESSION_ONLY,
} from './metadata-keys.js';

/** No authentication required (login, health). */
export const Public = () =>
  applyDecorators(SetMetadata(IS_PUBLIC, true), ApiExtension('x-min-role', 'public'));

/** Refuses API-token authentication (403 TOKEN_NOT_ALLOWED): token, password and user admin. */
export const SessionOnly = () =>
  applyDecorators(SetMetadata(SESSION_ONLY, true), ApiExtension('x-session-only', true));

/** Still allowed while the user must change the password (me, change-password, logout). */
export const AllowPendingPasswordChange = () => SetMetadata(ALLOW_PENDING_PASSWORD, true);

/**
 * Requires membership in `:projectId` with at least the role of `permission`
 * (see PERMISSIONS in @tmt/shared). Non-members get 404 so project ids do not leak.
 */
export const ProjectPermission = (permission: PermissionKey) =>
  applyDecorators(
    SetMetadata(PROJECT_PERMISSION, permission),
    UseGuards(ProjectAccessGuard),
    // The 403 response is added to the document from this role (see openapi.enrich.ts).
    ApiExtension('x-min-role', PERMISSIONS[permission]),
  );

/** System administrators only. */
export const AdminOnly = () =>
  applyDecorators(UseGuards(AdminGuard), ApiExtension('x-min-role', 'admin'));

/** Documents the domain error codes an endpoint can return (`x-error-codes` in OpenAPI). */
export const ApiErrorCodes = (...codes: string[]) => ApiExtension('x-error-codes', codes);
