# Coding conventions

Rules every change follows. They keep the monorepo consistent so that any developer (or reviewer)
finds code where they expect it. When something is not covered here, follow the closest existing
example in the same workspace.

## General

- **TypeScript strict everywhere**, ES modules only. No `any` (use `unknown` + narrowing).
- **No hard-coded configuration.** URLs, ports, limits, secrets and defaults come from environment
  variables validated at start-up (`apps/api/src/config/env.schema.ts`, `apps/web/src/lib/env.ts`).
  Domain constants (statuses, labels, limits that are part of the contract) live in `@tmt/shared`.
- **One source of truth for the contract:** request schemas (Zod), response DTO types, enums, labels
  and pure domain logic are in `packages/shared`. The API validates with these schemas, the web forms
  use the same schemas. Never redefine a DTO or an enum in an app.
- **English** for code, comments, UI texts and commit messages.
- Formatting by Prettier (`pnpm format`), linting by oxlint (`pnpm lint`). Comments explain _why_,
  not _what_. Public functions get a one-line doc comment.
- File names: `kebab-case.ts(x)`. React components `PascalCase`, hooks `useCamelCase`.

## API (`apps/api`, NestJS)

```
src/
  common/            cross-cutting: decorators, guards, errors, http helpers, security, types
  config/            env schema + typed AppConfig (inject `AppConfig`, never read process.env)
  prisma/            PrismaService (one client) — `this.prisma.db`
  modules/<feature>/
    <feature>.module.ts       Nest module (controllers + providers + exports)
    <feature>.controller.ts   HTTP only: routes, decorators, validation, no business logic
    <feature>.service.ts      use cases (transactions, activity log, error codes)
    <feature>.queries.ts      reusable read helpers `(db: Db, …)` shared with other modules
    <feature>.mapper.ts       Prisma row → DTO (pure functions)
    *.spec.ts                 unit tests next to the code
test/                e2e tests (`*.e2e-spec.ts`) + helpers, unit-test fixtures in test/unit
```

- **Controllers**: one route per method, `@ProjectPermission('<permission>')` on every project
  route (permission keys and minimum roles are in `PERMISSIONS` of `@tmt/shared`),
  `@AdminOnly()` for administration, `@SessionOnly()` where API tokens must not be accepted,
  `@ApiErrorCodes(...)` listing the domain error codes the route can return.
- **API reference**: every route has an entry in `src/modules/openapi/route-docs.ts` (section,
  title, notes, success response). Roles, parameters and bodies are generated from the decorators;
  `test/openapi.e2e-spec.ts` fails when a route is undocumented or an entry is stale.
- **Validation**: `@Body({ schema })`, `@Query({ schema })`, `@Param('x', ID)` with the shared Zod
  schemas — never validate by hand in controllers.
- **Errors**: throw `AppException` helpers (`notFound`, `conflict`, `unprocessable`, `forbidden`,
  …) with a stable `UPPER_SNAKE` code. The global filter renders `{ error: { code, message, details? } }`.
  Unique-constraint violations are mapped with `isUniqueViolation(e, 'constraint_name')`.
- **Data access**: Prisma only (no raw SQL unless a query cannot be expressed; then
  `$queryRaw` with tagged-template parameters — never string concatenation). Multi-step changes run
  in `this.prisma.db.$transaction(async (tx) => …)` and pass `tx` down.
- **Audit**: every change writes an activity entry with `ActivityService.log(tx, …)` in the same
  transaction.
- **Project scoping**: every query on project data filters by the project id from
  `@CurrentProject()`; ids from the URL or body that belong to another project are `404`/`422`.
- **Cross-module use**: import plain functions from another module's `*.queries.ts` /
  `*.mapper.ts`, or inject an exported service. Never import another module's controller.
- **ESM**: relative imports end in `.js` (NodeNext). Only add dependencies that ship ESM or plain
  CommonJS without requiring ESM-only packages (Jest runs in native ESM mode).

## Web (`apps/web`, Next.js App Router)

