import path from 'node:path';
import { envSchema } from './env.schema.js';

/**
 * Typed, validated application configuration. Injected everywhere as `AppConfig`
 * (tests replace it with `overrideProvider(AppConfig)`).
 */
export class AppConfig {
  readonly nodeEnv!: 'development' | 'production' | 'test';
  readonly databaseUrl!: string;
  readonly dbPoolMax!: number;
  readonly host!: string;
  readonly port!: number;
  readonly webOrigins!: string[];
  readonly publicUrl!: string | null;
  readonly trustProxy!: boolean;
  readonly dataDir!: string;
  readonly maxUploadBytes!: number;
  readonly maxAttachmentBytes!: number;
  readonly logLevel!: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  readonly swaggerEnabled!: boolean;
  readonly sessionCookieName!: string;
  readonly cookieSecure!: boolean;
  readonly sessionIdleHours!: number;
  readonly sessionMaxDays!: number;
  readonly loginRateLimitPerMin!: number;
  readonly loginMaxFailed!: number;
  readonly loginLockMinutes!: number;
  readonly initialAdminUsername!: string;
  readonly initialAdminPassword!: string | null;
  readonly defaultDocNoPattern!: string;
  readonly reportTimezone!: string;
  readonly appSecret!: string | null;

  constructor(values: AppConfig) {
    Object.assign(this, values);
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  /** Parses and validates `env`; throws one readable error listing every problem. */
  static fromEnv(env: NodeJS.ProcessEnv = process.env): AppConfig {
    const parsed = envSchema.safeParse(env);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `${i.path.join('.') || 'env'}: ${i.message}`)
        .join('; ');
      throw new Error(`Invalid configuration — ${issues}`);
    }
    const e = parsed.data;
    return new AppConfig({
      nodeEnv: e.NODE_ENV,
      databaseUrl: e.DATABASE_URL,
      dbPoolMax: e.DB_POOL_MAX,
      host: e.API_HOST,
      port: e.API_PORT,
      webOrigins: e.WEB_ORIGINS,
      publicUrl: e.PUBLIC_URL ? e.PUBLIC_URL.replace(/\/+$/, '') : null,
      trustProxy: e.TRUST_PROXY,
      dataDir: path.resolve(e.DATA_DIR),
      maxUploadBytes: Math.round(e.MAX_UPLOAD_MB * 1024 * 1024),
      maxAttachmentBytes: Math.round(e.MAX_ATTACHMENT_MB * 1024 * 1024),
      logLevel: e.LOG_LEVEL,
      swaggerEnabled: e.SWAGGER_ENABLED,
      sessionCookieName: e.SESSION_COOKIE_NAME,
      cookieSecure: e.COOKIE_SECURE,
      sessionIdleHours: e.SESSION_IDLE_HOURS,
      sessionMaxDays: e.SESSION_MAX_DAYS,
      loginRateLimitPerMin: e.LOGIN_RATE_LIMIT_PER_MIN,
      loginMaxFailed: e.LOGIN_MAX_FAILED,
      loginLockMinutes: e.LOGIN_LOCK_MINUTES,
      initialAdminUsername: e.INITIAL_ADMIN_USERNAME.toLowerCase(),
      initialAdminPassword: e.INITIAL_ADMIN_PASSWORD ?? null,
      defaultDocNoPattern: e.DEFAULT_DOC_NO_PATTERN,
      reportTimezone: e.REPORT_TIMEZONE,
      appSecret: e.APP_SECRET ?? null,
    } as AppConfig);
  }
}
