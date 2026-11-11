/**
 * Server-side settings of the web app, read from the environment at runtime (never hard-coded).
 * Defaults match `.env.example` for local development.
 */
export const serverEnv = {
  /** Base URL of the NestJS API that `/api/*` requests are forwarded to. */
  apiUrl: process.env.API_URL ?? 'http://localhost:4000',
  /** Must equal the API's SESSION_COOKIE_NAME. */
  sessionCookieName: process.env.SESSION_COOKIE_NAME ?? 'tmt_session',
};