```
src/
  app/                 routes only: page.tsx renders one feature component + `metadata`
  features/<feature>/  pages and components of one feature (`<feature>-page.tsx`, dialogs, tables,
                       helpers `*.ts`, hooks `use-*.ts`, tests `*.test.tsx`)
  components/ui/       shadcn/ui primitives (generated style; change only for design tokens)
  components/common/   shared app components (status pills, page header, section tree, …)
  components/layout/   app shell (header, sidebar, project switcher, user menu)
  lib/api/             REST client + React Query hooks per resource (`qk` keys in keys.ts)
  lib/                 routes, forms, formatting, status colours, storage helpers
  providers/           auth, project, React Query providers
  test/                Jest setup, render helpers, mocks
```

- **Shared code**: anything used by more than one feature lives outside `features/` — UI building
  blocks in `components/common` (list controls, combobox, multi-select, status pills …), hooks in
  `hooks/`, helpers in `lib/`. A feature may import another feature only for its domain parts
  (e.g. runs ↔ defects, the `collab` comment and attachment panels), never for generic helpers.
- **Design**: keep the approved mockup — page header + cards on the grey page, the palette in
  `src/app/globals.css`, status colours from `src/lib/status.ts`, lucide icons (1.8 stroke in the
  navigation). Build with shadcn/ui primitives and Tailwind utility classes; no inline style
  objects except dynamic colours.
- **Data**: components never call `fetch`; use the hooks in `src/lib/api/*` (React Query).
  Mutations invalidate the related `qk` keys.
- **Forms**: `react-hook-form` + `formResolver(sharedSchema)` + `Form*` components from
  `components/ui/form`. Map server error codes (e.g. `PROJECT_KEY_TAKEN`) to field errors with
  `form.setError`, other failures to `notifyError`.
- **Links**: build every URL with `routes` from `src/lib/routes.ts`. URL state (filters, selected
  item) lives in search params; components that read them sit below a `<Suspense>` boundary.
- **Permissions**: hide or disable actions with `useProject().can('<permission>')` — the API
  enforces them anyway.
- **Feedback**: `notifySuccess` / `notifyError` toasts, `confirmDelete` / `confirmAction` dialogs,
  `QueryState` for loading/error, `EmptyState` for empty lists.

## Tests (Jest everywhere)

| Workspace    | Command                           | Kind                                                 |
| ------------ | --------------------------------- | ---------------------------------------------------- |
| `apps/api`   | `pnpm --filter @tmt/api test`     | unit `src/**/*.spec.ts` (Prisma mocked)              |
| `apps/api`   | `pnpm --filter @tmt/api test:e2e` | e2e `test/*.e2e-spec.ts` (real PostgreSQL)           |
| `apps/web`   | `pnpm --filter @tmt/web test`     | unit `src/**/*.test.ts(x)` (jsdom + Testing Library) |
| `packages/*` | `pnpm --filter @tmt/<pkg> test`   | unit `test/**/*.test.ts`                             |

- Import the Jest API explicitly: `import { describe, expect, it, jest } from '@jest/globals'`.
- **API unit tests** construct services directly with `createPrismaMock()` (test/unit) and fake
  collaborators; assert the Prisma calls that matter (where clauses, data written) and the error
  codes. **E2E tests** use `createTestApp()`, `createUser()`, `login()` from `test/helpers.ts`.
- **Web tests** render with `renderWithProviders()` (`src/test/render.tsx`), stub `fetch` with
  `jsonResponse(...)`, and drive the UI with `user` (Testing Library user-event). `next/navigation`
  is replaced by `src/test/mocks/next-navigation.ts` (`setNavigation`, `mockRouter`).
- Test behaviour, not implementation details: what the user sees and which request is sent.
- Every new module/page comes with tests; pure helpers aim for full branch coverage.

## Git

- Small commits with an imperative subject (`feat(api): add shared steps`), body explaining why.
- Never commit `.env`, real customer workbooks/reports or generated folders (see `.gitignore`).
