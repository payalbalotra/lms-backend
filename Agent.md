# Agent.md

Guidance for Agent Code (and humans) working in the ** ims backend ** repo.
It documents how this codebase is structured, how a feature flows end to end, and the
conventions to follow when adding new code.

---

## 1. Stack

| Concern        | Choice                                                  |
| -------------- | ------------------------------------------------------- |
| Runtime        | Node.js (ESM, `"type": "module"`)                       |
| Language       | TypeScript 6 (strict, `noEmit`, `verbatimModuleSyntax`) |
| Web framework  | Express 5                                               |
| DB / ORM       | PostgreSQL via `pg` + Drizzle ORM                       |
| Migrations     | drizzle-kit                                             |
| Auth           | better-auth (Drizzle adapter, email + password)         |
| Validation     | Zod v4                                                  |
| Logging        | Winston + Morgan                                        |
| Error tracking | Sentry                                                  |
| API docs       | swagger-jsdoc + swagger-ui-express (YAML sources)       |
| Package mgr    | pnpm                                                    |
| Dev runner     | tsx watch                                               |

### Commands

```bash
pnpm dev           # tsx watch src/index.ts
pnpm build         # tsc
pnpm typecheck     # tsc --noEmit
pnpm lint          # eslint .
pnpm lint:fix      # eslint . --fix
pnpm format        # prettier --write .
pnpm db:generate   # drizzle-kit generate  (create SQL migration from schema)
pnpm db:migrate    # drizzle-kit migrate   (apply migrations)
pnpm db:studio     # drizzle-kit studio
```

Husky + lint-staged run `eslint --fix` and `prettier --write` on staged `*.ts`
before every commit. Do not bypass with `--no-verify`.

---

## 2. Folder structure

```
src/
├── index.ts                    # entrypoint — only starts the HTTP listener
├── app.ts                      # Express app: middleware order, mounts, error chain
│
├── config/                     # everything env-dependent, imported everywhere else
│   ├── index.ts                # env loading + Zod validation → default-exported `config`
│   ├── db.ts                   # pg Pool + drizzle instance (`db`)
│   ├── logger.ts               # Winston logger (`logger`)
│   └── swagger.ts              # OpenAPI spec assembly
│
├── db/
│   └── schema/
│       ├── index.ts            # barrel — re-exports every table file
│       └── auth.schema.ts      # pgTable definitions + drizzle relations
│
├── routes/v1/
│   ├── index.ts                # version router; registers `defaultRoutes` / `devRoutes`
│   └── <feature>.route.ts      # path → middleware → controller wiring only
│
├── controllers/v1/
│   └── <feature>.controller.ts # HTTP in/out only; wrapped in catchAsync
│
├── services/<feature>/
│   └── <feature>.service.ts    # business logic + DB access; throws ApiError
│
└── shared/
    ├── middlewares/            # validate, errorHandler, authenticate, upload
    ├── schemas/                # *.yaml OpenAPI definitions
    ├── utils/                  # ApiError, ApiResponse, catchAsync, auth
    └── validations/            # Zod request schemas per feature
```

**Rule:** each folder holds exactly one kind of thing. If a file does not fit
cleanly into one of these buckets, it probably belongs in a new one — do not
overload an existing folder.

---

## 3. The request lifecycle (the "structure function")

Every endpoint follows the same four-layer path. Dependencies flow **downward only**:

```
HTTP request
   │
   ▼
routes/v1/<feature>.route.ts     ── path, HTTP verb, validate(), auth middleware
   │
   ▼
controllers/v1/<feature>.controller.ts
   │                              ── catchAsync wrapper
   │                              ── read req.body / req.params / req.query
   │                              ── call ONE service function
   │                              ── res.status(...).json(ApiResponse.success(...))
   ▼
services/<feature>/<feature>.service.ts
   │                              ── business rules
   │                              ── db queries via drizzle
   │                              ── throw new ApiError(...) on failure
   ▼
db/schema/*.schema.ts            ── table definitions only, no logic
```

A **service must never import `Request`/`Response` semantics for output**, never
call `res`, and never format an HTTP body. A **controller must never contain a
DB query or business branching**. This separation is what keeps services reusable
from jobs, scripts, and other services.

---

## 4. Layer-by-layer conventions

### 4.1 Routes

