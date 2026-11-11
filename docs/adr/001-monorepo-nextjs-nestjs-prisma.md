# ADR-001: pnpm monorepo — Next.js frontend, NestJS REST API, Prisma on PostgreSQL

**Status:** Accepted (supersedes the original "Fastify + React SPA + Drizzle" stack decision)
**Feature:** refactor of the Test Management Tool

## Context

The first version was a single-package modular monolith (Fastify API serving a Vite/React SPA,
Drizzle ORM). The team asked to keep the approved design and behaviour but move to a structure that
is easier to hand over and extend: Next.js for the frontend, NestJS for the backend, REST, Prisma
(with Prisma Studio) for the database, shadcn/ui components, a monorepo, clean code and no
hard-coded configuration. It still runs on-premise (up to ~100 users, one server).

## Decision

- **Monorepo** with pnpm workspaces and Turborepo: `apps/api`, `apps/web`, `packages/shared`,
  `packages/database`, `packages/excel`, `packages/jest-config`, `packages/tsconfig`.
- **`packages/shared` is the single contract**: enums, labels, Zod request schemas, response DTO
  types and pure domain logic. The API validates input with these schemas (Standard Schema
  validation pipe); the web forms use the same schemas through a form resolver. No DTO or enum is
  redefined in an app.
- **NestJS 12 (ESM, Express 5)** exposes REST under `/api/v1` with one module per feature
  (controller → service → queries/mapper). OpenAPI/Swagger is generated from the controllers and
  extended with `x-min-role` and `x-error-codes`; the web "REST API" page renders that document.
- **Prisma 7** (`prisma-client` generator, `adapter-pg`) owns the schema and SQL migrations in
  `packages/database`; `PrismaService` is the only client. Multi-step changes run in transactions
  that also write the activity log.
- **Next.js 16 (App Router)** + shadcn/ui (Radix) + Tailwind 4 + TanStack Query. The browser talks
  only to Next.js; `src/proxy.ts` forwards `/api/*` to the API (`API_URL` at runtime), so the
  session cookie stays first-party and no CORS is needed. Signed-out visitors are redirected to
  `/login` early.
- **Configuration only from environment variables**, validated at start-up (`env.schema.ts`);
  `.env.example` documents every variable. Domain constants live in `@tmt/shared`.
- **Jest 30 everywhere** (native ESM for the Node workspaces, `next/jest` + jsdom + Testing Library
  for the web). API unit tests use a mocked Prisma; e2e tests use a real PostgreSQL database.
- **Delivery**: Docker Compose (db → migrate → api → web) and the same images on a plain host; CI
  runs format, lint, typecheck, build, unit tests with coverage, e2e and the image builds.

## Alternatives considered

| Alternative                         | Why not                                                                            |
| ----------------------------------- | ---------------------------------------------------------------------------------- |
| Keep Fastify + Drizzle, only add UI | Does not meet the requested stack; no Prisma Studio                                |
| Next.js route handlers as the API   | Mixes UI and API lifecycles; Nest gives modules, guards and OpenAPI out of the box |
| Separate repos for web and API      | Duplicated contract; the shared Zod package is the main benefit of one repo        |
| `@nestjs/throttler` for rate limits | CommonJS build breaks Jest's native ESM; a small in-house guard is enough          |

## Consequences

- One `pnpm install`, one `pnpm test`, one place for the contract; changing a DTO breaks the
  compile of both apps at once.
- Two processes to run (api + web) instead of one bundle — mitigated by Docker Compose.
- Prisma migrations are applied explicitly (`pnpm db:deploy` / the `migrate` compose service), not
  on API start.
- ADR-002 … ADR-010 below describe domain decisions (reports, snapshots, auth, import, steps,
  tokens, Jira, history, JUnit). They were written for the first implementation; the decisions
  hold unchanged, only the framework names differ.
