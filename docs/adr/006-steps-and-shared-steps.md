# ADR-006: Step-by-step cases, shared steps and step results

**Status:** Accepted · **Date:** 2026-10-27 · **Feature:** v1.1 · **Author:** 10x-Team (Architect + DBA)

## Context

The team writes procedure/expected as free text (Excel). Famous tools (TestRail, Qase, Tuskr) also offer step-by-step cases with per-step results and reusable "shared steps". Both styles must coexist and the controlled Excel report must keep working.

## Decision

- `test_cases.template` = `text` (default, unchanged behaviour) | `steps`. Steps live in `test_cases.steps` (jsonb): `{kind:'step', action, expected}` or `{kind:'shared', sharedStepId}`.
- `shared_steps` (per project, unique name) hold `PlainStep[]` and a version. Library reads expand references (`CaseStepDTO`); a missing reference shows `missing: true`. Deleting an in-use shared step is refused unless `?inline=true` copies the steps into each case.
- Run snapshots flatten shared steps (`RunStepDTO`, keeps `sharedStepName`) — later edits never change executed runs (ADR-003).
- Step results (`{status, actual}[]`, index-aligned) are stored on the run case and on each history row. The case result stays the reported value; `suggestStatusFromSteps` (worst wins: NG > Blocked > N/T > OK w/ cond. > OK > N/A) only suggests it.
- Excel exports render step cases with `stepsToText()` into the procedure / expected columns, so templates need no change.

## Alternatives Considered

| Alternative                      | Pros                     | Cons                                                             | Why Not                                       |
| -------------------------------- | ------------------------ | ---------------------------------------------------------------- | --------------------------------------------- |
| Separate `case_steps` table      | Relational, per-step ids | Joins on every case read; ordering updates; versions need copies | Steps are always read/written with their case |
| Expand shared steps at save time | Simple reads             | Editing a shared step would not propagate                        | Defeats the purpose of shared steps           |

## Consequences

Positive: no change for text cases, imports and the controlled report. Negative: jsonb steps are not individually queryable (GIN `jsonb_path_ops` index covers "which cases use shared step N"). Risk: very long shared steps inflate snapshots — limits 200 steps per case, 100 per shared step.
