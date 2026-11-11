/** Port of the v1 server's w2-secret-box tests (the box is now the injectable `SecretBox`). */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { unitConfig } from '../../../test/unit/fixtures.js';
import {
  APP_SECRET_FILE,
  createSecretBoxFromKey,
  deriveKey,
  loadAppSecret,
  SecretBox,
  SecretBoxError,
} from './secret-box.js';

let dir: string;

beforeAll(async () => {
  dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'tmt-secret-box-'));
});
afterAll(async () => {
  await fsp.rm(dir, { recursive: true, force: true });
});

/** The injectable box for a data directory, optionally with APP_SECRET. */
const boxFor = (dataDir: string, appSecret?: string) =>
  new SecretBox(unitConfig({ DATA_DIR: dataDir, ...(appSecret && { APP_SECRET: appSecret }) }));

/** Changes the first character of a base64url part. */
const flip = (s: string) => (s[0] === 'A' ? 'B' : 'A') + s.slice(1);

describe('secret box (AES-256-GCM)', () => {
  const box = createSecretBoxFromKey(deriveKey('x'.repeat(40)));

  it('seals to v1:<iv>:<tag>:<ciphertext> and opens again', () => {
    const sealed = box.seal('my-jira-pat', 'jira:project:1');
    expect(sealed).toMatch(/^v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]+$/);
    expect(sealed).not.toContain('my-jira-pat');
    expect(box.open(sealed, 'jira:project:1')).toBe('my-jira-pat');
    // Random IV: the same secret seals differently every time.
    expect(box.seal('my-jira-pat', 'jira:project:1')).not.toBe(sealed);
    expect(box.open(box.seal('ไทย ✓ unicode'), undefined)).toBe('ไทย ✓ unicode');
  });

  it('refuses tampered values, another context, another key and unknown formats', () => {
    const sealed = box.seal('secret', 'jira:project:1');
    const [v, iv, tag, ct] = sealed.split(':') as [string, string, string, string];
    const bad = [
      `${v}:${iv}:${tag}:${flip(ct)}`,
      `${v}:${iv}:${flip(tag)}:${ct}`,
      `${v}:${flip(iv)}:${tag}:${ct}`,
      `${v}:${iv}:${tag.slice(0, 8)}:${ct}`, // truncated tag
      `v2:${iv}:${tag}:${ct}`,
      'garbage',
    ];
    for (const value of bad) {
      expect(() => box.open(value, 'jira:project:1')).toThrow(SecretBoxError);
    }
    expect(() => box.open(sealed, 'jira:project:2')).toThrow(SecretBoxError);
    const other = createSecretBoxFromKey(deriveKey('y'.repeat(40)));
    expect(() => other.open(sealed, 'jira:project:1')).toThrow(/cannot be decrypted/);
    expect(() => createSecretBoxFromKey(Buffer.alloc(16))).toThrow(/32 bytes/);
  });

  it('derives the key from APP_SECRET without touching the data directory', () => {
    const dataDir = path.join(dir, 'with-app-secret');
    const secret = 'A'.repeat(48);
    expect(loadAppSecret({ appSecret: secret, dataDir })).toBe(secret);
    const a = boxFor(dataDir, secret);
    const b = boxFor(dataDir, secret);
    expect(b.open(a.seal('pat'))).toBe('pat');
    expect(fs.existsSync(dataDir)).toBe(false);
  });

  it('creates DATA_DIR/app-secret (mode 0600) on first use and reuses it', () => {
    const dataDir = path.join(dir, 'generated');
    const box1 = boxFor(dataDir);
    const file = path.join(dataDir, APP_SECRET_FILE);
    expect(fs.existsSync(file)).toBe(false); // lazy
    const sealed = box1.seal('pat');
    const content = fs.readFileSync(file, 'utf8').trim();
    expect(content).toMatch(/^[A-Za-z0-9_-]{43}$/);
    if (process.platform !== 'win32') expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    // A new process (new box) reads the same file and can open old values.
    expect(boxFor(dataDir).open(sealed)).toBe('pat');
    expect(loadAppSecret({ appSecret: null, dataDir })).toBe(content);
  });

  it('refuses an invalid app-secret file instead of silently replacing it', () => {
    const dataDir = path.join(dir, 'broken');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, APP_SECRET_FILE), 'short\n');
    expect(() => loadAppSecret({ appSecret: null, dataDir })).toThrow(/invalid/);
    expect(() => boxFor(dataDir).seal('pat')).toThrow(SecretBoxError);
  });
});
