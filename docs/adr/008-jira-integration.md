# ADR-008: Jira integration and secret storage

**Status:** Accepted · **Date:** 2026-10-27 · **Feature:** v1.1 · **Author:** 10x-Team (Architect + Security)

## Context

The team used Jira (+Xray/Zephyr). Defects found in TMT should become Jira issues (or link to existing ones) and show their Jira status. The server runs on-prem; Jira may be Server/Data Center or Cloud.

## Decision

- Per-project settings in `project_integrations` (`kind='jira'`): base URL, project key, issue type, auth type (`pat` Bearer for Server/DC, `basic` e-mail + API token for Cloud), username, `verifyTls`.
- The secret is sealed with AES-256-GCM (`v1:<iv>:<tag>:<ciphertext>`); the key is HKDF-SHA256 of `APP_SECRET` (env) or of a random secret generated once into `DATA_DIR/app-secret` (mode 0600). Losing that file means re-entering Jira secrets — documented in backup docs.
- Jira REST API v2 over `node:https` (no extra dependency): create issue, link existing issue (verify it exists), sync status on demand. No webhooks, no background polling (intranet servers usually cannot receive Jira Cloud webhooks).
- Only leads read/write settings; any member sees `IntegrationsStatusDTO` (no auth details).

## Alternatives Considered

| Alternative                       | Pros      | Cons                                          | Why Not                         |
| --------------------------------- | --------- | --------------------------------------------- | ------------------------------- |
| Store secrets in plain DB columns | Simple    | DB dumps/backups leak credentials             | Not acceptable                  |
| OS keychain / Vault               | Strong    | Not available on every target server          | Over-engineering for v1.1       |
| Jira webhooks for status          | Real-time | Inbound connectivity, extra endpoint security | Manual "Sync" is enough for now |

## Consequences

Positive: one-click issue creation with full defect context. Negative: statuses are only as fresh as the last sync. Risk: corporate TLS interception — prefer `NODE_EXTRA_CA_CERTS`, `verifyTls: false` as a last resort per host.
