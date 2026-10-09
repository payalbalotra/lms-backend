# Agent.md

Rules for AI agents and developers working on the **LMS backend** (Alimentaria Mexicana). Read this before changing code. Follow it exactly; when the code and this file disagree, fix the code or ask, do not invent a third way.

README.md explains what the system does. This file explains **where code goes, how it is named, and how it must be written**.

---

## 0. Ground rules (read first)

1. **Never change an existing API request or response format.** Field names, nesting, status codes, messages and error codes are a contract with the frontend. A bug fix may turn a wrong status into the right one (for example a 500 into a 400), but must not reshape a body. If a fix needs a format change, stop and ask.
2. **No endpoint may return 500 for bad input.** Validate input at the edge; map known database errors (see section 7). A 500 is only for genuine server faults.
3. **Do not create git commits, branches or pushes.** The project is shared as a zip, not through GitHub.
4. **Do not add dependencies** unless there is no reasonable way without them.
5. **Design and product questions are collected, not asked one by one.** Note them with the problem, the options and how each would be done, and raise them together.
6. After every change run, in this order: `pnpm typecheck`, `pnpm lint`, `pnpm test:e2e` (section 10). All three must pass.
7. Documentation: plain dashes (`-`) only, no em or en dashes.

---

## 1. Stack

| Concern       | Choice                                                              |
| ------------- | ------------------------------------------------------------------- |
| Runtime       | Node.js 20+ (ESM, `"type": "module"`)                               |
| Language      | TypeScript 6, strict                                                |
| Web framework | Express 5                                                           |
| Database      | PostgreSQL with the `postgres` (postgres.js) driver                 |
| ORM           | Drizzle ORM, migrations with drizzle-kit                            |
| Auth          | Better Auth (email + password, magic link, email OTP, bearer token) |
| Validation    | Zod v4                                                              |
| Logging       | pino (`src/config/logger.ts`)                                       |
| Email         | Resend                                                              |
| Files         | Cloudflare R2 through `@aws-sdk/client-s3`                          |
| Package mgr   | pnpm                                                                |

Commands: see the Scripts table in README.md.

---

## 2. Folder structure

```
src/
|-- index.ts            Starts the server. Nothing else.
|-- app.ts              Express app: middleware order, health routes, error chain
|-- routes.ts           /api/v1 router: one line per module
|-- config/             Settings only
|   |-- env.ts          Loads + validates env with Zod, exports `config`
|   `-- logger.ts       pino `logger`
|-- db/
|   |-- client.ts       `db`, `sql`, `closeDb`, `Tx` type
|   `-- schema/         Drizzle tables only, one <name>.schema.ts per table group
|       `-- index.ts    Re-exports every schema file (drizzle-kit reads this)
|-- lib/                Clients for outside services (Better Auth, R2, Resend)
|-- middleware/         Express middleware shared by many routes
|-- shared/             Small helpers with no knowledge of any feature
|-- modules/<feature>/  Everything for one feature (section 3)
`-- types/              Global type augmentation (Express Request) and .d.ts files
tests/e2e/              End-to-end tests, one <feature>.test.mjs per module
scripts/                One-off and maintenance scripts (seed, admin:promote)
drizzle/migrations/     Generated SQL, never edited by hand
```

What goes where:

| Kind of code                                | Place                                                                                        |
| ------------------------------------------- | -------------------------------------------------------------------------------------------- |
| A table definition                          | `src/db/schema/<name>.schema.ts`                                                             |
| Request validation (Zod) for one feature    | `src/modules/<feature>/<feature>.validation.ts`                                              |
| Validation reused by many features (uuid)   | `src/shared/common.validation.ts`                                                            |
| Business rules and **all** database queries | `src/modules/<feature>/<feature>.service.ts`                                                 |
| Turning a DB row into a response object     | `src/modules/<feature>/<feature>.mapper.ts` (or a `public<Thing>()` function in the service) |
| HTTP handling                               | `src/modules/<feature>/<feature>.controller.ts`                                              |
| URL paths and middleware chains             | `src/modules/<feature>/<feature>.routes.ts`                                                  |
| A client for an outside service             | `src/lib/`                                                                                   |
| Middleware used by more than one module     | `src/middleware/`                                                                            |
| An environment variable                     | `src/config/env.ts` (nowhere else)                                                           |

