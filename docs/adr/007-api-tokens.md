# ADR-007: Personal API tokens and the public REST API

**Status:** Accepted · **Date:** 2026-10-27 · **Feature:** v1.1 · **Author:** 10x-Team (Architect + Security)

## Context

CI pipelines and scripts must push results (JUnit upload, result updates) without a browser session; testers want to explore the API.

## Decision

- Personal tokens `tmt_` + 40 url-safe random characters (240 bits). Only `sha256(token)` and an 8-character prefix are stored (`api_tokens`); the token is shown once. Optional expiry; revocation sets `revoked_at`; max 20 active tokens per user; `last_used_at` updated at most every 5 minutes.
- `Authorization: Bearer` wins over the cookie, acts with the user's own project roles, and skips the CSRF header check (not a browser-ambient credential). Tokens cannot manage tokens, passwords or users (403 `TOKEN_NOT_ALLOWED`).
- `GET /api/v1/openapi.json` is generated from a route catalogue with Zod 4 `z.toJSONSchema` for request bodies/queries; a test fails when a registered route is missing from the catalogue. The web app renders it (no Swagger UI dependency).

## Alternatives Considered

| Alternative                            | Pros             | Cons                          | Why Not                                                       |
| -------------------------------------- | ---------------- | ----------------------------- | ------------------------------------------------------------- |
| OAuth2 client credentials              | Standard, scoped | Needs an authorization server | Overkill for an intranet tool                                 |
| Scoped tokens (read/write per project) | Least privilege  | More UI and checks            | Deferred; user-level tokens match how TestRail/Jira PATs work |

## Consequences

Positive: CI can upload results with one `curl`. Negative: a leaked token has the user's full rights until revoked — mitigated by expiry, prefix display, last-used time, admin bulk revoke and HTTPS guidance.
