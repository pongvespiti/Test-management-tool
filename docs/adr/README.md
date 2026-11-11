# Architecture decision records

| ADR                                          | Decision                                                                                  |
| -------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [001](001-monorepo-nextjs-nestjs-prisma.md)  | Monorepo: Next.js + NestJS + Prisma (current stack)                                       |
| [002](002-template-based-report-export.md)   | Test reports are produced by filling the team's controlled Excel template                 |
| [003](003-run-case-snapshots.md)             | Runs snapshot test-case content; results live on the run case with an append-only history |
| [004](004-auth-sessions.md)                  | Local accounts with server-side sessions in PostgreSQL; AD-ready provider boundary        |
| [005](005-excel-import-and-custom-fields.md) | Server-side Excel import engine; suite-level custom fields stored as JSONB                |
| [006](006-steps-and-shared-steps.md)         | Step-by-step cases, shared steps and step results                                         |
| [007](007-api-tokens.md)                     | Personal API tokens and the public REST API                                               |
| [008](008-jira-integration.md)               | Jira integration and secret storage                                                       |
| [009](009-reports-from-history.md)           | Reports are computed on request from runs, results history and defects                    |
| [010](010-junit-import.md)                   | Automation results via JUnit XML upload into a run                                        |

Records 002–010 were written for the first (Fastify/Drizzle) implementation. The decisions are
unchanged; where they name a framework, read the NestJS/Prisma equivalent (see ADR-001).