Rules:

- **Each folder holds one kind of thing.** `config/` holds settings, not middleware. `db/schema/` holds tables, not Zod. If a file fits nowhere, ask before creating a new top level folder.
- A sub-resource that only exists inside a parent lives in the parent's module (subcategories live in `modules/categories/`).
- Modules may import from `db/`, `lib/`, `middleware/`, `shared/`, `config/`, and from another module's **service, validation or mapper**. A module never imports another module's controller or routes.

---

## 3. A feature module

```
src/modules/jobs/
|-- jobs.routes.ts       path + verb + middleware chain + handler. No logic.
|-- jobs.controller.ts   read req, call the service, send the response
|-- jobs.service.ts      business rules, Drizzle queries, throws ApiError
|-- jobs.validation.ts   Zod schemas (+ inferred input types)
`-- jobs.mapper.ts       (optional) row -> response shape
```

Dependencies flow one way: **routes -> controller -> service -> db**.

- A **controller** never imports `db`, `drizzle-orm` or a table. It never contains business branching.
- A **service** never touches `req` or `res` (the one exception: Better Auth calls that need request headers receive `req`). It returns data, never an HTTP body.
- A new module is mounted with one line in `src/routes.ts`.

---

## 4. Naming

| Thing                   | Rule                                                                                    | Example                             |
| ----------------------- | --------------------------------------------------------------------------------------- | ----------------------------------- |
| Module folder           | plural, kebab-case, matches the URL segment                                             | `modules/quizzes/` for `/quizzes`   |
| Module files            | `<module>.<role>.ts`; role is `routes`, `controller`, `service`, `validation`, `mapper` | `quizzes.service.ts`                |
| Table files             | `db/schema/<name>.schema.ts`, plural                                                    | `employees.schema.ts`               |
| Middleware, lib, shared | kebab-case, no suffix                                                                   | `require-roles.ts`, `api-error.ts`  |
| Tests                   | `tests/e2e/<module>.test.mjs`                                                           | `jobs.test.mjs`                     |
| Functions, variables    | camelCase, verb first                                                                   | `listJobs`, `createJob`             |
| Types, classes          | PascalCase                                                                              | `PublicJob`, `ApiError`             |
| Constant lists          | camelCase or UPPER for enums-as-arrays                                                  | `ROLES`, `procedureStatuses`        |
| DB columns              | camelCase in TS, snake_case in SQL                                                      | `stationIds: uuid('station_ids')`   |
| Zod schemas             | `<thing><Action>Schema`                                                                 | `jobCreateSchema`, `jobPatchSchema` |
| Error codes             | UPPER_SNAKE_CASE                                                                        | `STATION_NOT_FOUND`                 |

`*.schema.ts` means a **database table** file and nothing else. Zod files are always `*.validation.ts`.

Import a service as a namespace in controllers: `import * as jobsService from './jobs.service.ts'`.

---

## 5. TypeScript and style

Enforced by `tsconfig.json`, ESLint and Prettier:

- **Local imports use the `.ts` extension**: `import config from '../../config/env.ts'`.
- `verbatimModuleSyntax`: type-only imports use `import type` / `type`.
- `erasableSyntaxOnly`: no `enum`, no namespaces, no constructor parameter properties. Use `as const` arrays plus union types (see `ROLES`).
- `noUncheckedIndexedAccess`: `const [row] = await db...; if (!row) throw ...`. Avoid `!`.
- `exactOptionalPropertyTypes`: omit a key instead of setting it to `undefined`.
- No `any`. If truly unavoidable, a targeted `eslint-disable-next-line` with a reason.
- Prettier: single quotes, semicolons, trailing commas, 2 spaces, 80 columns.
- Comments explain **why**, not what. Match the comment density of the file you edit.

---

## 6. Routes, controllers, validation

Routes:

```ts
const jobsRoute: Router = express.Router(); // explicit type is required
jobsRoute.post(
  '/',
  requireAuth,
  requireRoles(['super_admin']),
  createLimiter({
    limit: 20,
    message: 'Too many jobs created, please try again later.',
  }),
  jobsController.createJob,
);
export default jobsRoute;
```

- Order: `requireAuth` -> `requireRoles([...])` -> `createLimiter(...)` -> `validate(...)` -> handler.
- Rate limit every write and every auth endpoint.
- Register static paths before parameter paths (`/filter` before `/:slug`).

Controllers:

- Wrap every handler in `catchAsync` (Express 5 does forward rejections, but `catchAsync` is the project convention).
- Success: `res.status(code).json(ApiResponse.success('<what happened>', data))`. Messages describe the operation.
- No `try/catch` for flow control; throw and let the error middleware answer.

Validation:

- Every `:id` route param is checked with `uuidIdParam` / `uuidString` from `src/shared/common.validation.ts` **before** any query. On failure throw `ApiError('Invalid <thing> id', 400, true, '', { code: 'INVALID_INPUT' })`.
- Request bodies are parsed with the module's Zod schema. Existing controllers do `schema.safeParse(req.body)` and `throw parsed.error`; the auth routes use the `validate()` middleware. The two produce slightly different error bodies, so **keep each existing endpoint as it is**. New endpoints use the `validate()` / `validateQuery()` / `validateParams()` middleware.
- Arrays of ids are lowercased and de-duplicated in the schema (see `uuidList` in `employees.validation.ts`).
- Trim strings in the schema (`z.string().trim()`), unless the service already trims and returns its own error (categories).
- Body size limit is 2 MB (`express.json` in `app.ts`).

---

## 7. Errors and responses

Response bodies (do not invent new shapes):

| Case                  | Body                                                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Success               | `{ success: true, message, data }`                                                                                      |
| ApiError / validation | `{ success: false, code, message, errors? }`                                                                            |
| Legacy (do not add)   | `{ error: { code, message } }` - still used by `require-auth`, `require-roles`, `not-found` and a few 409s in employees |

Throwing:

```ts
throw Object.assign(new ApiError('Station not found', 404), {
  errorCode: 'STATION_NOT_FOUND',
});
// or, equivalent:
throw new ApiError('Station not found', 404, true, '', {
  code: 'STATION_NOT_FOUND',
});
```

- Always give a machine-readable `UPPER_SNAKE_CASE` code.
- `isOperational = false` for genuine bugs; production hides their message behind a generic 500.
- `error-handler.ts` already maps: Zod errors -> 400 `VALIDATION_ERROR`; bad JSON -> 400; body too large -> 413; Postgres `22P02` -> 400 `INVALID_INPUT`; `23503` / `23505` -> 409 `CONFLICT`; multer errors -> 400. This is a safety net; validate first so users get a specific message.
- Never send SQL, stack traces or upstream error text to the client. Log them.
- An outside service that is down is `502`; one that is not configured is `503` (see `uploads.service.ts`).

---

## 8. Database

Schema:

- One `pgTable` per concept in `src/db/schema/<name>.schema.ts`, re-exported from `src/db/schema/index.ts` (drizzle-kit only sees what that file exports).
- Ids are `uuid('id').defaultRandom().primaryKey()`. **Exception:** Better Auth tables (`user`, `session`, `account`, `verification`) use text ids, so every column referencing `user.id` is `text`.
- `created_by` columns reference **`user.id`**. Fill them with `req.employee.userId`, never `req.employee.id` (the super admin has no employee row, so its `employee.id` is `''`).
- Index every foreign key and every column used in a frequent `WHERE` or `ORDER BY`.
- `uuid[]` columns (`jobs.station_ids`, `employees.job_ids`, `employees.station_ids`, `procedures.assign_users`) have **no foreign key**. So: check every id exists before saving, and remove the id from these arrays when the referenced row is deleted (see `deleteStation`).

Queries (performance rules):

- Writes return the row: `insert(...).returning()`, `update(...).returning()`, `delete(...).returning({ id })`. Never re-select after a write. No row back = not found.
- Check several things in **one** query (see `assertReferences` in `employees.service.ts`, `assertLinks` in `procedures.service.ts`), not one query per check.
- List endpoints: run the page query and the count with `Promise.all`, always `orderBy(<column>, <table>.id)` so pages are stable, and use `getPaginationParams` / `formatPaginatedResult` from `src/shared/pagination.ts`.
- Multi-table writes go in `db.transaction(async (tx) => ...)`.
- Status changes are one atomic `UPDATE ... WHERE id = $1 AND status <> ...`; only on "no row" run a second query to tell 404 from 409 (see `archiveProcedure`).
- Never build SQL by string concatenation; use Drizzle helpers or the `sql` template.

Migrations:

1. Edit a file in `src/db/schema/`.
2. `pnpm db:generate` and read the generated SQL in `drizzle/migrations/`.
3. `pnpm db:migrate`.

Never edit a generated migration. Data changes (backfills) do not belong in migrations; put them in a script under `scripts/`. Default data belongs in the seed (`pnpm db:seed`). The history was squashed to `0000_baseline.sql` during development.

---

## 9. Auth, config, outside services

- **Auth**: `requireAuth` (`src/middleware/require-auth.ts`) resolves the Better Auth session (cookie or `Authorization: Bearer`), loads the employee and sets `req.employee`. `requireRoles([...])` checks the role. Roles: `super_admin`, `manager`, `employee`.
- **Super admin** = a Better Auth user with `user.role = 'super_admin'` and **no** employee row (`req.isSuperAdmin`, `req.employee.id === ''`). Grant it only with `pnpm admin:promote <email>`; sign-up can never set it. A user with neither an employee row nor that role gets 403.
- Anything that writes a password itself must hash it with `hashPassword` from `better-auth/crypto`; Better Auth verifies with scrypt.
- **Config**: every env var is declared in the Zod schema in `src/config/env.ts` and read as `config.<name>`. `process.env` appears nowhere else in `src/`. Add new variables to README's environment table too.
- **Logging**: use `logger` from `src/config/logger.ts`. Never log tokens, cookies, passwords, invite links or full request headers.
- **Email**: `src/lib/email/` (Resend client and templates). Sending failures are logged, never thrown to the user.
- **Files**: `src/lib/storage.ts` (`putObject`, `publicUrlFor`). Keys are generated by the server; the client's file name contributes only a sanitised extension.

---

## 10. Testing

- End-to-end suites live in `tests/e2e/<module>.test.mjs`, helpers in `tests/e2e/lib.mjs`.
- `pnpm test:e2e` (or `pnpm test:e2e jobs locations`) runs them. It needs `DATABASE_URL` pointing at a migrated and seeded database. For each suite the runner starts a fresh API server with email disabled and uploads going to a local fake S3, so tests never touch real R2 or send real email.
- Every change to an endpoint adds or updates cases in its suite: the happy path, missing/blank/wrong-type fields, malformed JSON, a non-uuid id, an unknown uuid, no auth, the wrong role, and anything the change fixes.
- A suite fails if any check fails. A response with status >= 500 is always a failure.
- Before and after a change, compare the response bodies of the touched endpoints; only the intended fix may differ.

---

## 11. Adding a feature (checklist)

For a feature called `shifts`:

1. `src/db/schema/shifts.schema.ts` (tables, indexes) and export it from `src/db/schema/index.ts`.
2. `pnpm db:generate`, review the SQL, `pnpm db:migrate`.
3. `src/modules/shifts/shifts.validation.ts` - Zod schemas and inferred types.
4. `src/modules/shifts/shifts.service.ts` - queries and rules, `ApiError` on failure.
5. `src/modules/shifts/shifts.controller.ts` - `catchAsync` handlers returning `ApiResponse.success`.
6. `src/modules/shifts/shifts.routes.ts` - paths, auth, roles, rate limits, handlers.
7. One line in `src/routes.ts`.
8. `tests/e2e/shifts.test.mjs`, and add `'shifts'` to the list in `tests/e2e/run.mjs`.
9. Update README (API reference, and environment table if you added variables).
10. `pnpm typecheck && pnpm lint && pnpm test:e2e`.
