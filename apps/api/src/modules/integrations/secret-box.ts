/**
 * Sealing of integration secrets (ADR-008): AES-256-GCM with a key derived by HKDF-SHA256 from
 * `APP_SECRET`, or from a random secret generated once into `DATA_DIR/app-secret` (mode 0600).
 * Sealed form: `v1:<iv>:<tag>:<ciphertext>` (base64url parts). An optional context string is bound
 * as additional authenticated data, so a sealed value cannot be moved to another record.
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../config/app-config.js';

const VERSION = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HKDF_SALT = 'tmt-secret-box';
const HKDF_INFO = 'tmt/integration-secrets/v1';
const MIN_SECRET_LENGTH = 32;
/** Name of the generated key material file inside DATA_DIR. */
export const APP_SECRET_FILE = 'app-secret';

/** A sealed value cannot be opened (tampered, other context, or the key material changed). */
export class SecretBoxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecretBoxError';
  }
}

/** Seals and opens secrets; `context` binds a sealed value to its record. */
export interface Sealer {
  seal(plaintext: string, context?: string): string;
  open(sealed: string, context?: string): string;
}

/** 32-byte AES key from the key material (HKDF-SHA256 with a fixed salt and info). */
export function deriveKey(material: string): Buffer {
  return Buffer.from(
    hkdfSync(
      'sha256',
      Buffer.from(material, 'utf8'),
      Buffer.from(HKDF_SALT),
      Buffer.from(HKDF_INFO),
      32,
    ),
  );
}

function readSecretFile(file: string): string {
  const value = fs.readFileSync(file, 'utf8').trim();
  if (value.length < MIN_SECRET_LENGTH) {
    throw new SecretBoxError(
      `${file} is invalid (expected at least ${MIN_SECRET_LENGTH} characters)`,
    );
  }
  return value;
}

/** `APP_SECRET`, else the persisted `DATA_DIR/app-secret` (created with mode 0600 when missing). */
export function loadAppSecret(config: Pick<AppConfig, 'appSecret' | 'dataDir'>): string {
  if (config.appSecret) return config.appSecret;
  const file = path.join(config.dataDir, APP_SECRET_FILE);
  try {
    return readSecretFile(file);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  fs.mkdirSync(config.dataDir, { recursive: true });
  const secret = randomBytes(32).toString('base64url');
  try {
    fs.writeFileSync(file, `${secret}\n`, { mode: 0o600, flag: 'wx' });
    return secret;
  } catch (e) {
    // Another process created it first: use theirs.
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') return readSecretFile(file);
    throw e;
  }
}

/** Sealer for a 32-byte key. */
export function createSecretBoxFromKey(key: Buffer): Sealer {
  if (key.length !== 32) throw new Error('The secret box key must be 32 bytes');
  return {
    seal(plaintext, context) {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
      if (context !== undefined) cipher.setAAD(Buffer.from(context, 'utf8'));
      const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      return [VERSION, ...[iv, tag, ciphertext].map((p) => p.toString('base64url'))].join(':');
    },
    open(sealed, context) {
      const parts = sealed.split(':');
      if (parts.length !== 4 || parts[0] !== VERSION) {
        throw new SecretBoxError('Unsupported sealed secret format');
      }
      const iv = Buffer.from(parts[1]!, 'base64url');
      const tag = Buffer.from(parts[2]!, 'base64url');
      const ciphertext = Buffer.from(parts[3]!, 'base64url');
      if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
        throw new SecretBoxError('Unsupported sealed secret format');
      }
      try {
        const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
        decipher.setAuthTag(tag);
        if (context !== undefined) decipher.setAAD(Buffer.from(context, 'utf8'));
        return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
      } catch {
        throw new SecretBoxError(
          'The stored secret cannot be decrypted (APP_SECRET or DATA_DIR/app-secret changed?)',
        );
      }
    },
  };
}

/**
 * The secret box of the server configuration. The key is derived lazily on first use, so the
 * `DATA_DIR/app-secret` file is only created when a secret is actually sealed or opened.
 */
@Injectable()
export class SecretBox implements Sealer {
  private box: Sealer | null = null;

  constructor(private readonly config: AppConfig) {}

  seal(plaintext: string, context?: string): string {
    return this.sealer().seal(plaintext, context);
  }

  open(sealed: string, context?: string): string {
    return this.sealer().open(sealed, context);
  }

  private sealer(): Sealer {
    this.box ??= createSecretBoxFromKey(deriveKey(loadAppSecret(this.config)));
    return this.box;
  }
}
