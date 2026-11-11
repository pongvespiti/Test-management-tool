# Test Management Tool (TMT)

On-premise web application to manage **test cases, test plans, test runs, defects and reports** of a
team — a refactor of the original single-package tool into a typed monorepo, keeping the approved
design.

|          |                                                                                  |
| -------- | -------------------------------------------------------------------------------- |
| Frontend | Next.js 16 (App Router) · React 19 · shadcn/ui · Tailwind CSS 4 · TanStack Query |
| Backend  | NestJS 12 · REST + OpenAPI (Swagger UI) · Zod validation shared with the web     |
| Database | PostgreSQL 16 · Prisma 7 (migrations, Prisma Studio)                             |
| Tooling  | pnpm workspaces · Turborepo · TypeScript (strict) · Jest 30 · oxlint · Prettier  |

## Repository layout

```
apps/
  api/            NestJS REST API (modules: auth, projects, library, execution, defects, …)
  web/            Next.js web app (feature folders, shadcn/ui components)
packages/
  shared/         contract used by both apps: enums, labels, Zod schemas, DTO types, domain logic
  database/       Prisma schema, SQL migrations, typed client factory
  excel/          Excel/CSV/JUnit parsing and report generation
  jest-config/    shared Jest presets
  tsconfig/       shared TypeScript configs
docs/             architecture, data model (ERD), deployment, conventions, ADRs
```

Read [docs/architecture.md](docs/architecture.md) first, then [docs/conventions.md](docs/conventions.md).

## Quick start (development)

Requirements: Node.js ≥ 22.12, pnpm 10 (`corepack enable`), PostgreSQL 16 with an empty database.

```bash
cp .env.example .env                 # set DATABASE_URL (and SEED_USER_PASSWORD if you like)
pnpm bootstrap                       # install → Prisma client → build → migrate → demo data
pnpm dev                             # API on :4000, web on :3000
```

`pnpm bootstrap` is the same as running, one after the other:

| Step               | What it does                                                              |
| ------------------ | ------------------------------------------------------------------------- |
| `pnpm install`     | installs every dependency of the monorepo (locked by `pnpm-lock.yaml`)    |
| `pnpm db:generate` | generates the Prisma client (downloads the Prisma engines the first time) |
| `pnpm build`       | builds the shared packages, the API and the web app                       |
| `pnpm db:deploy`   | applies the SQL migrations to `DATABASE_URL`                              |
| `pnpm db:seed`     | creates the demo project and the demo accounts                            |

Open <http://localhost:3000> and sign in with a demo account:

| Account        | Role in the demo project | Password                                             |
| -------------- | ------------------------ | ---------------------------------------------------- |
| `demo.lead`    | lead                     | `SEED_USER_PASSWORD`, or the one printed by the seed |
| `demo.manager` | manager                  | same                                                 |
| `demo.tester`  | tester                   | same                                                 |
| `demo.viewer`  | viewer                   | same                                                 |

The seed needs no running server and can be repeated (an existing demo project is left alone).
The administrator account (`admin`) is created at the first start: with an empty
`INITIAL_ADMIN_PASSWORD` its one-time password is printed in the log (by the seed or by the API,
whichever starts first) and must be changed at first sign-in.

Swagger UI is at <http://localhost:4000/api/docs>; browse the database with `pnpm db:studio`
(Prisma Studio).

## Docker (one server)

```bash
cp .env.example .env                 # set POSTGRES_PASSWORD, APP_SECRET, WEB_ORIGINS, COOKIE_SECURE
docker compose up -d --build         # db → migrate → api → web
docker compose logs api | grep -i password   # first administrator password (if not preset)
docker compose exec api node dist/scripts/seed.js   # optional demo data
```

See [docs/deployment.md](docs/deployment.md) for HTTPS, backups and upgrades.

## Everyday commands

| Command                             | What it does                                                  |
| ----------------------------------- | ------------------------------------------------------------- |
| `pnpm bootstrap`                    | install, generate, build, migrate and seed in one go          |
| `pnpm dev`                          | API + web in watch mode                                       |
| `pnpm db:seed`                      | demo project and demo accounts (repeatable)                   |
| `pnpm db:studio`                    | Prisma Studio on the database of `DATABASE_URL`               |
| `pnpm build`                        | build every workspace (Turborepo, cached)                     |
| `pnpm typecheck` · `pnpm lint`      | TypeScript and oxlint across the monorepo                     |
| `pnpm format` · `pnpm format:check` | Prettier                                                      |
| `pnpm test` · `pnpm test:cov`       | Jest unit tests (API with mocked Prisma, web with jsdom)      |
| `pnpm test:e2e`                     | API end-to-end tests against `TEST_DATABASE_URL` (PostgreSQL) |
| `pnpm db:migrate`                   | create a migration after editing `schema.prisma` (dev only)   |
| `pnpm db:deploy`                    | apply pending migrations (production)                         |

> The e2e tests **drop and re-create** the schema of `TEST_DATABASE_URL` — never point it at a
> database you care about.

## Configuration

Everything is configured through environment variables, validated at start-up — see the
documented [.env.example](.env.example) (API, database, sessions, limits) and
[apps/web/.env.example](apps/web/.env.example) (`API_URL`). Nothing is hard-coded; domain
constants (statuses, labels, limits) live in `packages/shared`.

The document number of test plans follows `DEFAULT_DOC_NO_PATTERN` (default
`{YY}TR-TEAM-{MM}-{SEQ}` — replace `TEAM` with your own code in `.env`); a lead can change the
pattern of a project at any time under **Settings → General**.

## Security notes

- Sign-in with username/password (scrypt hashes), HTTP-only session cookie, CSRF header check,
  login rate limit and lock-out, forced password change for initial/reset passwords.
- API tokens (hash stored, shown once) for automation; they cannot reach session-only endpoints.
- Integration secrets (Jira token) are encrypted with `APP_SECRET`.
- Project roles (viewer · manager · tester · lead) enforced on every route; administrators manage users.

## Contributing

Follow [docs/conventions.md](docs/conventions.md). CI (`.github/workflows/ci.yml`) runs format,
lint, typecheck, build, unit tests with coverage, API e2e tests and the Docker builds.
