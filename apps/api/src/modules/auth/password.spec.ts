import { describe, expect, it } from '@jest/globals';
import { DUMMY_HASH, hashPassword, randomPassword, verifyPassword } from './password.js';

describe('password hashing (scrypt)', () => {
  it('produces a self-describing salted hash that verifies', async () => {
    const hash = await hashPassword('Correct horse 1!');
    expect(hash).toMatch(/^scrypt\$32768\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    await expect(verifyPassword('Correct horse 1!', hash)).resolves.toBe(true);
    await expect(verifyPassword('correct horse 1!', hash)).resolves.toBe(false);
  });

  it('uses a new salt every time', async () => {
    const [a, b] = await Promise.all([hashPassword('same'), hashPassword('same')]);
    expect(a).not.toBe(b);
  });

  it('normalises Unicode (NFKC) so equivalent input verifies', async () => {
    const hash = await hashPassword('ｐａｓｓ１２３'); // full-width characters
    await expect(verifyPassword('pass123', hash)).resolves.toBe(true);
  });

  it('never verifies malformed hashes or the dummy hash', async () => {
    await expect(verifyPassword('x', 'plain-text')).resolves.toBe(false);
    await expect(verifyPassword('x', 'bcrypt$1$2$3$4$5')).resolves.toBe(false);
    await expect(verifyPassword('', DUMMY_HASH)).resolves.toBe(false);
  });

  it('generates random one-time passwords', () => {
    const a = randomPassword();
    expect(a).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(randomPassword()).not.toBe(a);
  });
});