```ts
// src/routes/v1/auth.route.ts
import express, { type Router } from 'express';
import {
  signUp,
  signIn,
  getSession,
} from '../../controllers/v1/auth.controller.ts';
import { validate } from '../../shared/middlewares/validate.ts';
import { registerSchema } from '../../shared/validations/auth.validation.ts';

const authRoute: Router = express.Router();

authRoute.post('/sign-up/email', validate(registerSchema), signUp);
authRoute.post('/sign-in/email', signIn);
authRoute.get('/me', getSession);

export default authRoute;
```

- One router file per feature, default-exported.
- Declare the router as `const x: Router` — the explicit type is required because
  `declaration: true` is on and Express types are otherwise not portable.
- Register it in [src/routes/v1/index.ts](src/routes/v1/index.ts) by pushing an
  entry into `defaultRoutes` (or `devRoutes` for development-only endpoints):

```ts
const defaultRoutes = [
  { path: '/auth', route: authRoute },
  { path: '/leads', route: leadRoute }, // ← new features go here
];
```

- Routes contain **no logic** — only path, middleware chain, and handler reference.
- Use the HTTP verb that matches the semantics (`GET /me`, not `POST /me`).

### 4.2 Controllers

```ts
// src/controllers/v1/auth.controller.ts
import type { Request, Response } from 'express';
import httpStatus from 'http-status';
import catchAsync from '../../shared/utils/catchAsync.ts';
import ApiResponse from '../../shared/utils/ApiResponse.ts';
import { getSessionService } from '../../services/auth/auth.service.ts';

export const getSession = catchAsync(async (req: Request, res: Response) => {
  const session = await getSessionService(req);
  return res
    .status(httpStatus.OK)
    .json(ApiResponse.success('Session fetched successfully', session));
});
```

Rules:

- **Always** wrap in `catchAsync` — this is what forwards rejections to the error
  chain. A bare `async` handler that throws will hang the request in Express 5.
- Named exports, one per endpoint. No default export.
- Always use `httpStatus.*` constants, never raw numbers.
- Always wrap the payload in `ApiResponse.success(message, data)` so every
  endpoint returns the same envelope: `{ success, message, data }`.
- Extract only what the service needs — prefer passing plain values
  (`getUserService(req.params.id)`) over the whole `req` object. Pass `req` only
  when the service genuinely needs headers/cookies (e.g. better-auth session reads).
- No `try/catch` — throw and let `errorConverter` / `errorHandler` deal with it.

### 4.3 Services

```ts
// src/services/lead/lead.service.ts
import httpStatus from 'http-status';
import { eq } from 'drizzle-orm';
import { db } from '../../config/db.ts';
import { leads } from '../../db/schema/lead.schema.ts';
import ApiError from '../../shared/utils/ApiError.ts';

export const getLeadByIdService = async (id: string) => {
  const [lead] = await db.select().from(leads).where(eq(leads.id, id));

  if (!lead) {
    throw new ApiError('Lead not found', httpStatus.NOT_FOUND, true);
  }

  return lead;
};
```

Rules:

- One folder per domain: `src/services/<domain>/<domain>.service.ts`.
- Named exports; suffix each function with `Service` to keep call sites readable
  in controllers (`signUpService`, `getLeadByIdService`).
- Return **domain data**, not HTTP responses.
- Signal failure by `throw new ApiError(message, statusCode, isOperational)`.
  `isOperational: true` means "expected, safe to show the client". Leave it
  `false` (or let the converter default it) for genuine bugs — in production the
  handler masks non-operational errors as a generic 500.
- All DB access lives here. Import `db` from [src/config/db.ts](src/config/db.ts)
  and tables from [src/db/schema/](src/db/schema/).
- A service may call another service. It may not call a controller.

### 4.4 Validation

Zod schemas live in `src/shared/validations/<feature>.validation.ts` and are
applied in the route via the middleware in
[src/shared/middlewares/validate.ts](src/shared/middlewares/validate.ts):

- `validate(schema)` → `req.body`
- `validateQuery(schema)` → `req.query`
- `validateParams(schema)` → `req.params`

```ts
// src/shared/validations/lead.validation.ts
import { z } from 'zod';

export const createLeadSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email format'),
  phone: z.string().optional(),
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;
```

Export the inferred type alongside the schema and use it as the service's
parameter type — that keeps validation and business types from drifting apart.

Validate at the **edge** (route middleware). Services may assume their inputs
are shaped correctly; they still enforce _business_ rules (existence, ownership,
state transitions).

