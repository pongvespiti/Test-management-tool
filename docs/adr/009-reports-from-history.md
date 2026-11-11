# ADR-009: Reports are computed on request from runs, results history and defects

**Status:** Accepted · **Date:** 2026-10-27 · **Feature:** v1.1 · **Author:** 10x-Team (Architect + DBA)

## Context

Famous tools offer trend/burndown, workload, defect trends, release comparison and coverage. Data volume is small (thousands of run cases per release, tens of thousands of results).

## Decision

- No reporting tables or materialised views. Endpoints aggregate `run_cases`, `run_case_results` (indexed by `executed_at`) and `defects` per request, bucketing days in `REPORT_TIMEZONE` (default Asia/Bangkok).
- Burndown and daily pass rate replay the history in memory (latest result per run case at the end of each day); requests are bounded to ≤ 365 days and one project.
- Effective assignee = `run_cases.assignee_id ?? test_runs.tester_id`.

## Alternatives Considered

| Alternative             | Pros                               | Cons                        | Why Not                        |
| ----------------------- | ---------------------------------- | --------------------------- | ------------------------------ |
| Nightly snapshot tables | Fast reads, true history of counts | Jobs, backfills, drift      | Volume does not justify it yet |
| Materialised views      | Fast                               | Refresh scheduling, locking | Same                           |

## Consequences

Positive: always consistent with the data; no jobs to operate. Negative: heavier queries on big projects — revisit with snapshot tables if a report exceeds ~1 s.
