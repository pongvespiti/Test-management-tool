# ADR-002: Test reports are produced by filling the team's controlled Excel template

**Status:** Accepted (engine choice pending spike result)
**Date:** 2026-10-23
**Feature:** tmt-mvp
**Author:** 10x-Team (Architect + Staff Engineer)

## Context

The product owner requires exported reports to match the controlled form **100 %** (document control, hand signatures). The form has merged cells, logos, data validations, hidden sheets, print setup, one sheet per Test ID and a summary matrix.

## Decision

- Store report templates (`.xlsx` + small JSON config) per project/suite. The export fills `${…}` placeholders and repeats table rows; the run sheet is cloned once per run and renamed to the run code; the template run sheet is then removed.
- Engine: **xlsx-template 1.4.7** (MIT, edits the OOXML in place, supports `${table:…}` rows, `copySheet`, images). A post-processor may add vertical merges for section cells.
- A spike validates the engine against the team's real workbooks before the feature is built; if fidelity fails (styles/merges/validations lost), switch to an in-house OOXML engine (JSZip + XML row cloning) behind the same `renderReport(template, data)` interface.
- A default template derived from the sample workbook ships with the app until the team uploads the controlled blank form.

## Alternatives Considered

| Alternative                                     | Pros                      | Cons                                                                                                     | Why Not                         |
| ----------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Generate the workbook from scratch with ExcelJS | Full programmatic control | Re-implements the form; drift from the controlled format; ExcelJS drops some drawing/validation features | Cannot guarantee 100 % fidelity |
| openpyxl (Python) post-processing               | Mature                    | Second runtime; drops images (WMF) and shapes                                                            | Adds Python to the deployment   |
| Carbone / commercial report engines             | Rich templating           | Licence terms / LibreOffice dependency                                                                   | Not needed for xlsx→xlsx        |
| HTML/PDF report only                            | Simple                    | Not the controlled Excel form                                                                            | Requirement is the Excel form   |

## Consequences

### Positive

- The QA document owner keeps control of the layout; changing the form = uploading a new template.

### Negative

- Templates need placeholders inserted once (we prepare the first one).

### Risks

- Library limitations on merged/validated ranges when rows are inserted → covered by the spike and regression tests comparing generated XML parts.

## Dependencies

- Blank controlled form from the team (open item).