### 4.5 Database schema & migrations

```ts
// src/db/schema/lead.schema.ts
import { relations } from 'drizzle-orm';
import { pgTable, text, timestamp, index } from 'drizzle-orm/pg-core';
import { user } from './auth.schema.ts';

export const leads = pgTable(
  'leads',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('leads_ownerId_idx').on(table.ownerId)],
);

export const leadRelations = relations(leads, ({ one }) => ({
  owner: one(user, { fields: [leads.ownerId], references: [user.id] }),
}));
```

Conventions taken from [src/db/schema/auth.schema.ts](src/db/schema/auth.schema.ts):

- **camelCase in TS, snake_case in SQL** — always pass the column name explicitly:
  `emailVerified: boolean('email_verified')`.
- Every table gets `createdAt` / `updatedAt`; `updatedAt` uses
  `.$onUpdate(() => new Date())`.
- Index every foreign key: `index('<table>_<column>_idx').on(table.column)`.
- Declare `relations(...)` next to the tables they connect.
- Re-export the new file from [src/db/schema/index.ts](src/db/schema/index.ts) —
  drizzle.config.ts points at that barrel, so a table not exported there will
  **not** appear in generated migrations.
- Workflow: edit schema → `pnpm db:generate` → review the SQL in `drizzle/` →
  `pnpm db:migrate`. Never hand-edit generated migration files; regenerate instead.

### 4.6 Config & environment

All env access goes through [src/config/index.ts](src/config/index.ts). It loads
`<NODE_ENV>.env`, validates with Zod, and throws at boot if anything is missing.

**Never call `process.env.X` outside this file.** To add a variable:

1. Add it to `envVarsSchema` with the right type/default.
2. Map it onto the exported `config` object (camelCase key).
3. Add it to `development.env` (and the deployment environment).

Consume it as `import config from '../../config/index.ts'` → `config.databaseUrl`.

### 4.7 Errors and responses

| Utility                                                                      | Use                                                      |
| ---------------------------------------------------------------------------- | -------------------------------------------------------- |
| [ApiError](src/shared/utils/ApiError.ts)                                     | `throw new ApiError(message, statusCode, isOperational)` |
| [ApiResponse](src/shared/utils/ApiResponse.ts)                               | `ApiResponse.success(message, data)` in controllers      |
| [catchAsync](src/shared/utils/catchAsync.ts)                                 | wraps every async controller                             |
| [errorHandler.middleware](src/shared/middlewares/errorHandler.middleware.ts) | terminal error chain — registered last in `app.ts`       |

The chain in [src/app.ts](src/app.ts) is: routes → 404 handler → `errorConverter`
(normalizes anything into an `ApiError` and reports to Sentry) → `errorHandler`
(masks non-operational errors in production, adds `stack` in development).

Use `logger` from [src/config/logger.ts](src/config/logger.ts) — not `console.log` —
for anything that should survive into `logs/combined.log` / `logs/errors.log`.

### 4.8 Middleware order in `app.ts`

The order in [src/app.ts](src/app.ts) is deliberate; preserve it when adding to it:

1. `morgan` request logging
2. `cors`, `helmet`, `trust proxy`
3. `rateLimit`
4. `app.all('/api/v1/auth/*', toNodeHandler(auth))` — **before** `express.json()`,
   because better-auth reads the raw request stream itself
5. `express.json()`
6. Swagger UI at `/api`
7. `/`, `/health`, then `/api/v1` routes
8. 404 handler
9. `errorConverter`, `errorHandler`

New body-parsing-dependent middleware goes after step 5. New error middleware
goes after step 9 only if it re-delegates; otherwise it will never run.

### 4.9 API docs

OpenAPI definitions are YAML files in [src/shared/schemas/](src/shared/schemas/),
assembled in [src/config/swagger.ts](src/config/swagger.ts) and served at `/api`.
When you add a feature, add a `<feature>Route.yaml` and register it in both
`components.schemas` and the `apis` array.

---

## 5. TypeScript & style rules

Driven by [tsconfig.json](tsconfig.json) and [.prettierrc](.prettierrc):

- **Import extensions are mandatory and use `.ts`**, not `.js` and not extensionless:
  `import config from '../config/index.ts'`. This works because
  `rewriteRelativeImportExtensions` is enabled. Copying an extensionless import
  from other projects will fail at runtime under `tsx`/nodenext.
