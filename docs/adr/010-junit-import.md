# ADR-010: Automation results via JUnit XML upload into a run

**Status:** Accepted · **Date:** 2026-10-27 · **Feature:** v1.1 · **Author:** 10x-Team (Architect + QA)

## Context

Automated suites (pytest, Appium, Playwright, JUnit, etc.) all emit JUnit XML. Results must land next to manual results in the same run and report.

## Decision

- `POST /runs/:runId/junit` parses the file with `fast-xml-parser` (DOCTYPE/entities rejected, ≤ 20 000 test cases) and maps each `<testcase>` to a run case by property → code → display id → title (`auto`), or one explicit rule.
- Failure/error → NG, skipped → configurable (N/T default), otherwise OK; several tests on one run case → worst status. Writes are one transaction with history rows `source: 'junit'`; `dryRun` previews.
- `createMissing` creates library cases (tag `automated`) for unmatched tests so CI can bootstrap a suite.

## Alternatives Considered

| Alternative                | Pros        | Cons                          | Why Not                             |
| -------------------------- | ----------- | ----------------------------- | ----------------------------------- |
| Per-framework adapters     | Rich data   | Many formats to maintain      | JUnit XML is the common denominator |
| Separate "automation runs" | Clean split | Reports must merge two worlds | Team reports one judgement per run  |

## Consequences

Positive: one `curl` from CI with an API token. Negative: matching depends on naming discipline — the dry run lists unmatched/ambiguous tests before writing.
