import { describe, expect, it } from '@jest/globals';
import { AppConfig } from './app-config.js';

const base = { DATABASE_URL: 'postgresql://u@h/db' };

describe('AppConfig.fromEnv', () => {
  it('applies the documented defaults', () => {
    const c = AppConfig.fromEnv(base);
    expect(c).toMatchObject({
      nodeEnv: 'development',
      port: 4000,
      host: '0.0.0.0',
      webOrigins: ['http://localhost:3000'],
      sessionCookieName: 'tmt_session',
      cookieSecure: false,
      loginMaxFailed: 5,
      loginLockMinutes: 15,
      defaultDocNoPattern: '{YY}TR-TEAM-{MM}-{SEQ}',
      reportTimezone: 'Asia/Bangkok',
      publicUrl: null,
      initialAdminPassword: null,
      appSecret: null,
    });
    expect(c.isProduction).toBe(false);
  });

  it('parses numbers, booleans and comma lists', () => {
    const c = AppConfig.fromEnv({
      ...base,
      NODE_ENV: 'production',
      API_PORT: '8080',
      COOKIE_SECURE: 'yes',
      TRUST_PROXY: '1',
      WEB_ORIGINS: 'https://a.example, https://b.example ,',
      MAX_UPLOAD_MB: '10',
      PUBLIC_URL: 'https://tmt.example.com/',
    });
    expect(c.port).toBe(8080);
    expect(c.cookieSecure).toBe(true);
    expect(c.trustProxy).toBe(true);
    expect(c.webOrigins).toEqual(['https://a.example', 'https://b.example']);
    expect(c.maxUploadBytes).toBe(10 * 1024 * 1024);
    expect(c.publicUrl).toBe('https://tmt.example.com');
    expect(c.isProduction).toBe(true);
  });

  it('treats empty optional values as not set', () => {
    const c = AppConfig.fromEnv({
      ...base,
      INITIAL_ADMIN_PASSWORD: '',
      APP_SECRET: '  ',
      PUBLIC_URL: '',
    });
    expect(c.initialAdminPassword).toBeNull();
    expect(c.appSecret).toBeNull();
    expect(c.publicUrl).toBeNull();
  });

  it('reports every invalid variable in one error', () => {
    let message = '';
    try {
      AppConfig.fromEnv({ API_PORT: '99999', REPORT_TIMEZONE: 'Mars/Base' });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/^Invalid configuration/);
    expect(message).toContain('DATABASE_URL');
    expect(message).toContain('API_PORT');
    expect(message).toContain('Unknown IANA time zone');
  });
});