- `verbatimModuleSyntax` is on → type-only imports **must** use the `type`
  keyword: `import { type Request, type Response } from 'express'` or
  `import type { Request } from 'express'`.
- `erasableSyntaxOnly` is on → no `enum`, no parameter properties
  (`constructor(private x: string)`), no namespaces. Use `const` objects +
  union types instead of `enum`.
- `noUncheckedIndexedAccess` is on → indexing an array yields `T | undefined`.
  Destructure-and-check (`const [row] = await db.select()...; if (!row) …`)
  rather than asserting with `!`.
- `exactOptionalPropertyTypes` is on → `{ x?: string }` will not accept
  `x: undefined`. Omit the key instead of setting it to `undefined`.
- Prettier: single quotes, semicolons, trailing commas, 80 columns, 2-space indent.
- Avoid `any`. Where it is genuinely unavoidable, add the targeted
  `// eslint-disable-next-line @typescript-eslint/no-explicit-any` comment, as in
  `ApiResponse` and `catchAsync`.

---

## 6. Adding a new feature — checklist

For a feature called `lead`:

1. `src/db/schema/lead.schema.ts` — tables + relations; re-export from `db/schema/index.ts`.
2. `pnpm db:generate` → review generated SQL → `pnpm db:migrate`.
3. `src/shared/validations/lead.validation.ts` — Zod schemas + inferred types.
4. `src/services/lead/lead.service.ts` — business logic, DB queries, `ApiError` throws.
5. `src/controllers/v1/lead.controller.ts` — `catchAsync` handlers returning `ApiResponse.success`.
6. `src/routes/v1/lead.route.ts` — paths + `validate(...)` + handlers.
7. Register the router in `src/routes/v1/index.ts` under `defaultRoutes`.
8. `src/shared/schemas/leadRoute.yaml` — OpenAPI docs; wire into `config/swagger.ts`.
9. `pnpm typecheck && pnpm lint` before committing.

---

## 7. Known deviations to fix, not to copy

These exist in the current tree. Treat the conventions above as canonical and do
not imitate the following:

- [src/services/auth/auth.service.ts](src/services/auth/auth.service.ts) —
  `signUpService` / `signInService` hardcode `john.doe@example.com` placeholder
  credentials instead of reading `req.body`, and `signInService` calls an
  undefined `headers()` (never imported). Both need to take validated input from
  the request and use `fromNodeHeaders(req.headers)` like `getSessionService` does.
- [src/controllers/v1/auth.controller.ts](src/controllers/v1/auth.controller.ts) —
  `signUp` and `signIn` both respond with the message `'Get session successfully'`.
  Messages should describe the actual operation.
- [src/routes/v1/auth.route.ts](src/routes/v1/auth.route.ts) — `/me` is registered
  as `POST` and no route uses `validate(...)`.
- `app.all('/api/v1/auth/*', toNodeHandler(auth))` in [src/app.ts](src/app.ts)
  shadows the custom `/api/v1/auth` router; decide per-endpoint whether
  better-auth's built-in handler or the custom controller should own the path.
- Stray debug `console.log` calls remain in
  [src/config/index.ts](src/config/index.ts) and
  [src/shared/middlewares/errorHandler.middleware.ts](src/shared/middlewares/errorHandler.middleware.ts) —
  use `logger` instead.
- The Swagger title in [src/config/swagger.ts](src/config/swagger.ts) still reads
  "PortFolio BackendAPI" from a template project.
- `errorConverter`'s status-code expression
  (`error.statusCode || error instanceof ApiError ? 400 : 500`) is missing
  parentheses and never yields 500 for errors that carry a `statusCode`.
- [src/shared/middlewares/authenticate.middlewares.ts](src/shared/middlewares/authenticate.middlewares.ts)
  and [upload.middleware.ts](src/shared/middlewares/upload.middleware.ts) are
  fully commented-out Supabase/multer leftovers — rewrite against better-auth
  rather than uncommenting.

---

## 8. Working agreements

- Do not add dependencies without a clear need; prefer what is already installed.
- Do not reformat files you are not otherwise changing.
- Do not commit or push unless asked. Secrets stay in `*.env`, never in source.
- Run `pnpm typecheck` after any change touching types, schema, or config —
  `tsc` is `noEmit`, so type errors do not surface at runtime under `tsx`.
