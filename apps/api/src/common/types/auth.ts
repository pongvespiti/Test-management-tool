import type { ProjectRole } from '@tmt/shared';

/** The signed-in user attached to the request by the AuthGuard. */
export interface AuthUser {
  id: number;
  username: string;
  displayName: string;
  isAdmin: boolean;
  /** Lab technician: only routes marked `@TechnicianAllowed()`. */
  isTechnician: boolean;
  mustChangePassword: boolean;
}

/** The project of `:projectId` and the caller's effective role (admins act as lead). */
export interface ProjectContext {
  id: number;
  key: string;
  name: string;
  role: ProjectRole;
}

export type AuthMethod = 'session' | 'token';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      authUser?: AuthUser;
      sessionId?: string;
      authMethod?: AuthMethod;
      project?: ProjectContext;
    }
  }
}
