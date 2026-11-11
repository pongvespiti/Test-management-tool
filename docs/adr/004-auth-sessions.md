# ADR-004: Local accounts with server-side sessions in PostgreSQL; AD-ready provider boundary

**Status:** Accepted
**Date:** 2026-10-23
**Feature:** tmt-mvp
**Author:** 10x-Team (Architect + Security Engineer)

## Context

MVP uses local accounts; AD/LDAP may come later. Intranet deployment, possibly plain HTTP at first.

## Decision

- Passwords hashed with **scrypt** (`node:crypto`, N=2^15, r=8, p=1, 16-byte salt, 64-byte key) stored as `scrypt$N$r$p$salt$hash`.
- Login issues a random 32-byte token in an HttpOnly cookie `tmt_session` (SameSite=Lax, Secure when `COOKIE_SECURE=true`); only its SHA-256 is stored in `sessions`. Idle timeout 12 h, absolute 7 days; logout and password change revoke sessions.
- CSRF: unsafe methods require same-origin `Origin`/`Referer` (when present) **and** the header `X-Requested-With: tmt` (cannot be sent cross-site without CORS preflight, and CORS is disabled).
- Brute force: per-IP rate limit on `/auth/login` + per-account lockout (5 failures → 15 min).
- `users.auth_provider` (`local` now, `ldap` later) keeps the door open for AD.

## Alternatives Considered

| Alternative         | Pros      | Cons                                       | Why Not              |
| ------------------- | --------- | ------------------------------------------ | -------------------- |
| JWT in localStorage | Stateless | XSS-exposed tokens, no revocation          | Security             |
| JWT cookie          | Stateless | Revocation needs a blacklist anyway        | Sessions are simpler |
| bcrypt/argon2 npm   | Popular   | Native addons break the single-bundle goal | ADR-001              |

## Consequences

- One DB lookup per request (indexed by PK) — negligible at this scale.
- Session table needs periodic cleanup (done on login and hourly timer).
