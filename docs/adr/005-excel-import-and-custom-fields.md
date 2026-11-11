# ADR-005: Server-side Excel import engine; suite-level custom fields stored as JSONB

**Status:** Accepted
**Date:** 2026-10-23
**Feature:** tmt-mvp
**Author:** 10x-Team (Architect + Staff Engineer + DBA)

## Context

The team's workbooks have headers on rows 8–30, merged category cells, group rows, multi-device result columns and test-type specific columns (Register, Modbus test method, Expected result of device…).

## Decision

- Parse on the server with **ExcelJS** (also CSV). Upload is stored temporarily (token, 2 h) so the wizard can re-analyse with another sheet/header row/mapping without re-uploading. Preview and commit call the same deterministic `parseImport(grid, mapping, options)` function (pure, unit-tested with synthetic fixtures that mimic the real layouts).
- Custom fields: definitions in `suites.field_defs` (JSONB array `{key,label,type,options?,showInTable}`), values in `test_cases.custom` (JSONB object). Run cases copy the values.

## Alternatives Considered

| Alternative                    | Pros              | Cons                                                          | Why Not                                             |
| ------------------------------ | ----------------- | ------------------------------------------------------------- | --------------------------------------------------- |
| Parse in the browser (SheetJS) | No upload         | Large bundle, logic duplicated for validation, harder to test | Server parse is authoritative and testable          |
| EAV tables for custom fields   | Relational purity | Joins everywhere, complex queries                             | JSONB is simpler; fields are per-suite display data |
| Fixed columns for Modbus       | Simple            | Not extensible to the next test type                          | Teams add new test types regularly                  |

## Consequences

- Searching inside custom values uses JSONB text search (acceptable for MVP).
- Field key renames must migrate values (handled by the suite update service).
