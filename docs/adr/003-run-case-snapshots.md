# ADR-003: Runs snapshot test-case content; results live on the run case with an append-only history

**Status:** Accepted
**Date:** 2026-10-23
**Feature:** tmt-mvp
**Author:** 10x-Team (Architect + DBA)

## Context

Library cases change between releases, but a completed test report must show exactly what was executed. Reports, dashboards and the summary matrix read results heavily.

## Decision

- Adding a case to a run copies its title, code, type, texts, section path, summary group, custom values and version into `run_cases`.
- The current result (status, actual, remark, executed by/at) is stored on `run_cases` for fast aggregation; every change appends a row to `run_case_results`.
- Completed plans lock their runs/run cases (API refuses writes until reopened by a Lead).

## Alternatives Considered

| Alternative                       | Pros           | Cons                                                   | Why Not                            |
| --------------------------------- | -------------- | ------------------------------------------------------ | ---------------------------------- |
| Reference live cases + version id | Less storage   | Every read joins versions; deleted cases break reports | Reports must be immutable and fast |
| Results only as history rows      | Pure event log | Aggregations need "latest per case" queries everywhere | Slower dashboards, complex SQL     |

## Consequences

### Positive

- Reports are stable; dashboards are simple `GROUP BY status` queries.

### Negative

- Text duplication (acceptable: ~1 KB × cases × runs).

### Risks

- Users may want to refresh a run from the library → offer "refresh untested cases" later (phase 2).

## Dependencies

- Constrains the export and matrix modules to read only `run_cases`.
