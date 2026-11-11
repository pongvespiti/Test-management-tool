import { z } from 'zod';

const boolish = z
  .union([z.boolean(), z.string()])
  .transform((v) =>
    typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase()),
  );

/** Optional variable: an empty value (`KEY=` in .env) counts as "not set". */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    schema.optional(),
  );

const csv = z.string().transform((v) =>
  v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

/**
 * Every setting of the API comes from the environment (`.env` in development). Defaults are
 * safe for a single on-prem server; see `.env.example` for documentation of each variable.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  /** Browser origins allowed to call the API with cookies (the Next.js app). */
  WEB_ORIGINS: csv.default(['http://localhost:3000']),
  /** External base URL of the web app (links in Jira issues, e-mails). */
  PUBLIC_URL: optional(z.url()),
  TRUST_PROXY: boolish.default(false),
  DATA_DIR: z.string().default('./data'),
  MAX_UPLOAD_MB: z.coerce.number().positive().max(2047).default(25),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  SWAGGER_ENABLED: boolish.default(true),
  // sessions & sign-in
  SESSION_COOKIE_NAME: z
    .string()
    .regex(/^[A-Za-z0-9_-]+$/)
    .default('tmt_session'),
  COOKIE_SECURE: boolish.default(false),
  SESSION_IDLE_HOURS: z.coerce.number().positive().default(12),
  SESSION_MAX_DAYS: z.coerce.number().positive().default(7),
  LOGIN_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(20),
  LOGIN_MAX_FAILED: z.coerce.number().int().min(1).default(5),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().min(1).default(15),
  INITIAL_ADMIN_USERNAME: z.string().trim().min(3).default('admin'),
  INITIAL_ADMIN_PASSWORD: optional(z.string().min(8)),
  // domain defaults
  DEFAULT_DOC_NO_PATTERN: z.string().trim().min(1).default('{YY}TR-TEAM-{MM}-{SEQ}'),
  REPORT_TIMEZONE: z
    .string()
    .default('Asia/Bangkok')
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, 'Unknown IANA time zone'),
  /** Key material for sealing integration secrets (≥ 32 chars); generated into DATA_DIR if unset. */
  APP_SECRET: optional(z.string().min(32)),
});

export type Env = z.infer<typeof envSchema>;
